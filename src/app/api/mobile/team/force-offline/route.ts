/**
 * POST /api/mobile/team/force-offline
 *
 * Manager-only. Flips a target team member's is_available to false. The target
 * must be in the same tenant as the caller.
 *
 * Body: { teamMemberId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { assertRestaurantAdmin } from "@/lib/mobile-auth";

interface Body {
  teamMemberId?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const teamMemberId = body.teamMemberId?.trim();
  if (!teamMemberId) {
    return NextResponse.json(
      { error: "teamMemberId required" },
      { status: 400 }
    );
  }

  // Look up target to get its restaurant_id.
  const { data: target, error: fetchErr } = await adminSupabaseClient
    .from("team_members")
    .select("id, restaurant_id, is_available")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json(
      { error: "Team member not found" },
      { status: 404 }
    );
  }

  // Confirm the caller has admin rights on the target's tenant.
  const ctx = await assertRestaurantAdmin(target.restaurant_id);
  if (ctx instanceof NextResponse) return ctx;

  const { error: updateErr } = await adminSupabaseClient
    .from("team_members")
    .update({ is_available: false })
    .eq("id", teamMemberId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: teamMemberId, is_available: false });
}
