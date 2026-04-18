/**
 * GET /api/mobile/approvals
 *
 * Manager-only. Returns pending escalation orders for the caller's restaurant
 * so the Overview / Approvals screen can list them. The manager takes action
 * by tapping through to the conversation detail (existing claim/reply flows).
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data, error } = await adminSupabaseClient
    .from("orders")
    .select(
      "id, conversation_id, type, status, created_at, customer_phone, customer_name, summary"
    )
    .eq("restaurant_id", restaurantId)
    .eq("type", "escalation")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
