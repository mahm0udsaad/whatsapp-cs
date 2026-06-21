/**
 * Edit / deactivate / delete a single team_member.
 *
 * PATCH supports partial updates of: full_name, role, is_active,
 * is_available, and password (the latter resets the member's Supabase
 * auth password via the admin API).
 *
 * DELETE hard-removes the member: it detaches any conversations assigned
 * to them, drops their claim-audit rows (FKs without cascade), deletes the
 * team_members row, and finally removes the underlying auth user. Owner-only.
 * Deactivation (`is_active=false`) remains the softer, history-preserving
 * option exposed in the UI.
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
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify the row belongs to this restaurant before any update.
  const { data: existing } = await adminSupabaseClient
    .from("team_members")
    .select("id, restaurant_id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.restaurant_id !== restaurant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Password reset is handled against the auth user, separately from the
  // team_members row update below.
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      return NextResponse.json(
        { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" },
        { status: 400 }
      );
    }
    if (!existing.user_id) {
      return NextResponse.json(
        { error: "لا يوجد حساب مرتبط بهذه الموظفة" },
        { status: 400 }
      );
    }
    const { error: pwErr } = await adminSupabaseClient.auth.admin.updateUserById(
      existing.user_id,
      { password: body.password }
    );
    if (pwErr) {
      return NextResponse.json({ error: pwErr.message }, { status: 500 });
    }
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
    // Password-only change: no team_members columns to update — return the row.
    if (body.password !== undefined) {
      const { data, error } = await adminSupabaseClient
        .from("team_members")
        .select(
          "id, user_id, full_name, role, is_active, is_available, created_at, updated_at"
        )
        .eq("id", id)
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ member: data });
    }
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const session = await getCurrentSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.memberId) {
    return NextResponse.json(
      { error: "Only the owner can delete staff" },
      { status: 403 }
    );
  }
  const restaurant = await getRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  // Verify the row belongs to this restaurant before deleting anything.
  const { data: existing } = await adminSupabaseClient
    .from("team_members")
    .select("id, restaurant_id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.restaurant_id !== restaurant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clear FK references that have no ON DELETE CASCADE, otherwise the
  // team_members delete would be rejected by the database.
  //   1. conversations.assigned_to  → null it (unassign open chats)
  //   2. conversation_claim_events  → not-null FK, must be removed
  const { error: convErr } = await adminSupabaseClient
    .from("conversations")
    .update({ assigned_to: null })
    .eq("assigned_to", id);
  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  const { error: claimErr } = await adminSupabaseClient
    .from("conversation_claim_events")
    .delete()
    .eq("team_member_id", id);
  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  // Delete the team_members row (cascades to shifts / performance tables).
  const { error: delErr } = await adminSupabaseClient
    .from("team_members")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Finally remove the underlying auth user (best-effort — the row is
  // already gone, so a stray auth user is the lesser evil).
  if (existing.user_id) {
    try {
      await adminSupabaseClient.auth.admin.deleteUser(existing.user_id);
    } catch {
      /* swallow — row is deleted; orphan auth user can be cleaned later */
    }
  }

  return NextResponse.json({ ok: true });
}
