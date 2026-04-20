/**
 * GET  /api/mobile/team/members/:id/notes — list notes for an agent, newest first
 * POST /api/mobile/team/members/:id/notes — body: { body: string }
 *
 * RLS gates everything: only admins of the tenant can read/write, only the
 * author can delete their own note (owner can delete any). We still
 * double-check the team_member belongs to the caller's tenant to avoid a
 * 500 from a mismatched id.
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
    .from("team_member_notes")
    .select("id, body, author_user_id, created_at")
    .eq("team_member_id", teamMemberId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(
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

  let body: { body?: string };
  try {
    body = (await request.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = body.body?.trim();
  if (!text) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: "body must be 4000 chars or fewer" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("team_member_notes")
    .insert({
      restaurant_id: restaurantId,
      team_member_id: teamMemberId,
      author_user_id: user.id,
      body: text,
    })
    .select("id, body, author_user_id, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
