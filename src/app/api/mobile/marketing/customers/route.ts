/**
 * GET /api/mobile/marketing/customers?since=<iso>&limit=<n>
 *
 * Lists customers for the caller's tenant. Defaults to newest first.
 * `since` filters by `last_seen_at` — useful for the "last 30 / 90 days"
 * audience segments in the mobile campaign builder.
 *
 * Always excludes opted-out rows so the audience count shown in the UI
 * matches what will actually be enqueued as recipients.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

export async function GET(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(
    Math.max(Number.parseInt(limitRaw ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  let query = adminSupabaseClient
    .from("customers")
    .select(
      "id, phone_number, full_name, source, last_seen_at, opted_out, created_at",
      { count: "exact" }
    )
    .eq("restaurant_id", restaurantId)
    .eq("opted_out", false)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (since) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) {
      query = query.gte("last_seen_at", d.toISOString());
    }
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    total: count ?? data?.length ?? 0,
    rows: data ?? [],
  });
}
