/**
 * POST /api/mobile/inbox/reassign
 *
 * Manager-only. Routes through claim_conversation() with p_force=true to
 * either:
 *   - assign the conversation to a specific team member (assignToTeamMemberId)
 *   - force the conversation to bot mode              (forceBot: true)
 *   - return the conversation to the shared queue      (unassign: true)
 *
 * Body: {
 *   conversationId: string,
 *   assignToTeamMemberId?: string,
 *   forceBot?: boolean,
 *   unassign?: boolean
 * }
 *
 * Exactly one target must be specified.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

interface ReassignBody {
  conversationId?: string;
  assignToTeamMemberId?: string;
  forceBot?: boolean;
  unassign?: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ReassignBody;
  const conversationId = body.conversationId?.trim();
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 }
    );
  }

  const targets = [
    !!body.assignToTeamMemberId,
    !!body.forceBot,
    !!body.unassign,
  ].filter(Boolean).length;
  if (targets !== 1) {
    return NextResponse.json(
      {
        error:
          "Exactly one of assignToTeamMemberId | forceBot | unassign required",
      },
      { status: 400 }
    );
  }

  // Locate the conversation to check tenant.
  const { data: conv } = await adminSupabaseClient
    .from("conversations")
    .select("id, restaurant_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Admin-gate.
  const { data: isAdmin } = await adminSupabaseClient.rpc(
    "is_restaurant_admin",
    { p_restaurant_id: conv.restaurant_id, p_user_id: user.id }
  );
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: manager access required" },
      { status: 403 }
    );
  }

  // Resolve the actor's team_member id (used as p_team_member_id for schema
  // compatibility; the RPC picks the correct audit target internally).
  const { data: actorTm } = await adminSupabaseClient
    .from("team_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("restaurant_id", conv.restaurant_id)
    .eq("is_active", true)
    .order("role", { ascending: true }) // admins sort before agents alphabetically
    .limit(1)
    .maybeSingle();

  const mode = body.forceBot
    ? "bot"
    : body.unassign
    ? "unassigned"
    : "human";

  const { data: claimed, error } = await supabase.rpc("claim_conversation", {
    p_conversation_id: conversationId,
    p_mode: mode,
    p_team_member_id: actorTm?.id ?? null,
    p_force: true,
    p_assign_to_team_member_id: body.assignToTeamMemberId ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ conversation: claimed });
}
