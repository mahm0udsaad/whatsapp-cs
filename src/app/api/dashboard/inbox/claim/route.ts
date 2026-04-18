/**
 * POST /api/dashboard/inbox/claim
 *
 * Claim a conversation from the dashboard. First writer wins — if two agents
 * tap at the same time, the RPC returns whichever assignment already stuck.
 *
 * Auth:   Supabase cookie session. Caller must have an active team_members row
 *         for the conversation's restaurant.
 * Body:   { conversationId: string, mode: 'human' | 'bot' }
 * Reply:  { conversation }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { catchUpAIReplyIfNeeded } from "@/lib/ai-reply-catchup";

interface ClaimBody {
  conversationId?: string;
  mode?: "human" | "bot";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as ClaimBody;
    const conversationId = body.conversationId?.trim();
    const mode = body.mode;

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId required" }, { status: 400 });
    }
    if (mode !== "human" && mode !== "bot") {
      return NextResponse.json({ error: "mode must be 'human' or 'bot'" }, { status: 400 });
    }

    // Resolve the conversation's restaurant so we can find the caller's team_member row.
    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select("id, restaurant_id")
      .eq("id", conversationId)
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

    // Use the caller's session so auth.uid() matches inside the RPC.
    const { data: claimed, error } = await supabase.rpc("claim_conversation", {
      p_conversation_id: conversationId,
      p_mode: mode,
      p_team_member_id: member.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Catch-up AI reply for any pending customer message (the webhook skipped
    // it when handler_mode was still human/unassigned at arrival time).
    if (mode === "bot") {
      void catchUpAIReplyIfNeeded(conversationId).catch((err) =>
        console.error("[dashboard/claim] catchUpAIReplyIfNeeded error:", err)
      );
    }

    return NextResponse.json({ conversation: claimed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
