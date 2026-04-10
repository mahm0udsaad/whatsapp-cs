import { adminSupabaseClient } from "@/lib/supabase/admin";
import { OnboardingPayload, SetupStatus } from "@/lib/types";
import {
  provisionRestaurantTwilioResources,
  registerCustomerOwnedNumber,
} from "@/lib/twilio-provisioning";
import { crawlWebsiteForKnowledgeBase } from "@/lib/website-kb-crawler";

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
    return "عذراً، أنا متخصص فقط في الإجابة على أسئلة هذا العمل.";
  }

  return "Sorry, I can only answer questions about this business.";
}

function buildStarterKnowledgeBase(payload: OnboardingPayload, restaurantId: string) {
  const now = new Date().toISOString();

  const profileParts = [
    `${payload.restaurantName} is an active business using this WhatsApp assistant.`,
    `WhatsApp display name: ${payload.displayName}.`,
  ];
  if (payload.businessCategory) profileParts.push(`Business type: ${payload.businessCategory}.`);
  if (payload.telephone) profileParts.push(`Contact phone: ${payload.telephone}.`);
  if (payload.openingHours) profileParts.push(`Hours: ${payload.openingHours}.`);

  const entries = [
    {
      restaurant_id: restaurantId,
      title: "Business profile",
      content: profileParts.join(" "),
      source_type: "manual",
      metadata: { section: "profile" },
      created_at: now,
      updated_at: now,
    },
    {
      restaurant_id: restaurantId,
      title: "Assistant instructions",
      content: payload.agentInstructions,
      source_type: "manual",
      metadata: { section: "ai_agent" },
      created_at: now,
      updated_at: now,
    },
  ];

  if (payload.websiteUrl) {
    entries.push({
      restaurant_id: restaurantId,
      title: "Website",
      content: `Official business website: ${payload.websiteUrl}`,
      source_type: "manual",
      metadata: { section: "website" },
      created_at: now,
      updated_at: now,
    });
  }

  if (payload.menuUrl) {
    entries.push({
      restaurant_id: restaurantId,
      title: "Catalog / menu source",
      content: `Products or services catalog can be found at ${payload.menuUrl}.`,
      source_type: "manual",
      metadata: { section: "menu" },
      created_at: now,
      updated_at: now,
    });
  }

  return entries;
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
        logo_url: payload.logoUrl || null,
        telephone: payload.telephone || null,
        opening_hours: payload.openingHours || null,
        cuisine: payload.businessCategory || null,
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
        logo_url: payload.logoUrl || null,
        telephone: payload.telephone || null,
        opening_hours: payload.openingHours || null,
        cuisine: payload.businessCategory || null,
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
    if (payload.botPhoneNumber) {
      try {
        // User supplied their own number — register it as a WhatsApp sender via Twilio
        const result = await registerCustomerOwnedNumber(
          userId,
          restaurantId,
          payload.botPhoneNumber,
          payload.displayName || payload.restaurantName,
          payload.logoUrl
        );
        assignedPhoneNumber = payload.botPhoneNumber;
        setupStatus = result.setupStatus;
      } catch {
        // Registration failed (e.g. number still active on WhatsApp).
        // Save the requested number so the dashboard alert can prompt a retry.
        assignedPhoneNumber = payload.botPhoneNumber;
        setupStatus = "pending_whatsapp";
      }
    } else {
      // No bot number provided yet — user will complete it from the dashboard
      // via /dashboard/whatsapp-setup. Leave the restaurant in pending_whatsapp.
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

    // Deep-crawl the website and add its content as additional KB entries.
    // Runs fire-and-forget style inside the same request — failures are silent
    // so they never block provisioning.
    if (payload.websiteUrl) {
      crawlWebsiteForKnowledgeBase(payload.websiteUrl, restaurantId)
        .then(async (entries) => {
          if (entries.length > 0) {
            await adminSupabaseClient.from("knowledge_base").insert(entries);
          }
        })
        .catch(() => {
          // Non-fatal — website crawl enrichment is best-effort
        });
    }
  }

  return {
    restaurantId,
    assignedPhoneNumber,
    setupStatus,
  };
}
