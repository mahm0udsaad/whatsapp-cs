/**
 * GET  /api/mobile/meta-ads/status    — check connection state
 * DELETE /api/mobile/meta-ads/status  — disconnect (remove token from DB)
 */

import { NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select(
      "ad_account_id, ad_account_name, connected_at, expires_at, page_id, page_name, instagram_account_id, instagram_username"
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ connected: false, accountSelected: false, pageSelected: false });
  }

  return NextResponse.json({
    connected: true,
    accountSelected: Boolean(data.ad_account_id),
    adAccountId: data.ad_account_id,
    adAccountName: data.ad_account_name,
    connectedAt: data.connected_at,
    expiresAt: data.expires_at,
    pageSelected: Boolean(data.page_id),
    pageId: data.page_id,
    pageName: data.page_name,
    instagramAccountId: data.instagram_account_id,
    instagramUsername: data.instagram_username,
  });
}

export async function DELETE() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  await adminSupabaseClient
    .from("meta_ads_connections")
    .delete()
    .eq("restaurant_id", restaurantId);

  return NextResponse.json({ ok: true });
}
