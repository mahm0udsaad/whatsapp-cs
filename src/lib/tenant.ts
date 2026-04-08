import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AiAgent,
  Profile,
  Restaurant,
  SetupStatus,
  TenantContext,
  WhatsAppSender,
} from "@/lib/types";

function deriveSetupStatus(restaurant: Restaurant | null, sender: WhatsAppSender | null): SetupStatus {
  if (!restaurant) {
    return "draft";
  }

  if (restaurant.setup_status) {
    return restaurant.setup_status;
  }

  if (sender?.status === "active") {
    return "active";
  }

  if (restaurant.twilio_phone_number) {
    return "pending_whatsapp";
  }

  return "draft";
}

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getTenantContextForUser(userId: string): Promise<TenantContext | null> {
  const { data: profile } = await adminSupabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const { data: restaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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

  let primarySender: WhatsAppSender | null = null;
  if (restaurant) {
    try {
      const { data } = await adminSupabaseClient
        .from("whatsapp_senders")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();

      primarySender = data;
    } catch {
      primarySender = null;
    }
  }

  return {
    profile: profile as Profile,
    restaurant: restaurant as Restaurant | null,
    aiAgent,
    primarySender,
    setupStatus: deriveSetupStatus(
      restaurant as Restaurant | null,
      primarySender
    ),
  };
}

export async function getRestaurantForUserId(userId: string) {
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
