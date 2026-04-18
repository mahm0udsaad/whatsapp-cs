/**
 * Shared auth helpers for /api/mobile/* routes.
 *
 * - assertAuthenticated: returns the Supabase auth user or a NextResponse error.
 * - assertRestaurantAdmin: resolves the caller's admin context for a given
 *   restaurant_id, or returns a 401/403 NextResponse to bubble back.
 *
 * "Admin" is defined exactly as the SQL helper `is_restaurant_admin`:
 *   restaurant owner OR team_members.role = 'admin' (active) OR super_admin.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export interface AuthedUser {
  id: string;
  email: string | null;
}

export interface AdminContext {
  user: AuthedUser;
  restaurantId: string;
  // The caller's team_member row in this tenant, if any. Owners without a
  // team_members row still pass the admin check but have teamMember=null.
  teamMember: { id: string; role: "admin" | "agent" } | null;
}

/**
 * Resolve the authenticated user, or return a 401 Response.
 */
export async function assertAuthenticated(): Promise<
  { user: AuthedUser } | NextResponse
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user: { id: user.id, email: user.email ?? null } };
}

/**
 * Guard for manager-only routes. Confirms the caller has admin rights on the
 * given restaurant. Returns either an AdminContext or a NextResponse to be
 * returned directly from the route handler.
 */
export async function assertRestaurantAdmin(
  restaurantId: string
): Promise<AdminContext | NextResponse> {
  const authed = await assertAuthenticated();
  if (authed instanceof NextResponse) return authed;
  const { user } = authed;

  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId required" },
      { status: 400 }
    );
  }

  // Check admin via the SQL helper (owner OR role='admin' active OR super).
  const { data: isAdmin, error: rpcError } = await adminSupabaseClient.rpc(
    "is_restaurant_admin",
    { p_restaurant_id: restaurantId, p_user_id: user.id }
  );
  if (rpcError) {
    return NextResponse.json(
      { error: `admin check failed: ${rpcError.message}` },
      { status: 500 }
    );
  }
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: manager access required" },
      { status: 403 }
    );
  }

  // Fetch the caller's team_members row if one exists. Not strictly required
  // for the guard but useful to route handlers.
  const { data: tm } = await adminSupabaseClient
    .from("team_members")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  return {
    user,
    restaurantId,
    teamMember: tm
      ? { id: tm.id, role: tm.role as "admin" | "agent" }
      : null,
  };
}

/**
 * For routes that don't take restaurantId as a param — infer it from the
 * caller's first active team_members row. Useful when the mobile client
 * operates on "the current tenant" without threading the ID through every API.
 */
export async function resolveCurrentRestaurantForAdmin(): Promise<
  AdminContext | NextResponse
> {
  const authed = await assertAuthenticated();
  if (authed instanceof NextResponse) return authed;
  const { user } = authed;

  // Try the team_member row first (covers both admins and owners who also
  // have a team_members row).
  const { data: tm } = await adminSupabaseClient
    .from("team_members")
    .select("id, restaurant_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("role", ["admin"])
    .limit(1)
    .maybeSingle();

  if (tm) {
    return {
      user,
      restaurantId: tm.restaurant_id,
      teamMember: { id: tm.id, role: tm.role as "admin" | "agent" },
    };
  }

  // Fallback: a true owner with no team_member row.
  const { data: owned } = await adminSupabaseClient
    .from("restaurants")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (owned) {
    return { user, restaurantId: owned.id, teamMember: null };
  }

  return NextResponse.json(
    { error: "Forbidden: manager access required" },
    { status: 403 }
  );
}
