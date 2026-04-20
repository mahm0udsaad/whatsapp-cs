/**
 * GET /api/mobile/team/performance?from=ISO&to=ISO
 *
 * Manager-only. Returns one row per team member for the [from, to) window
 * with Phase-1 performance metrics. Uses the `team_performance` RPC, which
 * runs inside the caller's session so auth.uid() matches the admin check.
 *
 * `from` / `to` are optional; default to the current calendar month in UTC.
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

function parseIsoParam(
  raw: string | null,
  fallback: string
): { iso: string; err?: undefined } | { iso?: undefined; err: string } {
  if (!raw) return { iso: fallback };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { err: `invalid date: ${raw}` };
  }
  return { iso: d.toISOString() };
}

export async function GET(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { searchParams } = new URL(request.url);
  const def = defaultWindow();
  const fromParsed = parseIsoParam(searchParams.get("from"), def.from);
  const toParsed = parseIsoParam(searchParams.get("to"), def.to);
  if (fromParsed.err || toParsed.err) {
    return NextResponse.json(
      { error: fromParsed.err ?? toParsed.err },
      { status: 400 }
    );
  }
  const from = fromParsed.iso!;
  const to = toParsed.iso!;
  if (new Date(from).getTime() >= new Date(to).getTime()) {
    return NextResponse.json(
      { error: "'from' must be before 'to'" },
      { status: 400 }
    );
  }

  // Caller's session so auth.uid() matches inside the RPC.
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("team_performance", {
    p_restaurant_id: restaurantId,
    p_from: from,
    p_to: to,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    from,
    to,
    rows: Array.isArray(data) ? data : [],
  });
}
