import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getShiftOwnerContext } from "@/lib/shifts-auth";

/**
 * POST /api/dashboard/shifts/copy-last-week
 *
 * Copies the previous week's shifts forward by 7 calendar days (exact UTC
 * offset — no DST adjustment). Saudi Arabia does not observe DST, so a fixed
 * 7-day shift is correct year-round for this product.
 *
 * Skips any shifts that would overlap an existing row for the same
 * team_member in the destination week.
 *
 * Returns { copied, skipped }.
 */
export async function POST() {
  const owner = await getShiftOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sunday
  const thisWeekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - dow,
      0,
      0,
      0,
      0
    )
  );
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);

  // Pull all of last week's shifts for this tenant.
  const { data: lastWeekShifts, error: lastErr } = await adminSupabaseClient
    .from("agent_shifts")
    .select("team_member_id, starts_at, ends_at, note")
    .eq("restaurant_id", owner.restaurantId)
    .gte("starts_at", lastWeekStart.toISOString())
    .lt("starts_at", lastWeekEnd.toISOString());

  if (lastErr) {
    return NextResponse.json({ error: lastErr.message }, { status: 500 });
  }

  const source = (lastWeekShifts ?? []) as Array<{
    team_member_id: string;
    starts_at: string;
    ends_at: string;
    note: string | null;
  }>;

  if (source.length === 0) {
    return NextResponse.json({ copied: 0, skipped: 0 });
  }

  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setUTCDate(thisWeekEnd.getUTCDate() + 7);

  // Destination-week shifts for overlap lookup, grouped by team member.
  const { data: destExisting } = await adminSupabaseClient
    .from("agent_shifts")
    .select("team_member_id, starts_at, ends_at")
    .eq("restaurant_id", owner.restaurantId)
    .gte("ends_at", thisWeekStart.toISOString())
    .lt("starts_at", thisWeekEnd.toISOString());

  const destByMember = new Map<
    string,
    Array<{ start: number; end: number }>
  >();
  for (const r of (destExisting ?? []) as Array<{
    team_member_id: string;
    starts_at: string;
    ends_at: string;
  }>) {
    const list = destByMember.get(r.team_member_id) ?? [];
    list.push({
      start: new Date(r.starts_at).getTime(),
      end: new Date(r.ends_at).getTime(),
    });
    destByMember.set(r.team_member_id, list);
  }

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  let copied = 0;
  let skipped = 0;

  for (const shift of source) {
    const newStart = new Date(new Date(shift.starts_at).getTime() + WEEK_MS);
    const newEnd = new Date(new Date(shift.ends_at).getTime() + WEEK_MS);

    const existing = destByMember.get(shift.team_member_id) ?? [];
    const overlaps = existing.some(
      (r) => r.start < newEnd.getTime() && r.end > newStart.getTime()
    );
    if (overlaps) {
      skipped++;
      continue;
    }

    const { error } = await adminSupabaseClient.from("agent_shifts").insert({
      restaurant_id: owner.restaurantId,
      team_member_id: shift.team_member_id,
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
      note: shift.note,
      created_by: owner.userId,
    });
    if (error) {
      skipped++;
      continue;
    }

    // Track the newly-inserted block so subsequent iterations see it.
    existing.push({ start: newStart.getTime(), end: newEnd.getTime() });
    destByMember.set(shift.team_member_id, existing);
    copied++;
  }

  return NextResponse.json({ copied, skipped });
}
