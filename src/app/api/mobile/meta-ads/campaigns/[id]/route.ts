/**
 * PATCH /api/mobile/meta-ads/campaigns/[id]
 *
 * Pause or activate a Meta Ads campaign.
 * body: { status: "ACTIVE" | "PAUSED" }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";

interface RouteParams {
  params: Promise<{ id: string }>;
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
