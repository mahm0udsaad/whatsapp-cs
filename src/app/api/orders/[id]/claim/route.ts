/**
 * POST /api/orders/:id/claim
 *
 * Responsibilities:
 *   - Atomically claim an unclaimed escalation order for the calling team
 *     member, via the public.claim_escalation(order_id, team_member_id) RPC.
 *   - On successful claim, flip the associated conversation to bot-paused AND
 *     record the assignment, so the AI reply worker stops drafting on this
 *     thread.
 *
 * Security / tenancy:
 *   - The caller must be a Supabase-authenticated user (cookie session).
 *   - We resolve the caller's team_members row by (user_id, restaurant_id of
 *     the order). No team_member row for that tenant => 403.
 *   - The claim_escalation RPC itself enforces that:
 *       * the team_member belongs to the tenant of the order
 *       * auth.uid() matches the team_member.user_id (unless the owner)
 *     so a user in tenant A cannot claim an order in tenant B even if they
 *     pass a random team_member_id.
 *
 * Responses:
 *   - 200 { order, claimedAt }
 *   - 401 unauthenticated
 *   - 403 no team_members row in this tenant
 *   - 404 order not found
 *   - 409 already claimed or ineligible (RPC returned null)
 *
 * NOTE: The bot_paused flip is performed here and NOT duplicated in any
 * other handler. Downstream workers (see src/lib/ai-reply-jobs.ts) already
 * short-circuit when conversations.bot_paused = true.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
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
      return NextResponse.json({ error: "Order id required" }, { status: 400 });
    }

    // 1. Load the order to get its tenant
    const { data: order, error: orderErr } = await adminSupabaseClient
      .from("orders")
      .select("id, restaurant_id, conversation_id, assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. Resolve this user's team_member row in that tenant
    const { data: member, error: memberErr } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", order.restaurant_id)
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

    // 3. Atomic claim via RPC. The RPC itself re-verifies auth.uid() ↔ member.
    //    We use the user-session client (not admin) so auth.uid() is set.
    const { data: claimed, error: claimErr } = await supabase.rpc(
      "claim_escalation",
      { p_order_id: id, p_team_member_id: member.id }
    );

    if (claimErr) {
      return NextResponse.json({ error: claimErr.message }, { status: 500 });
    }

    if (!claimed) {
      return NextResponse.json(
        { error: "Order already claimed or ineligible" },
        { status: 409 }
      );
    }

    const claimedRow = Array.isArray(claimed) ? claimed[0] : claimed;

    // 4. Pause bot + assign the conversation (admin client: side-effects on a
    //    row in the same tenant, RLS-equivalent because we already proved
    //    membership above).
    if (order.conversation_id) {
      const now = new Date().toISOString();
      const { error: convErr } = await adminSupabaseClient
        .from("conversations")
        .update({
          bot_paused: true,
          assigned_to: member.id,
          assigned_at: now,
        })
        .eq("id", order.conversation_id);
      if (convErr) {
        console.error(
          `[orders/claim] failed to pause bot for conversation ${order.conversation_id}:`,
          convErr.message
        );
        // Don't fail the claim — the claim is already durable in the DB.
      }
    }

    return NextResponse.json(
      {
        order: claimedRow,
        claimedAt: claimedRow?.claimed_at ?? new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
