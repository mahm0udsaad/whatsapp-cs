/**
 * POST /api/auth/meta/deauthorize
 *
 * Meta's "Deauthorize Callback" — Facebook calls this when a user removes the
 * app from their Facebook settings. We verify the signed_request and delete the
 * stored Meta connection for that Facebook user so no stale token lingers.
 *
 * Configure in Meta App Dashboard → Facebook Login → Settings →
 * "Deauthorize Callback URL": https://www.nehgzbot.com/api/auth/meta/deauthorize
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { parseSignedRequest, readSignedRequest } from "@/lib/meta-signed-request";

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Meta app not configured" }, { status: 503 });
  }

  const signedRequest = await readSignedRequest(request);
  if (!signedRequest) {
    return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
  }

  const payload = parseSignedRequest(signedRequest, appSecret);
  if (!payload?.user_id) {
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  await adminSupabaseClient
    .from("meta_ads_connections")
    .delete()
    .eq("meta_user_id", payload.user_id);

  return NextResponse.json({ ok: true });
}
