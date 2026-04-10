import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getTwilioClient } from "@/lib/twilio";

/**
 * Actual DB schema (from saas_foundation migration):
 *
 * whatsapp_numbers:
 *   assignment_status: 'available'|'reserved'|'assigned'|'active'|'suspended'|'released'
 *   onboarding_status: 'unclaimed'|'pending_embedded_signup'|'pending_sender_registration'|'pending_test'|'active'|'failed'
 *   source_type: 'pool'|'customer_owned'
 *   is_primary: boolean
 *   twilio_subaccount_sid, twilio_messaging_service_sid, twilio_whatsapp_sender_sid
 *   NO: status, is_whatsapp_enabled, label, twilio_phone_sid
 *
 * provisioning_runs:
 *   owner_id: uuid NOT NULL (required)
 *   whatsapp_number_id: uuid
 *   current_step: text
 *   NO: provider, phase, error_detail
 *
 * NO whatsapp_senders table
 * NO twilio_subaccounts table
 */

async function createProvisioningRun(
  userId: string,
  restaurantId: string,
  whatsappNumberId: string | null,
  status: string,
  currentStep: string,
  metadata: Record<string, unknown> = {},
  completed = false
) {
  try {
    const now = new Date().toISOString();
    await adminSupabaseClient.from("provisioning_runs").insert({
      owner_id: userId,
      restaurant_id: restaurantId,
      whatsapp_number_id: whatsappNumberId,
      status,
      current_step: currentStep,
      metadata,
      completed_at: completed ? now : null,
    });
  } catch {
    // Non-fatal — provisioning_runs is observability only
  }
}

/**
 * Sync primary Twilio number into whatsapp_numbers pool.
 * Used by pool-based provisioning.
 */
export async function ensurePrimaryNumberInventory() {
  const primaryTwilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!primaryTwilioPhoneNumber) return null;

  const now = new Date().toISOString();

  try {
    const twilioNumbers = await getTwilioClient().incomingPhoneNumbers.list({
      limit: 100,
    });

    for (const number of twilioNumbers) {
      await adminSupabaseClient.from("whatsapp_numbers").upsert(
        {
          phone_number: number.phoneNumber,
          source_type: "pool",
          is_primary: false,
          assignment_status: "available",
          onboarding_status: "active",
          updated_at: now,
        },
        { onConflict: "phone_number" }
      );
    }
  } catch {
    // Non-fatal
  }

  const { data } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .upsert(
      {
        phone_number: primaryTwilioPhoneNumber,
        source_type: "pool",
        is_primary: false,
        assignment_status: "available",
        onboarding_status: "active",
        metadata: { source: "env" },
        updated_at: now,
      },
      { onConflict: "phone_number" }
    )
    .select("*")
    .single();

  return data;
}

/**
 * Find and assign a pooled WhatsApp number to a restaurant.
 */
export async function assignAvailableWhatsAppNumber(restaurantId: string) {
  const now = new Date().toISOString();

  // Already assigned?
  const { data: already } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (already) return already;

  const { data: available } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .select("*")
    .eq("assignment_status", "available")
    .eq("source_type", "pool")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!available) return null;

  const { data: assigned, error } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .update({
      assignment_status: "assigned",
      restaurant_id: restaurantId,
      is_primary: true,
      assigned_at: now,
      updated_at: now,
    })
    .eq("id", available.id)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to assign WhatsApp number: ${error.message}`);

  return assigned;
}

type SenderApiResult = { sid: string; status: string };

function getTwilioBasicAuth(): string {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured");
  }
  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

/**
 * Fetch the latest status of a sender from Twilio.
 * Returns null on 404 (sender no longer exists).
 */
export async function getWhatsAppSenderStatus(
  sid: string
): Promise<SenderApiResult | null> {
  const auth = getTwilioBasicAuth();
  const response = await fetch(
    `https://messaging.twilio.com/v2/Channels/Senders/${encodeURIComponent(sid)}`,
    {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Twilio Senders API GET ${response.status}: ${body.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as { sid?: string; status?: string };
  if (!json.sid) return null;
  return { sid: json.sid, status: (json.status ?? "UNKNOWN").toUpperCase() };
}

/**
 * Delete a WhatsApp sender from Twilio.
 * Idempotent — treats 404 as success so callers can clean up DB rows safely.
 */
export async function deleteWhatsAppSender(sid: string): Promise<void> {
  const auth = getTwilioBasicAuth();
  const response = await fetch(
    `https://messaging.twilio.com/v2/Channels/Senders/${encodeURIComponent(sid)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Basic ${auth}` },
    }
  );

  if (response.status === 404) return; // already gone
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Twilio Senders API DELETE ${response.status}: ${body.slice(0, 500)}`
    );
  }
}

/**
 * Register a phone number as a WhatsApp sender via Twilio's Channels/Senders v2 API.
 * Docs: https://www.twilio.com/docs/messaging/channels/whatsapp/onboarding-api
 */
async function registerWhatsAppSenderViaApi(
  phoneNumber: string,
  businessName: string,
  webhookUrl: string
): Promise<SenderApiResult> {
  const auth = getTwilioBasicAuth();
  const senderId = phoneNumber.startsWith("whatsapp:")
    ? phoneNumber
    : `whatsapp:${phoneNumber}`;

  const response = await fetch("https://messaging.twilio.com/v2/Channels/Senders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_id: senderId,
      profile: { name: businessName },
      webhook: {
        callback_url: webhookUrl,
        callback_method: "POST",
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Twilio Senders API ${response.status}: ${errorBody.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as { sid?: string; status?: string };
  if (!json.sid) {
    throw new Error("Twilio Senders API returned no sid");
  }
  return { sid: json.sid, status: (json.status ?? "CREATING").toUpperCase() };
}

function mapSenderStatusToOnboarding(
  status: string | null
): "active" | "pending_test" | "pending_sender_registration" | "failed" {
  if (!status) return "pending_sender_registration";
  switch (status.toUpperCase()) {
    case "ONLINE":
    case "VERIFIED":
      return "active";
    case "FAILED":
      return "failed";
    default:
      return "pending_test";
  }
}

/**
 * Register a customer-provided phone number as a WhatsApp Business sender.
 *
 * IMPORTANT: The phone number MUST NOT be active on any WhatsApp client
 * (mobile, Business, or Web) when this is called. Twilio's Sender API will
 * reject the registration otherwise. Users must delete WhatsApp from any
 * device using this number before submitting.
 *
 * Always upserts a whatsapp_numbers row + provisioning_runs entry, so a
 * failed registration leaves a "pending" record the user can retry from
 * the dashboard.
 */
export async function registerCustomerOwnedNumber(
  userId: string,
  restaurantId: string,
  phoneNumber: string,
  businessName: string
) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
  const now = new Date().toISOString();
  const normalizedNumber = phoneNumber.trim();

  let senderSid: string | null = null;
  let senderStatus: string | null = null;
  let lastError: string | null = null;

  try {
    const result = await registerWhatsAppSenderViaApi(
      normalizedNumber,
      businessName,
      webhookUrl
    );
    senderSid = result.sid;
    senderStatus = result.status;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Unknown error";
  }

  const onboardingStatus = mapSenderStatusToOnboarding(senderStatus);
  const isFullyActive = onboardingStatus === "active";

  const { data: numberRecord, error: numberError } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .upsert(
      {
        phone_number: normalizedNumber,
        source_type: "customer_owned",
        is_primary: true,
        assignment_status: senderSid ? "active" : "assigned",
        onboarding_status: onboardingStatus,
        twilio_whatsapp_sender_sid: senderSid,
        last_error: lastError,
        restaurant_id: restaurantId,
        assigned_at: now,
        updated_at: now,
      },
      { onConflict: "phone_number" }
    )
    .select("id")
    .single();

  if (numberError || !numberRecord) {
    throw new Error(`Failed to save bot phone number: ${numberError?.message}`);
  }

  // Link the number as this restaurant's primary WhatsApp number
  await adminSupabaseClient
    .from("restaurants")
    .update({
      primary_whatsapp_number_id: numberRecord.id,
      updated_at: now,
    })
    .eq("id", restaurantId);

  await createProvisioningRun(
    userId,
    restaurantId,
    numberRecord.id,
    onboardingStatus,
    onboardingStatus,
    { phoneNumber: normalizedNumber, webhookUrl, senderSid, senderStatus, lastError },
    isFullyActive
  );

  if (lastError) {
    // Surface the failure to the caller — but the row exists for retry.
    throw new Error(lastError);
  }

  return {
    numberRecord,
    senderSid,
    senderStatus,
    setupStatus: isFullyActive ? ("active" as const) : ("pending_whatsapp" as const),
  };
}

/**
 * Pool-based provisioning: assigns an available number from inventory.
 */
export async function provisionRestaurantTwilioResources(
  userId: string,
  restaurantId: string,
  restaurantName: string
) {
  await ensurePrimaryNumberInventory();

  const assignedNumber = await assignAvailableWhatsAppNumber(restaurantId);

  if (!assignedNumber?.phone_number) {
    await createProvisioningRun(
      userId,
      restaurantId,
      null,
      "pending_number_assignment",
      "pending_number_assignment",
      { restaurantName },
      false
    );
    return {
      assignedPhoneNumber: null as string | null,
      setupStatus: "pending_whatsapp" as const,
    };
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
  const now = new Date().toISOString();

  // Configure webhook for the assigned number
  try {
    const matchingNumbers = await getTwilioClient().incomingPhoneNumbers.list({
      phoneNumber: assignedNumber.phone_number,
      limit: 5,
    });
    if (matchingNumbers.length > 0) {
      await getTwilioClient()
        .incomingPhoneNumbers(matchingNumbers[0].sid)
        .update({ smsUrl: webhookUrl, smsMethod: "POST" });
    }
  } catch {
    // Non-fatal
  }

  // Mark as active and link to restaurant
  await adminSupabaseClient
    .from("whatsapp_numbers")
    .update({
      assignment_status: "active",
      onboarding_status: "active",
      is_primary: true,
      updated_at: now,
    })
    .eq("id", assignedNumber.id);

  await adminSupabaseClient
    .from("restaurants")
    .update({
      primary_whatsapp_number_id: assignedNumber.id,
      updated_at: now,
    })
    .eq("id", restaurantId);

  await createProvisioningRun(
    userId,
    restaurantId,
    assignedNumber.id,
    "active",
    "active",
    { phoneNumber: assignedNumber.phone_number },
    true
  );

  return {
    assignedPhoneNumber: assignedNumber.phone_number as string,
    setupStatus: "active" as const,
  };
}
