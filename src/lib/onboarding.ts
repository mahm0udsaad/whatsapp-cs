import { adminSupabaseClient } from "@/lib/supabase/admin";
import { OnboardingPayload, SetupStatus } from "@/lib/types";
import { provisionRestaurantTwilioResources } from "@/lib/twilio-provisioning";

const COUNTRY_TIMEZONE: Record<string, string> = {
  EG: "Africa/Cairo",
  SA: "Asia/Riyadh",
  AE: "Asia/Dubai",
  KW: "Asia/Kuwait",
};

function getTimezone(country: string): string {
  return COUNTRY_TIMEZONE[country] ?? "UTC";
}

function normalizeLanguage(language: string): "ar" | "en" | "auto" {
  if (language === "ar" || language === "en") {
    return language;
  }

  return "auto";
}

function buildOffTopicResponse(language: "ar" | "en" | "auto") {
  if (language === "ar") {
    return "عذراً، أنا متخصص فقط في الإجابة على أسئلة المطعم.";
  }

  return "Sorry, I can only answer questions about the restaurant.";
}

function buildStarterKnowledgeBase(payload: OnboardingPayload, restaurantId: string) {
  const now = new Date().toISOString();
  const entries = [
    {
      restaurant_id: restaurantId,
      title: "Restaurant profile",
      content: `${payload.restaurantName} is an active restaurant customer using this WhatsApp assistant. Primary WhatsApp display name: ${payload.displayName}.`,
      source_type: "onboarding",
      metadata: { section: "profile" },
      created_at: now,
      updated_at: now,
    },
    {
      restaurant_id: restaurantId,
      title: "Assistant instructions",
      content: payload.agentInstructions,
      source_type: "onboarding",
      metadata: { section: "ai_agent" },
      created_at: now,
      updated_at: now,
    },
  ];

  if (payload.websiteUrl) {
    entries.push({
      restaurant_id: restaurantId,
      title: "Website",
      content: `Official restaurant website: ${payload.websiteUrl}`,
      source_type: "onboarding",
      metadata: { section: "website" },
      created_at: now,
      updated_at: now,
    });
  }

  if (payload.menuUrl) {
    entries.push({
      restaurant_id: restaurantId,
      title: "Digital menu source",
      content: `The restaurant menu can be imported from ${payload.menuUrl}.`,
      source_type: "onboarding",
      metadata: { section: "menu" },
      created_at: now,
      updated_at: now,
    });
  }

  return entries;
}

async function createProvisioningRun(
  restaurantId: string,
  phase: string,
  status: string,
  metadata: Record<string, unknown>
) {
  try {
    await adminSupabaseClient.from("provisioning_runs").insert({
      restaurant_id: restaurantId,
      provider: "twilio",
      phase,
      status,
      metadata,
    });
  } catch {
    // Migration may not be applied yet. Keep onboarding functional.
  }
}

export async function provisionRestaurantForUser(
  userId: string,
  email: string | null,
  payload: OnboardingPayload
) {
  const now = new Date().toISOString();
  const language = normalizeLanguage(payload.language);

  await adminSupabaseClient.from("profiles").upsert({
    id: userId,
    email,
    updated_at: now,
  });

  const { data: existingRestaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let restaurantId = existingRestaurant?.id as string | undefined;
  let assignedPhoneNumber = existingRestaurant?.twilio_phone_number as string | null;
  let setupStatus: SetupStatus = existingRestaurant?.setup_status ?? "draft";

  if (!restaurantId) {
    const { data: createdRestaurant, error } = await adminSupabaseClient
      .from("restaurants")
      .insert({
        owner_id: userId,
        name: payload.restaurantName,
        country: payload.country,
        currency: payload.currency,
        timezone: getTimezone(payload.country),
        digital_menu_url: payload.menuUrl || null,
        twilio_phone_number: null,
        is_active: true,
      })
      .select("*")
      .single();

    if (error || !createdRestaurant) {
      throw new Error(`Failed to create restaurant: ${error?.message}`);
    }

    restaurantId = createdRestaurant.id;
  } else {
    const { error } = await adminSupabaseClient
      .from("restaurants")
      .update({
        name: payload.restaurantName,
        country: payload.country,
        currency: payload.currency,
        timezone: getTimezone(payload.country),
        digital_menu_url: payload.menuUrl || null,
        updated_at: now,
      })
      .eq("id", restaurantId);

    if (error) {
      throw new Error(`Failed to update restaurant: ${error.message}`);
    }
  }

  if (!restaurantId) {
    throw new Error("Restaurant provisioning did not produce a restaurant id.");
  }

  if (!assignedPhoneNumber) {
    try {
      const twilioProvisioning = await provisionRestaurantTwilioResources({
        restaurantId,
        restaurantName: payload.restaurantName,
      });
      assignedPhoneNumber = twilioProvisioning.assignedPhoneNumber;
      setupStatus = twilioProvisioning.setupStatus;
    } catch {
      setupStatus = "pending_whatsapp";
    }
  } else {
    setupStatus = "active";
  }

  await adminSupabaseClient
    .from("restaurants")
    .update({
      twilio_phone_number: assignedPhoneNumber,
      setup_status: setupStatus,
      onboarding_completed_at: now,
      website_url: payload.websiteUrl || null,
      updated_at: now,
    })
    .eq("id", restaurantId);

  const { data: existingAgent } = await adminSupabaseClient
    .from("ai_agents")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const agentPayload = {
    restaurant_id: restaurantId,
    name: payload.agentName,
    personality: payload.personality,
    system_instructions: payload.agentInstructions,
    language_preference: language,
    off_topic_response: buildOffTopicResponse(language),
    chat_mode: "text_input",
    is_active: true,
    updated_at: now,
  };

  if (existingAgent) {
    await adminSupabaseClient
      .from("ai_agents")
      .update(agentPayload)
      .eq("id", existingAgent.id);
  } else {
    await adminSupabaseClient.from("ai_agents").insert({
      ...agentPayload,
      created_at: now,
    });
  }

  const { count } = await adminSupabaseClient
    .from("knowledge_base")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);

  if (!count) {
    await adminSupabaseClient
      .from("knowledge_base")
      .insert(buildStarterKnowledgeBase(payload, restaurantId));
  }

  await createProvisioningRun(
    restaurantId,
    assignedPhoneNumber ? "number_assignment" : "awaiting_number_assignment",
    assignedPhoneNumber ? "completed" : "pending",
    {
      assignedPhoneNumber,
      language,
      displayName: payload.displayName,
    }
  );

  return {
    restaurantId,
    assignedPhoneNumber,
    setupStatus,
  };
}
