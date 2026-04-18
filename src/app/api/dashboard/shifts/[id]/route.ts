import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getShiftOwnerContext } from "@/lib/shifts-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owner = await getShiftOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing } = await adminSupabaseClient
    .from("agent_shifts")
    .select(
      "id, restaurant_id, team_member_id, starts_at, ends_at, note"
    )
    .eq("id", id)
    .maybeSingle();

  const row = existing as {
    id: string;
    restaurant_id: string;
    team_member_id: string;
    starts_at: string;
    ends_at: string;
    note: string | null;
  } | null;

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!owner.isSuperAdmin && row.restaurant_id !== owner.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const updates: Record<string, unknown> = {};
  let nextTeamMemberId = row.team_member_id;
  let nextStartsAt = new Date(row.starts_at);
  let nextEndsAt = new Date(row.ends_at);

  if (typeof body.teamMemberId === "string") {
    nextTeamMemberId = body.teamMemberId;
    updates.team_member_id = body.teamMemberId;
  }
  if (typeof body.startsAt === "string") {
    const d = new Date(body.startsAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "invalid startsAt" }, { status: 400 });
    }
    nextStartsAt = d;
    updates.starts_at = d.toISOString();
  }
  if (typeof body.endsAt === "string") {
    const d = new Date(body.endsAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "invalid endsAt" }, { status: 400 });
    }
    nextEndsAt = d;
    updates.ends_at = d.toISOString();
  }
  if (typeof body.note === "string") {
    const n = body.note.trim();
    updates.note = n.length ? n.slice(0, 500) : null;
  } else if (body.note === null) {
    updates.note = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  if (nextEndsAt.getTime() <= nextStartsAt.getTime()) {
    return NextResponse.json(
      { error: "endsAt must be after startsAt" },
      { status: 400 }
    );
  }

  // Team member must belong to this restaurant + be active.
  if (updates.team_member_id) {
    const { data: tm } = await adminSupabaseClient
      .from("team_members")
      .select("id, is_active, restaurant_id")
      .eq("id", nextTeamMemberId)
      .maybeSingle();
    const tmRow = tm as {
      id: string;
      is_active: boolean;
      restaurant_id: string;
    } | null;
    if (!tmRow) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    if (tmRow.restaurant_id !== row.restaurant_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!tmRow.is_active) {
      return NextResponse.json(
        { error: "Team member is not active" },
        { status: 400 }
      );
    }
  }

  // Overlap guard (exclude this row).
  const { data: overlap } = await adminSupabaseClient
    .from("agent_shifts")
    .select("id")
    .eq("restaurant_id", row.restaurant_id)
    .eq("team_member_id", nextTeamMemberId)
    .lt("starts_at", nextEndsAt.toISOString())
    .gt("ends_at", nextStartsAt.toISOString())
    .neq("id", id)
    .limit(1);
  if (Array.isArray(overlap) && overlap.length > 0) {
    return NextResponse.json(
      { error: "يوجد جدول آخر لنفس الموظفة في نفس الوقت." },
      { status: 409 }
    );
  }

  const { data, error } = await adminSupabaseClient
    .from("agent_shifts")
    .update(updates)
    .eq("id", id)
    .select(
      "id, restaurant_id, team_member_id, starts_at, ends_at, note, created_at, created_by"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ shift: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owner = await getShiftOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing } = await adminSupabaseClient
    .from("agent_shifts")
    .select("id, restaurant_id")
    .eq("id", id)
    .maybeSingle();
  const row = existing as { id: string; restaurant_id: string } | null;
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!owner.isSuperAdmin && row.restaurant_id !== owner.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await adminSupabaseClient
    .from("agent_shifts")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
