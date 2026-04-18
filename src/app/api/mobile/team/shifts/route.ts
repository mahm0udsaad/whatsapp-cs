/**
 * GET /api/mobile/team/shifts?weekStart=YYYY-MM-DD
 *
 * Manager-only. Returns the full team's shifts for a 7-day window starting at
 * `weekStart`. Edit-on-mobile is intentionally not supported — managers tap
 * "Edit on web" to go to /dashboard/shifts for CRUD.
 *
 * Shape: Array<{
 *   id: string;
 *   team_member_id: string;
 *   team_member_name: string | null;
 *   starts_at: string;
 *   ends_at: string;
 *   note: string | null;
 * }>
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const weekStart = request.nextUrl.searchParams.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json(
      { error: "weekStart (YYYY-MM-DD) required" },
      { status: 400 }
    );
  }

  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "Invalid weekStart" }, { status: 400 });
  }
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await adminSupabaseClient
    .from("agent_shifts")
    .select(
      "id, team_member_id, starts_at, ends_at, note, team_members(full_name)"
    )
    .eq("restaurant_id", restaurantId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((s) => {
    const tm = s.team_members as
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
    const name = Array.isArray(tm) ? tm[0]?.full_name ?? null : tm?.full_name ?? null;
    return {
      id: s.id,
      team_member_id: s.team_member_id,
      team_member_name: name,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      note: s.note,
    };
  });

  return NextResponse.json(rows);
}
