/**
 * Edit / deactivate a single team_member.
 *
 * PATCH supports partial updates of: full_name, role, is_active, is_available.
 * Owner-only. We never hard-delete a row from the UI: deactivation
 * (`is_active=false`) preserves history for any orders that reference this
 * member's id via `orders.assigned_to`.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  getCurrentSessionContext,
  getRestaurantForUserId,
} from "@/lib/tenant";

const VALID_ROLES = new Set(["agent", "admin"]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const session = await getCurrentSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.memberId) {
    return NextResponse.json(
      { error: "Only the owner can edit staff" },
      { status: 403 }
    );
  }
  const restaurant = await getRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  let body: {
    full_name?: string;
    role?: "agent" | "admin";
    is_active?: boolean;
    is_available?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify the row belongs to this restaurant before any update.
  const { data: existing } = await adminSupabaseClient
    .from("team_members")
    .select("id, restaurant_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.restaurant_id !== restaurant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.full_name === "string") {
    const v = body.full_name.trim();
    if (!v) {
      return NextResponse.json({ error: "الاسم الكامل مطلوب" }, { status: 400 });
    }
    patch.full_name = v;
  }
  if (body.role !== undefined) {
    if (!VALID_ROLES.has(body.role)) {
      return NextResponse.json({ error: "الدور غير صالح" }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.is_available === "boolean") patch.is_available = body.is_available;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "لا تغييرات للحفظ" }, { status: 400 });
  }

  const { data, error } = await adminSupabaseClient
    .from("team_members")
    .update(patch)
    .eq("id", id)
    .select("id, user_id, full_name, role, is_active, is_available, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data });
}
