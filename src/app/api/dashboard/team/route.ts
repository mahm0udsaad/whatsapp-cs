import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { hashPassword } from "@/lib/member-auth";
import {
  getCurrentSessionContext,
  getRestaurantForUserId,
} from "@/lib/tenant";

const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

export async function GET() {
  const session = await getCurrentSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.memberId) {
    return NextResponse.json(
      { error: "Only the owner can manage team members" },
      { status: 403 }
    );
  }

  const restaurant = await getRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const { data, error } = await adminSupabaseClient
    .from("restaurant_members")
    .select("id, username, full_name, last_login_at, created_at")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.memberId) {
    return NextResponse.json(
      { error: "Only the owner can create team members" },
      { status: 403 }
    );
  }

  const restaurant = await getRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  let body: { username?: string; password?: string; full_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = body.full_name?.trim() || null;

  if (!username || !USERNAME_RE.test(username)) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-32 characters: lowercase letters, digits, dot, dash, or underscore",
      },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const password_hash = await hashPassword(password);

  const { data, error } = await adminSupabaseClient
    .from("restaurant_members")
    .insert({
      restaurant_id: restaurant.id,
      username,
      password_hash,
      full_name: fullName,
      created_by: session.ownerId,
    })
    .select("id, username, full_name, last_login_at, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data }, { status: 201 });
}
