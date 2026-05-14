/**
 * GET  /api/mobile/meta-ads/pages  — list Facebook Pages the user manages
 * POST /api/mobile/meta-ads/pages  — save selected page + fetch its linked Instagram account
 *   body: { page_id: string, page_name: string, page_access_token: string }
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
    return NextResponse.json({ error: "Not connected to Meta" }, { status: 404 });
  }

  const params = new URLSearchParams({
    fields: "id,name,category,fan_count,access_token,instagram_business_account{id,username}",
    access_token: conn.user_access_token,
    limit: "50",
  });

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?${params.toString()}`
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

interface SelectPageBody {
  page_id?: string;
  page_name?: string;
  page_access_token?: string;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: SelectPageBody;
  try {
    body = (await request.json()) as SelectPageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.page_id?.trim() || !body.page_access_token?.trim()) {
    return NextResponse.json({ error: "page_id and page_access_token required" }, { status: 400 });
  }

  // Fetch the linked Instagram Business account for this page
  let instagramAccountId: string | null = null;
  let instagramUsername: string | null = null;

  try {
    const igParams = new URLSearchParams({
      fields: "instagram_business_account{id,username}",
      access_token: body.page_access_token.trim(),
    });
    const igRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${body.page_id.trim()}?${igParams.toString()}`
    );
    const igData = (await igRes.json()) as {
      instagram_business_account?: { id: string; username: string };
    };
    if (igData.instagram_business_account) {
      instagramAccountId = igData.instagram_business_account.id;
      instagramUsername = igData.instagram_business_account.username;
    }
  } catch {
    // Instagram linking is optional — continue without it
  }

  const { error } = await adminSupabaseClient
    .from("meta_ads_connections")
    .update({
      page_id: body.page_id.trim(),
      page_name: body.page_name?.trim() ?? null,
      page_access_token: body.page_access_token.trim(),
      instagram_account_id: instagramAccountId,
      instagram_username: instagramUsername,
    })
    .eq("restaurant_id", restaurantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    instagramLinked: Boolean(instagramAccountId),
    instagramUsername,
  });
}
