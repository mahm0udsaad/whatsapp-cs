/**
 * GET /api/mobile/inbox/conversations/:id/messages
 *
 * Return ordered message history for a conversation the caller has access to.
 *
 * Auth: active team_members row for the conversation's restaurant.
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

    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select(
        "id, restaurant_id, customer_name, customer_phone, last_message_at, last_inbound_at, handler_mode, assigned_to"
      )
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
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    const { data: messages, error } = await adminSupabaseClient
      .from("messages")
      .select("id, role, content, message_type, metadata, created_at, delivery_status")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let assigneeName: string | null = null;
    if (conv.assigned_to) {
      const { data: assignee } = await adminSupabaseClient
        .from("team_members")
        .select("full_name")
        .eq("id", conv.assigned_to)
        .maybeSingle();
      assigneeName = (assignee?.full_name as string) || null;
    }

    return NextResponse.json({
      conversation: {
        id: conv.id,
        customer_name: conv.customer_name,
        customer_phone: conv.customer_phone,
        last_message_at: conv.last_message_at,
        last_inbound_at: conv.last_inbound_at,
        handler_mode: conv.handler_mode,
        assigned_to: conv.assigned_to,
        assignee_name: assigneeName,
        is_mine: conv.assigned_to === (member.id as string),
      },
      messages: messages ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
