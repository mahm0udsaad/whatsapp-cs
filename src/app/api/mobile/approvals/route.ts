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
      "id, conversation_id, type, status, created_at, customer_phone, customer_name, details, escalation_reason, priority, extracted_intent"
    )
    .eq("restaurant_id", restaurantId)
    .eq("type", "escalation")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Two distinct fields for the mobile card:
  //   message    → the actual customer message that triggered the escalation
  //                (orders.details), so the owner sees WHAT the customer said
  //                and can decide at a glance.
  //   reasonCode → the machine category (orders.escalation_reason), rendered
  //                by the client as a colored tag ("فجوة معرفية", "تأخر الرد",
  //                etc.). Kept separate so the UI stays readable.
  //
  // `summary` is kept for backwards-compat with older builds — same value as
  // `message` so the card never shows an empty body.
  const rows = (data ?? []).map((o) => ({
    id: o.id,
    conversation_id: o.conversation_id,
    type: o.type,
    status: o.status,
    created_at: o.created_at,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    priority: o.priority,
    message: o.details ?? null,
    reasonCode: o.escalation_reason ?? null,
    summary: o.details ?? o.escalation_reason ?? null,
    extracted_intent: o.extracted_intent ?? null,
  }));

  return NextResponse.json(rows);
}
