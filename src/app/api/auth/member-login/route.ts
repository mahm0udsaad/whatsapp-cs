import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  setMemberSessionCookie,
  signMemberToken,
  verifyPassword,
} from "@/lib/member-auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = body.username?.trim();
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const { data: member } = await adminSupabaseClient
      .from("restaurant_members")
      .select("id, restaurant_id, password_hash")
      .eq("username", username)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const ok = await verifyPassword(password, member.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const { data: restaurant } = await adminSupabaseClient
      .from("restaurants")
      .select("owner_id")
      .eq("id", member.restaurant_id)
      .maybeSingle();

    if (!restaurant?.owner_id) {
      return NextResponse.json(
        { error: "Restaurant unavailable" },
        { status: 500 }
      );
    }

    const token = await signMemberToken({
      memberId: member.id,
      restaurantId: member.restaurant_id,
      ownerId: restaurant.owner_id,
    });

    await adminSupabaseClient
      .from("restaurant_members")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", member.id);

    const response = NextResponse.json({ ok: true });
    setMemberSessionCookie(response, token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
