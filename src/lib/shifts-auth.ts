/**
 * Auth helpers for /dashboard/shifts and /api/dashboard/shifts/*.
 *
 * Owner = restaurants.owner_id matches auth.uid() OR profiles.is_super_admin.
 * Member = owner OR active team_members row.
 *
 * Mirrors the SQL helpers public.is_restaurant_owner / is_restaurant_member
 * so server-side checks match RLS exactly.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ShiftOwnerContext {
  userId: string;
  restaurantId: string;
  isSuperAdmin: boolean;
}

export interface ShiftMemberContext extends ShiftOwnerContext {
  isOwner: boolean;
}

async function resolveRestaurantId(
  userId: string,
  isSuperAdmin: boolean
): Promise<string | null> {
  const { data: owned } = await adminSupabaseClient
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownedId = (owned as { id?: string } | null)?.id ?? null;
  if (ownedId) return ownedId;

  // Active team_members row (agents have no owned restaurant)
  const { data: membership } = await adminSupabaseClient
    .from("team_members")
    .select("restaurant_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const memberTenant =
    (membership as { restaurant_id?: string } | null)?.restaurant_id ?? null;
  if (memberTenant) return memberTenant;

  if (isSuperAdmin) {
    const { data: any_ } = await adminSupabaseClient
      .from("restaurants")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (any_ as { id?: string } | null)?.id ?? null;
  }
  return null;
}

export async function getShiftOwnerContext(): Promise<ShiftOwnerContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await adminSupabaseClient
    .from("profiles")
    .select("id, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const isSuperAdmin = Boolean(
    (profile as { is_super_admin?: boolean }).is_super_admin
  );

  const { data: owned } = await adminSupabaseClient
    .from("restaurants")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownedId = (owned as { id?: string } | null)?.id ?? null;
  let restaurantId = ownedId;
  if (!restaurantId && isSuperAdmin) {
    restaurantId = await resolveRestaurantId(user.id, true);
  }
  if (!restaurantId) return null;
  if (!ownedId && !isSuperAdmin) return null;

  return { userId: user.id, restaurantId, isSuperAdmin };
}

export async function getShiftMemberContext(): Promise<ShiftMemberContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await adminSupabaseClient
    .from("profiles")
    .select("id, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const isSuperAdmin = Boolean(
    (profile as { is_super_admin?: boolean }).is_super_admin
  );

  const { data: owned } = await adminSupabaseClient
    .from("restaurants")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ownedId = (owned as { id?: string } | null)?.id ?? null;

  const restaurantId = ownedId ?? (await resolveRestaurantId(user.id, isSuperAdmin));
  if (!restaurantId) return null;

  const isOwner = Boolean(ownedId) || isSuperAdmin;
  return { userId: user.id, restaurantId, isSuperAdmin, isOwner };
}
