/**
 * GET   /api/mobile/meta-ads/campaigns/[id]  — full campaign detail w/ ads + creatives + daily insights
 * PATCH /api/mobile/meta-ads/campaigns/[id]  — pause/activate
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Resolve a Facebook video_id to its temporary MP4 source URL.
 * Returns null on any failure — caller falls back to thumbnail-only.
 */
async function resolveVideoSource(
  videoId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${videoId}?` +
        new URLSearchParams({ fields: "source,permalink_url", access_token: accessToken }).toString()
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { source?: string };
    return j.source ?? null;
  } catch {
    return null;
  }
}

interface CreativeShape {
  object_story_spec?: {
    video_data?: { video_id?: string; image_url?: string };
  };
  video_url?: string;
}

interface AdShape {
  creative?: CreativeShape;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;
  const { id } = await params;

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("user_access_token")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ error: "Not connected to Meta" }, { status: 404 });
  }

  // Single Graph call: campaign + all its ads/creatives + daily insights for the
  // last 30 days. The mobile detail screen renders a tiny day-by-day chart from this.
  const params2 = new URLSearchParams({
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
      "buying_type",
      "lifetime_insights:insights.date_preset(maximum){spend,impressions,reach,clicks,ctr,cpc,cpm}",
      "daily_insights:insights.date_preset(last_30d).time_increment(1){date_start,spend,impressions,reach,clicks}",
      "last7_insights:insights.date_preset(last_7d){spend,impressions,reach,clicks,ctr}",
      "ads.limit(5){id,name,effective_status,creative{thumbnail_url,image_url,object_story_spec}}",
    ].join(","),
    access_token: conn.user_access_token,
  });

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${id}?${params2.toString()}`
  );
  const data = (await res.json()) as Record<string, unknown> & {
    error?: { message: string };
    ads?: { data?: AdShape[] };
  };

  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 502 });
  }

  // Resolve video sources for video creatives in parallel. The Graph API returns
  // video_id but not the source URL — we need a second hop per video.
  const ads = data.ads?.data ?? [];
  await Promise.all(
    ads.map(async (ad) => {
      const videoId = ad.creative?.object_story_spec?.video_data?.video_id;
      if (videoId && ad.creative) {
        const source = await resolveVideoSource(videoId, conn.user_access_token);
        if (source) ad.creative.video_url = source;
      }
    })
  );

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { id } = await params;

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status !== "ACTIVE" && body.status !== "PAUSED") {
    return NextResponse.json(
      { error: "status must be ACTIVE or PAUSED" },
      { status: 400 }
    );
  }

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("user_access_token")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json(
      { error: "Not connected to Meta" },
      { status: 404 }
    );
  }

  // Meta Graph API accepts status updates via POST with form-encoded body.
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${id}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        status: body.status,
        access_token: conn.user_access_token,
      }),
    }
  );
  const data = (await res.json()) as {
    success?: boolean;
    error?: { message: string };
  };

  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, status: body.status });
}
