/**
 * GET /api/mobile/kpis/today
 *
 * Manager-only. Returns the Overview screen's KPIs in a single round trip.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  // Call with caller's session so auth.uid() matches inside the RPC.
  const supabase = await createServerSupabaseClient();
  const [{ data, error }, unreadRes] = await Promise.all([
    supabase.rpc("restaurant_kpis_today", {
      p_restaurant_id: restaurantId,
    }),
    supabase
      .from("conversations")
      .select("id", { head: true, count: "exact" })
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
      .is("archived_at", null)
      .gt("unread_count", 0),
  ]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (unreadRes.error) {
    return NextResponse.json({ error: unreadRes.error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    unassignedCount: row?.unassigned_count ?? 0,
    humanActiveCount: row?.human_active_count ?? 0,
    botActiveCount: row?.bot_active_count ?? 0,
    expiredCount: row?.expired_count ?? 0,
    unreadCount: unreadRes.count ?? 0,
    ordersPendingCount: row?.orders_pending_count ?? 0,
    agentsOnShiftCount: row?.agents_on_shift_count ?? 0,
  });
}
