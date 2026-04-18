/**
 * POST /api/mobile/inbox/claim
 *
 * Mobile-facing equivalent of /api/dashboard/inbox/claim. Identical semantics;
 * split so the mobile app's keys / error surfaces can evolve independently.
 *
 * Body: { conversationId: string, mode: 'human' | 'bot' }
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

    const { data: claimed, error } = await supabase.rpc("claim_conversation", {
      p_conversation_id: conversationId,
      p_mode: mode,
      p_team_member_id: member.id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If the conversation was just handed to the bot AND there's an
    // unanswered customer message, kick off an AI reply now — otherwise the
    // customer waits until their next message to get a response.
    if (mode === "bot") {
      void catchUpAIReplyIfNeeded(conversationId).catch((err) =>
        console.error("[mobile/claim] catchUpAIReplyIfNeeded error:", err)
      );
    }

    return NextResponse.json({ conversation: claimed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
