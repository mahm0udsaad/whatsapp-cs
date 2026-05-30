/**
 * POST /api/mobile/meta-ads/posts/video/upload-url
 *
 * Returns a short-lived Supabase signed upload URL so the phone can stream the
 * video straight to storage. Videos are far too large to send through a
 * serverless route as base64/JSON, so the bytes never touch this backend — the
 * subsequent publish route only receives the resulting `storage_path`.
 *
 * Body:  { ext?: string }   — file extension, e.g. "mp4" (default "mp4")
 * Returns: { storage_path, signed_url, token }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "whatsapp-media";

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let ext = "mp4";
  try {
    const body = (await request.json()) as { ext?: string };
    if (body.ext) ext = body.ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp4";
  } catch {
    // Empty body is fine — default to mp4.
  }

  // Path is namespaced by restaurant so the publish route can verify ownership.
  const storagePath = `meta-post-videos/${restaurantId}/${Date.now()}.${ext}`;

  const { data, error } = await adminSupabaseClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "تعذّر تجهيز رابط الرفع." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    storage_path: storagePath,
    signed_url: data.signedUrl,
    token: data.token,
  });
}
