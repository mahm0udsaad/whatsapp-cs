import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  getShiftMemberContext,
  getShiftOwnerContext,
} from "@/lib/shifts-auth";

/**
 * GET /api/dashboard/shifts?weekStart=YYYY-MM-DD
 * Returns agent_shifts rows in [weekStart, weekStart + 7d) plus team member metadata.
 * Any restaurant member can read.
 */
export async function GET(request: NextRequest) {
  const member = await getShiftMemberContext();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStartRaw = request.nextUrl.searchParams.get("weekStart");
  if (!weekStartRaw || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)) {
    return NextResponse.json(
      { error: "weekStart must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const start = new Date(`${weekStartRaw}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "invalid weekStart" }, { status: 400 });
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const { data, error } = await adminSupabaseClient
    .from("agent_shifts")
    .select(
      "id, restaurant_id, team_member_id, starts_at, ends_at, note, created_at, created_by"
    )
    .eq("restaurant_id", member.restaurantId)
    .gte("ends_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: members } = await adminSupabaseClient
    .from("team_members")
    .select("id, full_name, role, is_active, is_available")
    .eq("restaurant_id", member.restaurantId);

  return NextResponse.json({
    shifts: data ?? [],
    members: members ?? [],
  });
}

/**
 * POST /api/dashboard/shifts
 * Body: { teamMemberId, startsAt, endsAt, note? }
 * Owner-only. Rejects overlapping shifts for the same team member.
 */
export async function POST(request: NextRequest) {
  const owner = await getShiftOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    teamMemberId?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    note?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const teamMemberId =
    typeof body.teamMemberId === "string" ? body.teamMemberId : null;
  const startsAtStr = typeof body.startsAt === "string" ? body.startsAt : null;
  const endsAtStr = typeof body.endsAt === "string" ? body.endsAt : null;
  const note = typeof body.note === "string" ? body.note.trim() : null;

  if (!teamMemberId || !startsAtStr || !endsAtStr) {
    return NextResponse.json(
      { error: "teamMemberId, startsAt, endsAt are required" },
      { status: 400 }
    );
  }

  const startsAt = new Date(startsAtStr);
  const endsAt = new Date(endsAtStr);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json(
      { error: "startsAt/endsAt must be valid ISO timestamps" },
      { status: 400 }
    );
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json(
      { error: "endsAt must be after startsAt" },
      { status: 400 }
    );
  }

  // Window guard: within current week or next 4 weeks from "now".
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + 35);
  const pastFloor = new Date(now);
  pastFloor.setUTCDate(pastFloor.getUTCDate() - 7);
  if (startsAt < pastFloor || endsAt > horizon) {
    return NextResponse.json(
      { error: "Shift window is outside the editable range" },
      { status: 400 }
    );
  }

  // Team member must be active AND belong to this restaurant.
  const { data: tm } = await adminSupabaseClient
    .from("team_members")
    .select("id, is_active, restaurant_id, full_name")
    .eq("id", teamMemberId)
    .maybeSingle();
  const tmRow = tm as {
    id: string;
    is_active: boolean;
    restaurant_id: string;
    full_name: string | null;
  } | null;
  if (!tmRow) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
  if (tmRow.restaurant_id !== owner.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!tmRow.is_active) {
    return NextResponse.json(
      { error: "Team member is not active" },
      { status: 400 }
    );
  }

  // Overlap guard (tstzrange + && overlap semantics).
  const { data: overlap } = await adminSupabaseClient
    .from("agent_shifts")
    .select("id")
    .eq("restaurant_id", owner.restaurantId)
    .eq("team_member_id", teamMemberId)
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);
  if (Array.isArray(overlap) && overlap.length > 0) {
    return NextResponse.json(
      { error: "يوجد جدول آخر لنفس الموظفة في نفس الوقت." },
      { status: 409 }
    );
  }

  const { data, error } = await adminSupabaseClient
    .from("agent_shifts")
    .insert({
      restaurant_id: owner.restaurantId,
      team_member_id: teamMemberId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      note: note && note.length > 0 ? note.slice(0, 500) : null,
      created_by: owner.userId,
    })
    .select(
      "id, restaurant_id, team_member_id, starts_at, ends_at, note, created_at, created_by"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ shift: data }, { status: 201 });
}
