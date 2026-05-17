/**
 * GET /api/mobile/meta-ads/campaigns
 *
 * Lists campaigns for the restaurant's selected Meta ad account, including
 * last-7-day insights (spend, impressions, clicks, reach, CTR) in a single
 * Graph API call via inline field expansion.
 */

import { NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("user_access_token, ad_account_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json(
      { error: "Not connected to Meta — connect first" },
      { status: 404 }
    );
  }
  if (!conn.ad_account_id) {
    return NextResponse.json(
      { error: "No ad account selected" },
      { status: 404 }
    );
  }

  // Fetch campaigns with:
  //   - last-7-day insights (headline metrics on the card)
  //   - lifetime insights (aliased) — total spend since launch
  //   - first ad's creative thumbnail (for the card preview)
  // All in a single Graph API call via inline field expansion.
  const params = new URLSearchParams({
    fields: [
      "id",
      "name",
      "status",
      "effective_status",
      "objective",
      "daily_budget",
      "lifetime_budget",
      "start_time",
      "stop_time",
      "created_time",
      "insights.date_preset(last_7d){spend,impressions,clicks,reach,ctr}",
      "lifetime_insights:insights.date_preset(maximum){spend,impressions,reach}",
      "ads.limit(1){creative{thumbnail_url,image_url,object_story_spec}}",
    ].join(","),
    access_token: conn.user_access_token,
    limit: "50",
  });

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${conn.ad_account_id}/campaigns?${params.toString()}`
  );
  const data = (await res.json()) as {
    data?: unknown[];
    error?: { message: string };
  };

  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 502 });
  }

  return NextResponse.json(data.data ?? []);
}
