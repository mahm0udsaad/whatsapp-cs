/**
 * POST /api/auth/meta/data-deletion
 *
 * Meta's "Data Deletion Request Callback" — Facebook calls this when a user
 * requests deletion of the data your app holds about them. We verify the
 * signed_request, delete the user's stored Meta connection, and return the
 * `{ url, confirmation_code }` shape Meta requires so the user can track status.
 *
 * Configure in Meta App Dashboard → Settings → Basic →
 * "Data Deletion Request URL": https://www.nehgzbot.com/api/auth/meta/data-deletion
 *
 * Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { parseSignedRequest, readSignedRequest } from "@/lib/meta-signed-request";

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL;
  if (!appSecret || !baseUrl) {
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

  // A short, non-reversible reference the user can quote when checking status.
  const confirmationCode = crypto
    .createHash("sha256")
    .update(`${payload.user_id}:${Date.now()}`)
    .digest("hex")
    .slice(0, 16);

  return NextResponse.json({
    url: `${baseUrl.replace(/\/$/, "")}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
