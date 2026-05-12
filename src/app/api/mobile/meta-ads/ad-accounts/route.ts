/**
 * GET  /api/mobile/meta-ads/ad-accounts         — list ad accounts for the connected Meta user
 * POST /api/mobile/meta-ads/ad-accounts          — select an ad account for this restaurant
 *   body: { ad_account_id: string, ad_account_name?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("user_access_token")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json(
      { error: "Not connected to Meta — connect first" },
      { status: 404 }
    );
  }

  const params = new URLSearchParams({
    fields: "id,name,account_status,currency,amount_spent",
    access_token: conn.user_access_token,
    limit: "50",
  });

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?${params.toString()}`
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

interface SelectBody {
  ad_account_id?: string;
  ad_account_name?: string;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: SelectBody;
  try {
    body = (await request.json()) as SelectBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.ad_account_id?.trim()) {
    return NextResponse.json({ error: "ad_account_id required" }, { status: 400 });
  }

  const { error } = await adminSupabaseClient
    .from("meta_ads_connections")
    .update({
      ad_account_id: body.ad_account_id.trim(),
      ad_account_name: body.ad_account_name?.trim() ?? null,
    })
    .eq("restaurant_id", restaurantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
