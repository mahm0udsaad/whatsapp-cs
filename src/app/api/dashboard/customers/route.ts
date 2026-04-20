/**
 * GET  /api/dashboard/customers  — list with pagination + search
 * POST /api/dashboard/customers  — create (manual entry)
 *
 * Auth: cookie session (owner or admin team_member). Tenant is resolved via
 * `getRestaurantForUserId`. Writes go through `adminSupabaseClient`.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";

const E164 = /^\+[1-9]\d{1,14}$/;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant)
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const source = url.searchParams.get("source");
  const optedOutParam = url.searchParams.get("opted_out");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminSupabaseClient
    .from("customers")
    .select(
      "id, phone_number, full_name, source, metadata, opted_out, last_seen_at, created_at, updated_at",
      { count: "exact" }
    )
    .eq("restaurant_id", restaurant.id)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    // Escape % and _ that would be interpreted as ILIKE wildcards.
    const safe = q.replace(/[%_]/g, (c) => `\\${c}`);
    query = query.or(
      `phone_number.ilike.%${safe}%,full_name.ilike.%${safe}%`
    );
  }
  if (source) query = query.eq("source", source);
  if (optedOutParam === "true") query = query.eq("opted_out", true);
  if (optedOutParam === "false") query = query.eq("opted_out", false);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant)
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | {
        phone_number?: string;
        full_name?: string | null;
        metadata?: Record<string, unknown> | null;
      }
    | null;

  if (!body?.phone_number || !E164.test(body.phone_number.trim())) {
    return NextResponse.json(
      { error: "phone_number must be E.164 (e.g. +9665…)" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await adminSupabaseClient
    .from("customers")
    .upsert(
      {
        restaurant_id: restaurant.id,
        phone_number: body.phone_number.trim(),
        full_name: body.full_name?.trim() || null,
        metadata: body.metadata ?? {},
        source: "manual",
        updated_at: now,
      },
      { onConflict: "restaurant_id,phone_number" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}
