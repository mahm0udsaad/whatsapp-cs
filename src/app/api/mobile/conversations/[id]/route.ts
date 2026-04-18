/**
 * GET /api/mobile/conversations/:id
 *
 * Thin tenant-scoped read for the mobile agent console.
 *
 * The `:id` param can be one of:
 *   - a raw conversation UUID
 *   - `by-order/<orderId>` — resolves the conversation via orders.conversation_id
 *
 * Returns:
 *   {
 *     conversation: { id, customer_name, customer_phone, bot_paused },
 *     messages: Message[] (most recent 50, ascending),
 *     order: Order | null  (the linked order, if resolved by-order, else null)
 *   }
 *
 * Auth: caller must be authenticated and an active team_members row in the
 * conversation's tenant, else 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
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

    // Resolve conversation
    let conversationId: string;
    let order:
      | {
          id: string;
          ai_draft_reply: string | null;
          rekaz_booking_url: string | null;
          conversation_id: string | null;
          restaurant_id: string;
        }
      | null = null;

    if (id.startsWith("by-order/")) {
      const orderId = id.slice("by-order/".length);
      const { data: ord, error: ordErr } = await adminSupabaseClient
        .from("orders")
        .select(
          "id, conversation_id, ai_draft_reply, rekaz_booking_url, restaurant_id"
        )
        .eq("id", orderId)
        .maybeSingle();
      if (ordErr) {
        return NextResponse.json({ error: ordErr.message }, { status: 500 });
      }
      if (!ord || !ord.conversation_id) {
        return NextResponse.json(
          { error: "Order or conversation not found" },
          { status: 404 }
        );
      }
      order = ord;
      conversationId = ord.conversation_id;
    } else {
      conversationId = id;
    }

    const { data: conv, error: convErr } = await adminSupabaseClient
      .from("conversations")
      .select("id, customer_name, customer_phone, bot_paused, restaurant_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 500 });
    }
    if (!conv) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Tenant membership check
    const { data: member, error: memberErr } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", conv.restaurant_id)
      .eq("is_active", true)
      .maybeSingle();
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    const { data: messages, error: msgErr } = await adminSupabaseClient
      .from("messages")
      .select(
        "id, direction, content, message_type, media_url, created_at"
      )
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(50);
    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        conversation: {
          id: conv.id,
          customer_name: conv.customer_name,
          customer_phone: conv.customer_phone,
          bot_paused: conv.bot_paused,
        },
        messages: messages ?? [],
        order,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
