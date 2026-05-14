/**
 * GET /api/mobile/meta-ads/auth-url
 *
 * Returns the Meta (Facebook) OAuth URL for the mobile client to open in an
 * in-app browser. The state param carries the restaurantId so the public
 * callback route knows which tenant to store the token under.
 *
 * Required env vars: META_APP_ID, NEXT_PUBLIC_APP_BASE_URL
 */

import { NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

const META_GRAPH_VERSION = "v21.0";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const appId = process.env.META_APP_ID;
  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL;

  if (!appId || !baseUrl) {
    return NextResponse.json(
      { error: "Meta app not configured (META_APP_ID / NEXT_PUBLIC_APP_BASE_URL missing)" },
      { status: 503 }
    );
  }

  const redirectUri = `${baseUrl}/api/auth/meta-callback`;
  const state = Buffer.from(
    JSON.stringify({ restaurantId, ts: Date.now() })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: [
      "ads_management",
      "ads_read",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
    ].join(","),
    state,
    response_type: "code",
  });

  const url = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  return NextResponse.json({ url });
}
