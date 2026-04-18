/**
 * GET /api/mobile/ai/status
 *
 * Returns the current global AI kill-switch state for the caller's restaurant
 * plus a small set of context fields useful for the manager Profile/Overview
 * screen.
 *
 * Shape: { enabled, restaurantId, activeBotConversations, lastChangedAt }
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const [restaurantRes, countRes, logRes] = await Promise.all([
    adminSupabaseClient
      .from("restaurants")
      .select("id, ai_enabled")
      .eq("id", restaurantId)
      .maybeSingle(),
    adminSupabaseClient
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("handler_mode", "bot")
      .eq("status", "active"),
    adminSupabaseClient
      .from("ai_kill_switch_log")
      .select("created_at, enabled_to")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!restaurantRes.data) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return NextResponse.json({
    enabled: restaurantRes.data.ai_enabled ?? true,
    restaurantId,
    activeBotConversations: countRes.count ?? 0,
    lastChangedAt: logRes.data?.created_at ?? null,
  });
}
