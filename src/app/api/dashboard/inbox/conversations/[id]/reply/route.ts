/**
 * POST /api/dashboard/inbox/conversations/:id/reply
 *
 * Sends a manual WhatsApp reply from the web dashboard.
 *
 * Auth: Supabase cookie session.
 * Requires: caller is the active team_member assigned to the conversation
 *           (handler_mode must be 'human'), OR the restaurant owner.
 *
 * Body: { text: string }
 * Reply: { message }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/twilio";

interface ReplyBody {
  text?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as ReplyBody;
    const text = (body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    if (text.length > 4096) {
      return NextResponse.json(
        { error: "Message too long (max 4096 chars)" },
        { status: 400 }
      );
    }

    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select("id, restaurant_id, customer_phone, handler_mode, assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { data: member } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", conv.restaurant_id)
      .eq("is_active", true)
      .maybeSingle();

    const { data: restaurant } = await adminSupabaseClient
      .from("restaurants")
      .select("owner_id, twilio_phone_number")
      .eq("id", conv.restaurant_id)
      .maybeSingle();

    const isOwner = restaurant?.owner_id === user.id;

    if (!member && !isOwner) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    if (conv.handler_mode !== "human") {
      return NextResponse.json(
        {
          error:
            conv.handler_mode === "bot"
              ? "Conversation is delegated to the bot — stop the bot first"
              : "Conversation is not claimed — claim it first",
        },
        { status: 409 }
      );
    }

    if (!isOwner && conv.assigned_to !== member?.id) {
      return NextResponse.json(
        { error: "Conversation is claimed by another agent" },
        { status: 409 }
      );
    }

    // Resolve outbound sender number.
    let senderPhone: string | undefined;
    try {
      const { data: sender } = await adminSupabaseClient
        .from("whatsapp_senders")
        .select("phone_number")
        .eq("restaurant_id", conv.restaurant_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (sender?.phone_number) senderPhone = sender.phone_number as string;
    } catch {
      // fallthrough to twilio_phone_number
    }
    if (!senderPhone && restaurant?.twilio_phone_number) {
      senderPhone = restaurant.twilio_phone_number as string;
    }

    const nowIso = new Date().toISOString();

    // Insert message row first so realtime delivers it to the UI immediately.
    const { data: inserted, error: insertErr } = await adminSupabaseClient
      .from("messages")
      .insert({
        conversation_id: conv.id,
        role: "agent",
        content: text,
        message_type: "text",
        channel: "whatsapp",
        delivery_status: "queued",
        metadata: {
          source: "dashboard_inbox",
          sender_user_id: user.id,
          sender_team_member_id: member?.id ?? null,
        },
        created_at: nowIso,
      })
      .select("*")
      .maybeSingle();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: insertErr?.message || "Failed to persist message" },
        { status: 500 }
      );
    }

    // Send via Twilio.
    let twilioSid: string | null = null;
    try {
      const statusCallback = `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/api/webhooks/twilio/status`;
      twilioSid = await sendWhatsAppMessage(conv.customer_phone, text, {
        fromPhoneNumber: senderPhone,
        statusCallback,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Twilio send failed";
      await adminSupabaseClient
        .from("messages")
        .update({ delivery_status: "failed", error_message: msg })
        .eq("id", inserted.id);
      return NextResponse.json({ error: msg, messageId: inserted.id }, { status: 502 });
    }

    await adminSupabaseClient
      .from("messages")
      .update({ external_message_sid: twilioSid, delivery_status: "sent" })
      .eq("id", inserted.id);

    await adminSupabaseClient
      .from("conversations")
      .update({ last_message_at: nowIso })
      .eq("id", conv.id);

    return NextResponse.json({ message: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
