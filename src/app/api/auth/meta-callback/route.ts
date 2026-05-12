/**
 * GET /api/auth/meta-callback  (public — no Supabase session required)
 *
 * Meta OAuth callback. Called by the user's browser after they authorize on
 * Facebook. Flow:
 *   1. Extract code + state from query params.
 *   2. Decode state → restaurantId.
 *   3. Exchange code for a short-lived token, then a 60-day long-lived token.
 *   4. Fetch the Meta user ID (/me).
 *   5. Upsert into meta_ads_connections.
 *   6. Redirect to the app deep link so expo-web-browser closes.
 *
 * Required env vars: META_APP_ID, META_APP_SECRET, NEXT_PUBLIC_APP_BASE_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";
const DEEP_LINK = "whatsapp-cs-agent://meta-ads/callback";

function redirectToApp(result: "success" | "error", error?: string) {
  const params = new URLSearchParams({ result });
  if (error) params.set("error_code", error);
  return NextResponse.redirect(`${DEEP_LINK}?${params.toString()}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return redirectToApp("error", oauthError);
  }
  if (!code || !state) {
    return redirectToApp("error", "missing_params");
  }

  // Decode state to get restaurantId
  let restaurantId: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8")
    ) as { restaurantId?: string; ts?: number };
    if (!decoded.restaurantId) throw new Error("no restaurantId");
    restaurantId = decoded.restaurantId;
  } catch {
    return redirectToApp("error", "invalid_state");
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL;

  if (!appId || !appSecret || !baseUrl) {
    return redirectToApp("error", "server_misconfigured");
  }

  const redirectUri = `${baseUrl}/api/auth/meta-callback`;

  // Step 1: exchange code for short-lived token
  const shortTokenUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`
  );
  shortTokenUrl.searchParams.set("client_id", appId);
  shortTokenUrl.searchParams.set("client_secret", appSecret);
  shortTokenUrl.searchParams.set("redirect_uri", redirectUri);
  shortTokenUrl.searchParams.set("code", code);

  const shortRes = await fetch(shortTokenUrl.toString());
  const shortData = (await shortRes.json()) as {
    access_token?: string;
    error?: { message: string };
  };

  if (shortData.error || !shortData.access_token) {
    return redirectToApp("error", "token_exchange_failed");
  }

  // Step 2: exchange for long-lived token (~60 days)
  const longTokenUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`
  );
  longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
  longTokenUrl.searchParams.set("client_id", appId);
  longTokenUrl.searchParams.set("client_secret", appSecret);
  longTokenUrl.searchParams.set("fb_exchange_token", shortData.access_token);

  const longRes = await fetch(longTokenUrl.toString());
  const longData = (await longRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message: string };
  };

  const accessToken = longData.access_token ?? shortData.access_token;
  const expiresAt = longData.expires_in
    ? new Date(Date.now() + longData.expires_in * 1000).toISOString()
    : null;

  // Step 3: get Meta user ID
  const meRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me?access_token=${accessToken}`
  );
  const meData = (await meRes.json()) as { id?: string };

  // Step 4: upsert connection (reset ad_account on reconnect so user re-picks)
  const { error: dbErr } = await adminSupabaseClient
    .from("meta_ads_connections")
    .upsert(
      {
        restaurant_id: restaurantId,
        meta_user_id: meData.id ?? null,
        user_access_token: accessToken,
        ad_account_id: null,
        ad_account_name: null,
        connected_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: "restaurant_id" }
    );

  if (dbErr) {
    return redirectToApp("error", "db_write_failed");
  }

  return redirectToApp("success");
}
