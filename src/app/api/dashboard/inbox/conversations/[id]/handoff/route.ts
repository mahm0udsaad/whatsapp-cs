/**
 * POST /api/dashboard/inbox/conversations/:id/handoff
 *
 * Switches handler_mode for an already-claimed conversation:
 *   - mode='bot'        → delegate to the AI bot (stop human, let bot respond)
 *   - mode='human'      → take over from the bot (stop bot, claim for yourself)
 *   - mode='unassigned' → release back to the shared queue
 *
 * Auth: Supabase cookie session.
 * Requires: caller is a member of the conversation's restaurant, OR the owner.
 *
 * Body: { mode: 'bot' | 'human' | 'unassigned' }
 * Reply: { conversation }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { catchUpAIReplyIfNeeded } from "@/lib/ai-reply-catchup";

interface HandoffBody {
  mode?: "bot" | "human" | "unassigned";
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

    const body = (await request.json().catch(() => ({}))) as HandoffBody;
    const mode = body.mode;
    if (mode !== "bot" && mode !== "human" && mode !== "unassigned") {
      return NextResponse.json(
        { error: "mode must be 'bot', 'human', or 'unassigned'" },
        { status: 400 }
      );
    }

    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select("id, restaurant_id")
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
      .select("owner_id")
      .eq("id", conv.restaurant_id)
      .maybeSingle();

    const isOwner = restaurant?.owner_id === user.id;

    if (!member && !isOwner) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    // Use p_force=true so this overrides any existing assignment.
    const { data: result, error } = await supabase.rpc("claim_conversation", {
      p_conversation_id: id,
      p_mode: mode,
      p_team_member_id: member?.id ?? null,
      p_force: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (mode === "bot") {
      void catchUpAIReplyIfNeeded(id).catch((err) =>
        console.error("[dashboard/handoff] catchUpAIReplyIfNeeded error:", err)
      );
    }

    return NextResponse.json({ conversation: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
