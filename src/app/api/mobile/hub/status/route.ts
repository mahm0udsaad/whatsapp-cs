/**
 * GET    /api/mobile/hub/status  — is this restaurant paired with Nehgz Hub?
 * DELETE /api/mobile/hub/status  — unpair (drop the stored token).
 */

import { NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { DEMO_MERCHANT, isDemoRestaurant } from "@/lib/hub-demo";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  // Review-demo restaurants always report paired with seeded merchant info so
  // the App Store reviewer can navigate the Hub gateway without a real
  // Nehgz Hub subscription.
  if (isDemoRestaurant(restaurantId)) {
    return NextResponse.json({
      paired: true,
      merchant: DEMO_MERCHANT,
      pairedAt: new Date().toISOString(),
    });
  }

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

  // Demo restaurants are stateless — unpair is a no-op so the reviewer can
  // exercise the button without losing seeded data.
  if (isDemoRestaurant(restaurantId)) {
    return NextResponse.json({ ok: true });
  }

  await adminSupabaseClient
    .from("nehgz_hub_connections")
    .delete()
    .eq("restaurant_id", restaurantId);

  return NextResponse.json({ ok: true });
}
