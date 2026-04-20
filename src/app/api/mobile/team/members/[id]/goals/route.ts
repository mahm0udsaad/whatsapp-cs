/**
 * GET  /api/mobile/team/members/:id/goals — returns goal row or null if unset
 * PUT  /api/mobile/team/members/:id/goals — upsert. Body:
 *   { target_first_response_sec?: number|null, target_messages_per_day?: number|null }
 *   Pass null to clear. Absent key leaves the existing value unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

async function ensureMemberInTenant(
  teamMemberId: string,
  restaurantId: string
): Promise<boolean> {
  const { data } = await adminSupabaseClient
    .from("team_members")
    .select("id")
    .eq("id", teamMemberId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { id: teamMemberId } = await params;
  if (!(await ensureMemberInTenant(teamMemberId, restaurantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("team_member_goals")
    .select(
      "team_member_id, target_first_response_sec, target_messages_per_day, updated_at"
    )
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

interface PutBody {
  target_first_response_sec?: number | null;
  target_messages_per_day?: number | null;
}

function parseNullableInt(
  raw: unknown,
  key: string
): { value?: number | null; err?: string } {
  if (raw === undefined) return {};
  if (raw === null) return { value: null };
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
    return { err: `${key} must be a positive integer or null` };
  }
  return { value: Math.floor(raw) };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId, user } = ctx;

  const { id: teamMemberId } = await params;
  if (!(await ensureMemberInTenant(teamMemberId, restaurantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const frt = parseNullableInt(
    body.target_first_response_sec,
    "target_first_response_sec"
  );
  const mpd = parseNullableInt(
    body.target_messages_per_day,
    "target_messages_per_day"
  );
  if (frt.err || mpd.err) {
    return NextResponse.json(
      { error: frt.err ?? mpd.err },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  // Read existing to preserve keys the caller omitted.
  const { data: existing } = await supabase
    .from("team_member_goals")
    .select("target_first_response_sec, target_messages_per_day")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();

  const payload = {
    team_member_id: teamMemberId,
    restaurant_id: restaurantId,
    target_first_response_sec:
      frt.value !== undefined
        ? frt.value
        : existing?.target_first_response_sec ?? null,
    target_messages_per_day:
      mpd.value !== undefined
        ? mpd.value
        : existing?.target_messages_per_day ?? null,
    updated_at: new Date().toISOString(),
    updated_by_user_id: user.id,
  };

  const { data, error } = await supabase
    .from("team_member_goals")
    .upsert(payload, { onConflict: "team_member_id" })
    .select(
      "team_member_id, target_first_response_sec, target_messages_per_day, updated_at"
    )
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
