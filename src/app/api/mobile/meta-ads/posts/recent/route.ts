/**
 * GET /api/mobile/meta-ads/posts/recent
 *
 * Lists the most recent posts from the connected Facebook Page (and the
 * linked Instagram account, if any). Unified shape so the mobile can render
 * one timeline mixing both platforms.
 *
 * Returns array of:
 *   {
 *     id, platform: "facebook"|"instagram", message, image_url,
 *     permalink, created_time, like_count?, comments_count?
 *   }
 */

import { NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";

interface FbPost {
  id: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  created_time?: string;
  status_type?: string;
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
  attachments?: {
    data?: {
      media_type?: string;
      type?: string;
      media?: { image?: { src?: string } };
    }[];
  };
}

interface IgMedia {
  id: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
}

interface UnifiedPost {
  id: string;
  platform: "facebook" | "instagram";
  media_kind: "image" | "video" | "carousel" | "text";
  message: string | null;
  image_url: string | null; // always a still — thumbnail for videos
  permalink: string | null;
  created_time: string;
  like_count: number;
  comments_count: number;
  shares_count: number;
}

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("page_id, page_access_token, instagram_account_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn?.page_id || !conn.page_access_token) {
    return NextResponse.json({ error: "No Facebook Page connected" }, { status: 404 });
  }

  // Fetch FB Page posts + IG media in parallel
  const fbParams = new URLSearchParams({
    fields:
      "id,message,full_picture,permalink_url,created_time,status_type," +
      "reactions.summary(total_count).limit(0)," +
      "comments.summary(total_count).limit(0)," +
      "shares,attachments{media_type,type,media{image}}",
    access_token: conn.page_access_token,
    limit: "10",
  });

  const fbReq = fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${conn.page_id}/posts?${fbParams.toString()}`
  );

  const igReq = conn.instagram_account_id
    ? fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${conn.instagram_account_id}/media?` +
          new URLSearchParams({
            fields:
              "id,caption,media_url,thumbnail_url,permalink,timestamp,media_type,like_count,comments_count",
            access_token: conn.page_access_token,
            limit: "10",
          }).toString()
      )
    : Promise.resolve(null);

  const [fbRes, igRes] = await Promise.all([fbReq, igReq]);

  const out: UnifiedPost[] = [];

  if (fbRes.ok) {
    const fbData = (await fbRes.json()) as { data?: FbPost[] };
    for (const p of fbData.data ?? []) {
      const image =
        p.full_picture ??
        p.attachments?.data?.[0]?.media?.image?.src ??
        null;
      // Detect media kind from status_type, attachment media_type, or attachment type
      const attachmentType = p.attachments?.data?.[0]?.media_type ??
        p.attachments?.data?.[0]?.type ?? "";
      const statusType = p.status_type ?? "";
      const lowerType = `${attachmentType} ${statusType}`.toLowerCase();
      let media_kind: UnifiedPost["media_kind"] = "text";
      if (lowerType.includes("video") || lowerType.includes("reel")) {
        media_kind = "video";
      } else if (lowerType.includes("album") || lowerType.includes("carousel")) {
        media_kind = "carousel";
      } else if (image) {
        media_kind = "image";
      }
      out.push({
        id: p.id,
        platform: "facebook",
        media_kind,
        message: p.message ?? null,
        image_url: image,
        permalink: p.permalink_url ?? null,
        created_time: p.created_time ?? new Date().toISOString(),
        like_count: p.reactions?.summary?.total_count ?? 0,
        comments_count: p.comments?.summary?.total_count ?? 0,
        shares_count: p.shares?.count ?? 0,
      });
    }
  }

  if (igRes && igRes.ok) {
    const igData = (await igRes.json()) as { data?: IgMedia[] };
    for (const m of igData.data ?? []) {
      // For VIDEO/REELS, use thumbnail; for IMAGE, use media_url
      const image =
        m.media_type === "VIDEO" || m.media_type === "REELS"
          ? m.thumbnail_url ?? m.media_url ?? null
          : m.media_url ?? null;
      let media_kind: UnifiedPost["media_kind"] = "image";
      if (m.media_type === "VIDEO" || m.media_type === "REELS") {
        media_kind = "video";
      } else if (m.media_type === "CAROUSEL_ALBUM") {
        media_kind = "carousel";
      }
      out.push({
        id: m.id,
        platform: "instagram",
        media_kind,
        message: m.caption ?? null,
        image_url: image,
        permalink: m.permalink ?? null,
        created_time: m.timestamp ?? new Date().toISOString(),
        like_count: m.like_count ?? 0,
        comments_count: m.comments_count ?? 0,
        shares_count: 0,
      });
    }
  }

  // Merge and sort by created_time descending, cap at 10
  out.sort((a, b) => b.created_time.localeCompare(a.created_time));
  return NextResponse.json(out.slice(0, 10));
}
