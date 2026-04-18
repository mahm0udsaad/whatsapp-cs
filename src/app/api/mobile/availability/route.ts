/**
 * PATCH /api/mobile/availability
 *
 * Body: { isAvailable: boolean }
 *
 * Flips team_members.is_available for EVERY active team_members row the
 * caller has. If the caller is a member of two tenants, both rows are flipped
 * together — the toggle is a device-local do-not-disturb, not a per-tenant one.
 *
 * Auth: Supabase cookie session. Caller must have at least one active
 * team_members row, else 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { isAvailable?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (typeof body.isAvailable !== "boolean") {
      return NextResponse.json(
        { error: "isAvailable (boolean) required" },
        { status: 400 }
      );
    }

    const { data: rows, error } = await adminSupabaseClient
      .from("team_members")
      .update({ is_available: body.isAvailable })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .select("id, restaurant_id, is_available");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No active team_members row for caller" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { updated: rows.length, isAvailable: body.isAvailable },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
