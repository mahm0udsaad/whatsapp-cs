import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { hashPassword } from "@/lib/member-auth";
import {
  getCurrentSessionContext,
  getRestaurantForUserId,
} from "@/lib/tenant";

async function authorizeOwner(memberId: string) {
  const session = await getCurrentSessionContext();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.memberId) {
    return {
      error: NextResponse.json(
        { error: "Only the owner can manage team members" },
        { status: 403 }
      ),
    };
  }

  const restaurant = await getRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    return {
      error: NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      ),
    };
  }

  const { data: member } = await adminSupabaseClient
    .from("restaurant_members")
    .select("id, restaurant_id")
    .eq("id", memberId)
    .maybeSingle();

  if (!member || member.restaurant_id !== restaurant.id) {
    return {
      error: NextResponse.json({ error: "Member not found" }, { status: 404 }),
    };
  }

  return { restaurantId: restaurant.id };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = await authorizeOwner(id);
  if ("error" in auth) return auth.error;

  let body: { password?: string; full_name?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    updates.password_hash = await hashPassword(body.password);
  }

  if (body.full_name !== undefined) {
    updates.full_name =
      typeof body.full_name === "string" && body.full_name.trim()
        ? body.full_name.trim()
        : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await adminSupabaseClient
    .from("restaurant_members")
    .update(updates)
    .eq("id", id)
    .select("id, username, full_name, last_login_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = await authorizeOwner(id);
  if ("error" in auth) return auth.error;

  const { error } = await adminSupabaseClient
    .from("restaurant_members")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
