/**
 * POST /api/mobile/meta-ads/posts
 *
 * Publishes a social post to Facebook Page and/or Instagram.
 * Body:
 *   caption        string   — post text / caption
 *   publish_to     ("facebook"|"instagram")[]
 *   image_base64?  string   — base64-encoded image (required for Instagram)
 *   image_type?    string   — MIME type e.g. "image/jpeg"
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";
const STORAGE_BUCKET = "whatsapp-media";

interface PostBody {
  caption: string;
  publish_to: ("facebook" | "instagram")[];
  image_base64?: string;
  image_type?: string;
}

async function uploadImageToStorage(
  base64: string,
  mimeType: string,
  restaurantId: string
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const ext = mimeType.split("/")[1] ?? "jpg";
  const path = `social-posts/${restaurantId}/${Date.now()}.${ext}`;

  const { error } = await adminSupabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Signed URL valid for 2 hours — enough for Meta to fetch the image
  const { data: signed } = await adminSupabaseClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 7200);

  if (!signed?.signedUrl) throw new Error("Failed to create signed URL");

  return signed.signedUrl;
}

async function publishToFacebook(
  pageId: string,
  pageToken: string,
  caption: string,
  imageUrl?: string
): Promise<{ id: string }> {
  if (imageUrl) {
    const body = new URLSearchParams({
      url: imageUrl,
      caption,
      access_token: pageToken,
    });
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/photos`,
      { method: "POST", body }
    );
    return res.json() as Promise<{ id: string }>;
  }

  const body = new URLSearchParams({
    message: caption,
    access_token: pageToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/feed`,
    { method: "POST", body }
  );
  return res.json() as Promise<{ id: string }>;
}

async function publishToInstagram(
  igAccountId: string,
  pageToken: string,
  caption: string,
  imageUrl: string
): Promise<{ id: string }> {
  // Step 1: create media container
  const createBody = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: pageToken,
  });
  const createRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media`,
    { method: "POST", body: createBody }
  );
  const createData = (await createRes.json()) as { id?: string; error?: { message: string } };
  if (createData.error || !createData.id) {
    throw new Error(createData.error?.message ?? "Instagram media creation failed");
  }

  // Step 2: publish the container
  const publishBody = new URLSearchParams({
    creation_id: createData.id,
    access_token: pageToken,
  });
  const publishRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media_publish`,
    { method: "POST", body: publishBody }
  );
  return publishRes.json() as Promise<{ id: string }>;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.caption?.trim()) {
    return NextResponse.json({ error: "caption required" }, { status: 400 });
  }
  if (!body.publish_to?.length) {
    return NextResponse.json({ error: "publish_to required" }, { status: 400 });
  }

  const toIG = body.publish_to.includes("instagram");
  if (toIG && !body.image_base64) {
    return NextResponse.json(
      { error: "image_base64 required for Instagram posts" },
      { status: 400 }
    );
  }

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("page_id, page_name, page_access_token, instagram_account_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn?.page_id || !conn.page_access_token) {
    return NextResponse.json({ error: "No Facebook Page connected" }, { status: 404 });
  }
  if (toIG && !conn.instagram_account_id) {
    return NextResponse.json(
      { error: "No Instagram account linked to this Page" },
      { status: 404 }
    );
  }

  // Upload image once if provided — reuse URL for both platforms
  let imageUrl: string | undefined;
  if (body.image_base64) {
    try {
      imageUrl = await uploadImageToStorage(
        body.image_base64,
        body.image_type ?? "image/jpeg",
        restaurantId
      );
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  if (body.publish_to.includes("facebook")) {
    try {
      const r = await publishToFacebook(
        conn.page_id,
        conn.page_access_token,
        body.caption.trim(),
        imageUrl
      );
      results.facebook = r;
    } catch (e) {
      errors.facebook = (e as Error).message;
    }
  }

  if (toIG && conn.instagram_account_id && imageUrl) {
    try {
      const r = await publishToInstagram(
        conn.instagram_account_id,
        conn.page_access_token,
        body.caption.trim(),
        imageUrl
      );
      results.instagram = r;
    } catch (e) {
      errors.instagram = (e as Error).message;
    }
  }

  const published = Object.keys(results);
  if (!published.length) {
    return NextResponse.json({ error: "All platforms failed", errors }, { status: 502 });
  }

  return NextResponse.json({ ok: true, published, results, errors });
}
