/**
 * POST /api/mobile/ai/toggle
 *
 * Body: { enabled: boolean }
 *
 * Flips restaurants.ai_enabled for the caller's tenant and appends an audit
 * row to ai_kill_switch_log. Manager-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

interface ToggleBody {
  enabled?: boolean;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { user, restaurantId } = ctx;

  const body = (await request.json().catch(() => ({}))) as ToggleBody;
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled (boolean) required" },
      { status: 400 }
    );
  }

  const { data: current, error: readErr } = await adminSupabaseClient
    .from("restaurants")
    .select("ai_enabled")
    .eq("id", restaurantId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const previous = current.ai_enabled ?? true;
  if (previous === body.enabled) {
    // Idempotent — no-op if already in the requested state.
    return NextResponse.json({ enabled: body.enabled, changed: false });
  }

  const { error: updateErr } = await adminSupabaseClient
    .from("restaurants")
    .update({ ai_enabled: body.enabled })
    .eq("id", restaurantId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { error: logErr } = await adminSupabaseClient
    .from("ai_kill_switch_log")
    .insert({
      restaurant_id: restaurantId,
      actor_user_id: user.id,
      enabled_from: previous,
      enabled_to: body.enabled,
    });
  if (logErr) {
    console.warn("[ai-toggle] audit insert failed:", logErr.message);
  }

  return NextResponse.json({ enabled: body.enabled, changed: true });
}
