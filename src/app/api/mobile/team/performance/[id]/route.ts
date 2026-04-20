/**
 * GET /api/mobile/team/performance/:id?from=ISO&to=ISO
 *
 * Manager-only. Detail view for a single team member — daily series for the
 * line chart and a 7x24 heatmap of message activity. Wraps
 * `agent_performance_detail` RPC which returns both in one JSON blob.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

function defaultWindow(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { id: teamMemberId } = await params;
  if (!teamMemberId) {
    return NextResponse.json(
      { error: "team_member id required" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const def = defaultWindow();
  const fromRaw = searchParams.get("from") ?? def.from;
  const toRaw = searchParams.get("to") ?? def.to;
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  if (from.getTime() >= to.getTime()) {
    return NextResponse.json(
      { error: "'from' must be before 'to'" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("agent_performance_detail", {
    p_restaurant_id: restaurantId,
    p_team_member_id: teamMemberId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) {
    // The RPC raises with SQLSTATE 42501 on forbidden — surface as 403.
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // RPC returns JSON with { daily: [...], heatmap: [...] }.
  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    ...(data ?? { daily: [], heatmap: [] }),
  });
}
