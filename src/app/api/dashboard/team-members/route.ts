/**
 * Owner-only management of `team_members` (Supabase-auth-backed staff).
 *
 * Distinct from `/api/dashboard/team` which manages the legacy
 * `restaurant_members` (username/password) table. The two coexist:
 *   - restaurant_members → limited web dashboard access (legacy)
 *   - team_members       → real Supabase auth user, used by the inbox claim
 *                          flow, the mobile app, the broadcast fan-out, and
 *                          the shifts schedule. THIS is what we manage here.
 *
 * The owner provides email + password directly (no invite flow). The auth
 * user is created with `email_confirm: true` so the staff member can log
 * in immediately without a verification round-trip.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  getCurrentSessionContext,
  getRestaurantForUserId,
} from "@/lib/tenant";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(["agent", "admin"]);

/** Resolve owner + restaurant. Returns 401/403/404 NextResponse on failure. */
async function getOwnerRestaurant() {
  const session = await getCurrentSessionContext();
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.memberId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Only the owner can manage staff" },
        { status: 403 }
      ),
    };
  }
  const restaurant = await getRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      ),
    };
  }
  return { ok: true as const, ownerId: session.ownerId, restaurantId: restaurant.id };
}

export async function GET() {
  const ctx = await getOwnerRestaurant();
  if (!ctx.ok) return ctx.response;

  const { data, error } = await adminSupabaseClient
    .from("team_members")
    .select("id, user_id, full_name, role, is_active, is_available, created_at, updated_at")
    .eq("restaurant_id", ctx.restaurantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with auth.users.email so the owner sees who they invited.
  const userIds = (data ?? []).map((r) => r.user_id).filter(Boolean) as string[];
  const emails = new Map<string, string>();
  for (const uid of userIds) {
    try {
      const { data: u } = await adminSupabaseClient.auth.admin.getUserById(uid);
      if (u?.user?.email) emails.set(uid, u.user.email);
    } catch {
      // ignore — best-effort enrichment
    }
  }

  return NextResponse.json({
    members: (data ?? []).map((r) => ({
      ...r,
      email: r.user_id ? emails.get(r.user_id) ?? null : null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getOwnerRestaurant();
  if (!ctx.ok) return ctx.response;

  let body: {
    email?: string;
    password?: string;
    full_name?: string;
    role?: "agent" | "admin";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const fullName = body.full_name?.trim() || "";
  const role = (body.role ?? "agent") as "agent" | "admin";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "البريد الإلكتروني غير صحيح" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" },
      { status: 400 }
    );
  }
  if (!fullName) {
    return NextResponse.json({ error: "الاسم الكامل مطلوب" }, { status: 400 });
  }
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "الدور غير صالح" }, { status: 400 });
  }

  // 1. Create the Supabase auth user (or surface conflict).
  const created = await adminSupabaseClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, restaurant_id: ctx.restaurantId },
  });

  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "تعذر إنشاء الحساب";
    // The Supabase admin API surfaces "already registered" inconsistently;
    // catch the common shape.
    const isDup = /already.*regist|exists|duplicate/i.test(msg);
    return NextResponse.json(
      { error: isDup ? "هذا البريد مسجل مسبقاً" : msg },
      { status: isDup ? 409 : 500 }
    );
  }

  const userId = created.data.user.id;

  // 2. Insert the team_members row. If this fails, roll back the auth user.
  const { data: row, error: insertErr } = await adminSupabaseClient
    .from("team_members")
    .insert({
      restaurant_id: ctx.restaurantId,
      user_id: userId,
      role,
      full_name: fullName,
      is_active: true,
      is_available: true,
    })
    .select("id, user_id, full_name, role, is_active, is_available, created_at, updated_at")
    .single();

  if (insertErr) {
    // Best-effort rollback so we don't leave a dangling auth user.
    try {
      await adminSupabaseClient.auth.admin.deleteUser(userId);
    } catch {
      /* swallow */
    }
    const isDup = insertErr.code === "23505";
    return NextResponse.json(
      { error: isDup ? "هذه الموظفة مسجلة في الفريق مسبقاً" : insertErr.message },
      { status: isDup ? 409 : 500 }
    );
  }

  return NextResponse.json(
    { member: { ...row, email } },
    { status: 201 }
  );
}
