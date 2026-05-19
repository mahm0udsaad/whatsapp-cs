/**
 * GET    /api/mobile/hub/status  — is this restaurant paired with Nehgz Hub?
 * DELETE /api/mobile/hub/status  — unpair (drop the stored token).
 */

import { NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data } = await adminSupabaseClient
    .from("nehgz_hub_connections")
    .select(
      "merchant_id, merchant_name, merchant_phone, merchant_timezone, merchant_locale, paired_at"
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ paired: false });
  }

  return NextResponse.json({
    paired: true,
    merchant: {
      id: data.merchant_id,
      name: data.merchant_name,
      phone: data.merchant_phone,
      timezone: data.merchant_timezone,
      locale: data.merchant_locale,
    },
    pairedAt: data.paired_at,
  });
}

export async function DELETE() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  await adminSupabaseClient
    .from("nehgz_hub_connections")
    .delete()
    .eq("restaurant_id", restaurantId);

  return NextResponse.json({ ok: true });
}
