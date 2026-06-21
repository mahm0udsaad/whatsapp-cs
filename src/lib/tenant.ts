import { cookies } from "next/headers";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MEMBER_COOKIE, verifyMemberToken } from "@/lib/member-auth";
import {
  AiAgent,
  Profile,
  Restaurant,
  SetupStatus,
  TenantContext,
  WhatsAppSender,
} from "@/lib/types";

export interface SessionContext {
  ownerId: string;
  memberId: string | null;
  restaurantId: string | null;
}

function deriveSetupStatus(restaurant: Restaurant | null, sender: WhatsAppSender | null): SetupStatus {
  if (!restaurant) {
    return "draft";
  }

  // Prefer explicitly stored setup_status (present after migration)
  if (restaurant.setup_status) {
    return restaurant.setup_status;
  }

  // Fall back to provisioning_status for records created before the migration
  const provStatus = restaurant.provisioning_status;
  if (provStatus === "active") return "active";
  if (provStatus === "failed") return "failed";
  if (provStatus && provStatus !== "draft") return "pending_whatsapp";

  if (sender?.status === "active") {
    return "active";
  }

  if (restaurant.twilio_phone_number) {
    return "pending_whatsapp";
  }

  return "draft";
}

export async function getCurrentSessionContext(): Promise<SessionContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return { ownerId: user.id, memberId: null, restaurantId: null };
  }

  const cookieStore = await cookies();
  const memberSession = await verifyMemberToken(
    cookieStore.get(MEMBER_COOKIE)?.value
  );
  if (!memberSession) return null;

  // Confirm the member still exists; otherwise treat the cookie as invalid
  // (handles deletion / password reset invalidating prior sessions).
  const { data: member } = await adminSupabaseClient
    .from("restaurant_members")
    .select("id, restaurant_id")
    .eq("id", memberSession.memberId)
    .maybeSingle();

  if (!member) return null;

  return {
    ownerId: memberSession.ownerId,
    memberId: memberSession.memberId,
    restaurantId: memberSession.restaurantId,
  };
}

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return user;

  const ctx = await getCurrentSessionContext();
  if (!ctx) return null;

  // Synthetic user object — downstream code only uses .id.
  return { id: ctx.ownerId } as unknown as NonNullable<typeof user>;
}

export async function getTenantContextForUser(userId: string): Promise<TenantContext | null> {
  const { data: profileRow } = await adminSupabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  // Resolve the restaurant the way the rest of the app does: an owner owns a
  // restaurant; otherwise the user may be a `team_members` staffer
  // (Supabase-auth employee) of someone else's restaurant.
  let restaurant: Restaurant | null = null;
  let isMember = false;

  const { data: ownedRestaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownedRestaurant) {
    restaurant = ownedRestaurant as Restaurant;
  } else {
    const { data: member } = await adminSupabaseClient
      .from("team_members")
      .select("restaurant_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (member?.restaurant_id) {
      isMember = true;
      const { data: memberRestaurant } = await adminSupabaseClient
        .from("restaurants")
        .select("*")
        .eq("id", member.restaurant_id)
        .maybeSingle();
      restaurant = (memberRestaurant as Restaurant | null) ?? null;
    }
  }

  // An employee created via the team panel has an auth user but may not have a
  // `profiles` row. Synthesize a minimal profile so the dashboard can render
  // their name/email instead of failing and bouncing them to onboarding.
  let profile = profileRow as Profile | null;
  if (!profile) {
    if (!isMember && !restaurant) {
      // Neither a profile, nor an owned/member restaurant — nothing to show.
      return null;
    }
    let email: string | null = null;
    let fullName: string | null = null;
    try {
      const { data: authUser } =
        await adminSupabaseClient.auth.admin.getUserById(userId);
      email = authUser?.user?.email ?? null;
      fullName =
        (authUser?.user?.user_metadata?.full_name as string | undefined) ?? null;
    } catch {
      // best-effort — fall back to nulls below
    }
    const now = new Date().toISOString();
    profile = {
      id: userId,
      full_name: fullName,
      email,
      avatar_url: null,
      created_at: now,
      updated_at: now,
    };
  }

  let aiAgent: AiAgent | null = null;
  if (restaurant) {
    const { data } = await adminSupabaseClient
      .from("ai_agents")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    aiAgent = data;
  }

  // whatsapp_senders table does not exist in this schema;
  // primary number lives in whatsapp_numbers with is_primary = true.
  let primarySender: WhatsAppSender | null = null;
  if (restaurant) {
    try {
      const { data } = await adminSupabaseClient
        .from("whatsapp_numbers")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();

      // Map whatsapp_numbers row to the WhatsAppSender shape the rest of the app expects
      if (data) {
        primarySender = {
          ...data,
          status: data.onboarding_status ?? data.assignment_status ?? "active",
        } as unknown as WhatsAppSender;
      }
    } catch {
      primarySender = null;
    }
  }

  return {
    profile,
    restaurant,
    aiAgent,
    primarySender,
    setupStatus: deriveSetupStatus(restaurant, primarySender),
    isMember,
  };
}

export async function getRestaurantForUserId(userId: string) {
  // Owner path: the user owns a restaurant.
  const { data: owned } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned) return owned as Restaurant;

  // Member path: the user is an active `team_members` staffer of a restaurant
  // owned by someone else. Without this fallback, every dashboard page would
  // bounce employees to /onboarding.
  const { data: member } = await adminSupabaseClient
    .from("team_members")
    .select("restaurant_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!member?.restaurant_id) return null;

  const { data: memberRestaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("id", member.restaurant_id)
    .maybeSingle();

  return (memberRestaurant as Restaurant | null) ?? null;
}

/**
 * Strict owner-only resolution: returns the restaurant ONLY if `userId` is its
 * owner. Unlike `getRestaurantForUserId` (which falls back to team membership),
 * this returns null for staff members — use it to gate owner-only surfaces
 * (team management, staff CRUD) so an employee's auth user can't reach them.
 */
export async function getOwnerRestaurantForUserId(userId: string) {
  const { data: restaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return restaurant as Restaurant | null;
}

export async function getActiveAgentForRestaurant(restaurantId: string) {
  const { data: aiAgent } = await adminSupabaseClient
    .from("ai_agents")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return aiAgent as AiAgent | null;
}
