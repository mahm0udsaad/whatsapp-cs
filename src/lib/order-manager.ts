import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  triggerEscalationBroadcast,
  triggerReservationBroadcast,
} from "@/lib/escalation-broadcaster";
import { extractAndStoreOrderIntent } from "@/lib/extract-order-intent";

export interface CreateOrderInput {
  restaurantId: string;
  conversationId: string;
  customerPhone: string;
  customerName?: string | null;
  type: "reservation" | "escalation";
  details: string;
  /**
   * For `type === 'escalation'`: the AI-generated reply that was held back.
   * Populates `orders.ai_draft_reply` + `ai_draft_generated_at` so the agent
   * can see/approve/edit it in the inbox before sending.
   */
  aiDraftReply?: string | null;
  /** Machine-readable escalation reason tag (e.g. `'knowledge_gap'`). */
  escalationReason?: string | null;
  /** Defaults to `'normal'`. Schema enum: 'normal' | 'urgent'. */
  priority?: "normal" | "urgent";
}

export async function createOrder(input: CreateOrderInput): Promise<string | null> {
  const nowIso = new Date().toISOString();

  // Prevent duplicates: if a pending order of the same type already exists
  // for this conversation, update-in-place instead of inserting a new row.
  const { data: existing } = await adminSupabaseClient
    .from("orders")
    .select("id, ai_draft_reply, escalation_reason")
    .eq("conversation_id", input.conversationId)
    .eq("type", input.type)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {
      details: input.details,
      updated_at: nowIso,
    };
    // Only fill draft/reason if we have a new value AND the existing row is
    // empty — avoid clobbering a human edit on the row.
    if (input.aiDraftReply && !existing.ai_draft_reply) {
      patch.ai_draft_reply = input.aiDraftReply;
      patch.ai_draft_generated_at = nowIso;
    }
    if (input.escalationReason && !existing.escalation_reason) {
      patch.escalation_reason = input.escalationReason;
    }
    if (input.priority) {
      patch.priority = input.priority;
    }

    await adminSupabaseClient
      .from("orders")
      .update(patch)
      .eq("id", existing.id);
    return existing.id as string;
  }

  const insertRow: Record<string, unknown> = {
    restaurant_id: input.restaurantId,
    conversation_id: input.conversationId,
    customer_phone: input.customerPhone,
    customer_name: input.customerName ?? null,
    type: input.type,
    details: input.details,
    status: "pending",
  };

  if (input.aiDraftReply) {
    insertRow.ai_draft_reply = input.aiDraftReply;
    insertRow.ai_draft_generated_at = nowIso;
  }
  if (input.escalationReason) {
    insertRow.escalation_reason = input.escalationReason;
  }
  if (input.priority) {
    insertRow.priority = input.priority;
  }

  const { data, error } = await adminSupabaseClient
    .from("orders")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    console.error("[order-manager] Failed to create order:", error.message);
    return null;
  }

  const newId = data.id as string;

  // Fan a push out to on-duty agents for NEW orders. Fire-and-forget —
  // never blocks or throws upstream. Escalations get the "decision
  // needed" title/channel; reservations get the "new booking" one.
  if (input.type === "escalation") {
    void triggerEscalationBroadcast(newId);
  } else if (input.type === "reservation") {
    void triggerReservationBroadcast(newId);
  }

  // AI extraction: fill orders.extracted_intent in the background so the
  // mobile approvals widget can render a structured summary (what the
  // customer provided vs. what's missing) instead of the raw message.
  // Non-fatal — if Gemini is unavailable or rate-limited the column stays
  // null and the UI falls back to the plain message.
  void extractAndStoreOrderIntent({
    orderId: newId,
    conversationId: input.conversationId,
    fallbackMessage: input.details,
    escalationReason: input.escalationReason ?? null,
  });

  return newId;
}
