/**
 * /api/mobile/labels
 *
 * GET  — list labels visible to the caller (RLS → own tenant only).
 * POST — create a label for the caller's tenant. Body: { restaurantId, name, color? }.
 *
 * RLS on `conversation_labels` already gates by tenant membership, so we use
 * the caller's user-JWT supabase client and trust the DB to filter rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ALLOWED_COLORS = new Set([
  "slate",
  "red",
  "amber",
  "emerald",
  "blue",
  "indigo",
  "fuchsia",
  "rose",
]);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("conversation_labels")
    .select("id, restaurant_id, name, color, created_at")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

interface CreateBody {
  restaurantId?: string;
  name?: string;
  color?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const restaurantId = body.restaurantId?.trim();
  const name = body.name?.trim();
  const color = body.color?.trim() ?? "slate";

  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId required" },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (name.length > 40) {
    return NextResponse.json(
      { error: "name must be 40 chars or fewer" },
      { status: 400 }
    );
  }
  if (!ALLOWED_COLORS.has(color)) {
    return NextResponse.json({ error: "invalid color" }, { status: 400 });
  }

  // RLS insert policy already requires the caller to be a member of
  // restaurantId — any forged value will be rejected at the DB.
  const { data, error } = await supabase
    .from("conversation_labels")
    .insert({
      restaurant_id: restaurantId,
      name,
      color,
      created_by: user.id,
    })
    .select("id, restaurant_id, name, color, created_at")
    .single();

  if (error) {
    // Unique (restaurant_id, name) conflict → 409, everything else → 500.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Label with that name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
