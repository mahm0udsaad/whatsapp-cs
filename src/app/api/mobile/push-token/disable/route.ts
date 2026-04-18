/**
 * POST /api/mobile/push-token/disable
 *
 * Body: { deviceId: string, restaurantId: string }
 *
 * Soft-disables any user_push_tokens rows that belong to the calling team
 * member on the given device. Used at logout to stop push delivery without
 * deleting the row outright (so we still have an audit trail).
 *
 * Auth: Supabase cookie session. Caller must have an active team_members
 * row in the given restaurant, else 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { deviceId?: string; restaurantId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const deviceId = body.deviceId?.trim();
    const restaurantId = body.restaurantId?.trim();
    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId required" },
        { status: 400 }
      );
    }
    if (!restaurantId) {
      return NextResponse.json(
        { error: "restaurantId required" },
        { status: 400 }
      );
    }

    const { data: member, error: memberErr } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    const { data, error } = await adminSupabaseClient
      .from("user_push_tokens")
      .update({ disabled: true })
      .eq("team_member_id", member.id)
      .eq("device_id", deviceId)
      .select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { disabled: data?.length ?? 0 },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
