/**
 * Kick off an AI reply for the latest customer message on a conversation that
 * doesn't have an agent response yet.
 *
 * Used when a manager re-delegates a conversation to the bot AFTER a customer
 * message has already arrived (the webhook took the `human` or `unassigned`
 * branch at the time and didn't enqueue an AI job). Without this catch-up,
 * the customer would sit waiting until they send another message.
 *
 * No-op when:
 *   - No customer message exists
 *   - The latest customer message already has an agent reply after it
 *   - A job for that inbound_message_id is already queued/running
 *     (queueAIReplyJob upserts on inbound_message_id so duplicates coalesce)
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { queueAIReplyJob, processPendingAIReplyJobs } from "@/lib/ai-reply-jobs";

export async function catchUpAIReplyIfNeeded(
  conversationId: string
): Promise<{ queued: boolean; reason?: string }> {
  // 1. Load tenant + customer phone for the job payload.
  const { data: conv } = await adminSupabaseClient
    .from("conversations")
    .select("id, restaurant_id, customer_phone, handler_mode")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { queued: false, reason: "conversation_not_found" };
  if (conv.handler_mode !== "bot") {
    return { queued: false, reason: "not_bot_mode" };
  }

  // 2. Find the latest message on the conversation. If it's not a customer
  //    message, there's nothing to catch up on.
  const { data: latestMessages } = await adminSupabaseClient
    .from("messages")
    .select("id, role, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = latestMessages?.[0];
  if (!latest || latest.role !== "customer") {
    return { queued: false, reason: "no_pending_customer_message" };
  }

  // 3. Resolve the outbound sender number — prefer whatsapp_senders, fall back
  //    to restaurants.twilio_phone_number. Matches the webhook's resolution.
  let senderPhoneNumber: string | undefined;
  try {
    const { data: sender } = await adminSupabaseClient
      .from("whatsapp_senders")
      .select("phone_number")
      .eq("restaurant_id", conv.restaurant_id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (sender?.phone_number) senderPhoneNumber = sender.phone_number as string;
  } catch {
    // whatsapp_senders may not exist on older tenants; fall through.
  }
  if (!senderPhoneNumber) {
    const { data: restaurant } = await adminSupabaseClient
      .from("restaurants")
      .select("twilio_phone_number")
      .eq("id", conv.restaurant_id)
      .maybeSingle();
    senderPhoneNumber =
      (restaurant?.twilio_phone_number as string | undefined) || undefined;
  }

  // 4. Enqueue + process (upsert key is inbound_message_id so this is safe to
  //    retry). Fire-and-forget the processing; the caller shouldn't block.
  const result = await queueAIReplyJob({
    restaurantId: conv.restaurant_id,
    conversationId: conv.id,
    inboundMessageId: latest.id,
    customerPhone: conv.customer_phone,
    senderPhoneNumber,
  });
  if (!result.queued) return { queued: false, reason: "enqueue_failed" };

  void processPendingAIReplyJobs(1, latest.id).catch((err) =>
    console.error("[ai-reply-catchup] processPendingAIReplyJobs error:", err)
  );

  return { queued: true };
}
