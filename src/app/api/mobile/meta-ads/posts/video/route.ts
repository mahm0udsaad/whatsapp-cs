/**
 * POST /api/mobile/meta-ads/posts/video
 *
 * Publishes an already-uploaded video (see ./upload-url) to a Facebook Page
 * and/or Instagram.
 *
 *   Facebook:  POST /{page_id}/videos with a hosted `file_url` — Meta fetches
 *              and processes it; the post is created immediately.
 *   Instagram: videos must publish as a Reel. That's a 3-step async flow:
 *              1. create a REELS container with a public `video_url`
 *              2. poll the container's `status_code` until FINISHED
 *              3. POST /media_publish with the container id
 *              IG processing typically takes 30s–2min, so this route can run
 *              for a while — hence the extended maxDuration.
 *
 * Body:
 *   storage_path  string                    — path returned by /upload-url
 *   caption       string
 *   publish_to    ("facebook"|"instagram")[]
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const META_GRAPH_VERSION = "v23.0";
const STORAGE_BUCKET = "whatsapp-media";

// IG container polling: every 5s for up to ~2.5 min.
const IG_POLL_INTERVAL_MS = 5_000;
const IG_POLL_TIMEOUT_MS = 150_000;

interface VideoPostBody {
  storage_path?: string;
  caption?: string;
  publish_to?: ("facebook" | "instagram")[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function publishVideoToFacebook(
  pageId: string,
  pageToken: string,
  caption: string,
  videoUrl: string
): Promise<{ id: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/videos`,
    {
      method: "POST",
      body: new URLSearchParams({
        file_url: videoUrl,
        description: caption,
        access_token: pageToken,
      }),
    }
  );
  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (data.error || !data.id) {
    throw new Error(data.error?.message ?? "تعذّر رفع الفيديو إلى Facebook.");
  }
  return { id: data.id };
}

async function publishReelToInstagram(
  igAccountId: string,
  pageToken: string,
  caption: string,
  videoUrl: string
): Promise<{ id: string }> {
  // Step 1: create the REELS container.
  const createRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media`,
    {
      method: "POST",
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: "true",
        access_token: pageToken,
      }),
    }
  );
  const createData = (await createRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (createData.error || !createData.id) {
    throw new Error(
      createData.error?.message ?? "تعذّر إنشاء حاوية الفيديو على Instagram."
    );
  }
  const containerId = createData.id;

  // Step 2: poll until the container finishes processing.
  const deadline = Date.now() + IG_POLL_TIMEOUT_MS;
  let finished = false;
  while (Date.now() < deadline) {
    await sleep(IG_POLL_INTERVAL_MS);
    const stRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${containerId}?` +
        new URLSearchParams({
          fields: "status_code",
          access_token: pageToken,
        }).toString()
    );
    const st = (await stRes.json()) as { status_code?: string };
    if (st.status_code === "FINISHED") {
      finished = true;
      break;
    }
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
      throw new Error(
        `تعذّرت معالجة الفيديو على Instagram (${st.status_code}). تأكد من أن الفيديو عمودي وبصيغة مدعومة.`
      );
    }
  }
  if (!finished) {
    throw new Error(
      "ما زال Instagram يعالج الفيديو. حاول النشر عليه مرة أخرى بعد قليل."
    );
  }

  // Step 3: publish the container.
  const pubRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${igAccountId}/media_publish`,
    {
      method: "POST",
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: pageToken,
      }),
    }
  );
  const pubData = (await pubRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (pubData.error || !pubData.id) {
    throw new Error(pubData.error?.message ?? "تعذّر نشر الفيديو على Instagram.");
  }
  return { id: pubData.id };
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: VideoPostBody;
  try {
    body = (await request.json()) as VideoPostBody;
  } catch {
    return NextResponse.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }

  if (!body.caption?.trim()) {
    return NextResponse.json({ error: "caption required" }, { status: 400 });
  }
  if (!body.publish_to?.length) {
    return NextResponse.json({ error: "publish_to required" }, { status: 400 });
  }
  if (!body.storage_path) {
    return NextResponse.json({ error: "storage_path required" }, { status: 400 });
  }
  // Ownership guard: the path must live under this restaurant's namespace.
  if (!body.storage_path.startsWith(`meta-post-videos/${restaurantId}/`)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 403 });
  }

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("page_id, page_access_token, instagram_account_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn?.page_id || !conn.page_access_token) {
    return NextResponse.json(
      { error: "No Facebook Page connected" },
      { status: 404 }
    );
  }
  const toIG = body.publish_to.includes("instagram");
  if (toIG && !conn.instagram_account_id) {
    return NextResponse.json(
      { error: "No Instagram account linked to this Page" },
      { status: 404 }
    );
  }

  // Sign a download URL Meta can fetch while it pulls/processes the video.
  // 6h covers FB processing + IG container polling with wide margin.
  const { data: signed } = await adminSupabaseClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(body.storage_path, 6 * 3600);
  if (!signed?.signedUrl) {
    return NextResponse.json(
      { error: "تعذّر الوصول إلى الفيديو المرفوع." },
      { status: 500 }
    );
  }
  const videoUrl = signed.signedUrl;
  const caption = body.caption.trim();

  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  if (body.publish_to.includes("facebook")) {
    try {
      results.facebook = await publishVideoToFacebook(
        conn.page_id,
        conn.page_access_token,
        caption,
        videoUrl
      );
    } catch (e) {
      errors.facebook = (e as Error).message;
    }
  }

  if (toIG && conn.instagram_account_id) {
    try {
      results.instagram = await publishReelToInstagram(
        conn.instagram_account_id,
        conn.page_access_token,
        caption,
        videoUrl
      );
    } catch (e) {
      errors.instagram = (e as Error).message;
    }
  }

  const published = Object.keys(results);
  if (!published.length) {
    return NextResponse.json(
      { error: "All platforms failed", errors },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, published, results, errors });
}
