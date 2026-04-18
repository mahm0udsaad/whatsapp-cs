/**
 * Owner-only auth gate for the AI Manager surface.
 *
 * "Owner" means:
 *   - `restaurants.owner_id = auth.uid()`, or
 *   - `profiles.is_super_admin = true` (ops role).
 *
 * Both the /dashboard/ai-manager page (server component) and every
 * /api/dashboard/ai-manager/* route funnel through this helper so the rule
 * is in one place.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface OwnerContext {
  userId: string;
  restaurantId: string;
  isSuperAdmin: boolean;
}

/**
 * Resolve the current authed user into an owner context, or return null.
 * Returns null for:
 *   - no Supabase session
 *   - profile missing
 *   - user is NOT the owner of any restaurant AND NOT a super-admin
 */
export async function getOwnerContext(): Promise<OwnerContext | null> {
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

  // Find the tenant. We key on the owner_id row. Super-admins without an
  // owned restaurant are NOT supported on this page — the AI Manager is
  // per-tenant, so they need a restaurant context. We pick the first
  // restaurant in the table as a fallback for pure ops super-admins.
  const { data: ownedRestaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let restaurantId: string | null =
    (ownedRestaurant as { id?: string } | null)?.id ?? null;

  if (!restaurantId && isSuperAdmin) {
    const { data: anyRestaurant } = await adminSupabaseClient
      .from("restaurants")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    restaurantId = (anyRestaurant as { id?: string } | null)?.id ?? null;
  }

  if (!restaurantId) return null;
  if (!ownedRestaurant && !isSuperAdmin) return null;

  return {
    userId: user.id,
    restaurantId,
    isSuperAdmin,
  };
}

/**
 * Assert ownership of a specific thread. Throws (returns null) if the thread
 * doesn't exist or doesn't belong to this owner's tenant.
 */
export async function assertOwnsThread(
  owner: OwnerContext,
  threadId: string
): Promise<{
  id: string;
  restaurant_id: string;
  owner_user_id: string;
  title: string | null;
} | null> {
  const { data } = await adminSupabaseClient
    .from("owner_ai_manager_threads")
    .select("id, restaurant_id, owner_user_id, title")
    .eq("id", threadId)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    id: string;
    restaurant_id: string;
    owner_user_id: string;
    title: string | null;
  };
  // Super-admins can touch any tenant's thread; everyone else must match
  // both restaurant and owner_user_id.
  if (owner.isSuperAdmin) return row;
  if (row.restaurant_id !== owner.restaurantId) return null;
  if (row.owner_user_id !== owner.userId) return null;
  return row;
}
