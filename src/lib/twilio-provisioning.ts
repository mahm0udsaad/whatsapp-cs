import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getTwilioClient } from "@/lib/twilio";

const primaryTwilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

interface ProvisionTwilioResourcesOptions {
  restaurantId: string;
  restaurantName: string;
}

async function createProvisioningRun(
  restaurantId: string,
  phase: string,
  status: string,
  metadata: Record<string, unknown> = {},
  error?: string
) {
  try {
    const now = new Date().toISOString();
    await adminSupabaseClient.from("provisioning_runs").insert({
      restaurant_id: restaurantId,
      provider: "twilio",
      phase,
      status,
      metadata,
      error_detail: error,
      started_at: now,
      completed_at: status === "completed" ? now : null,
      created_at: now,
      updated_at: now,
    });
  } catch {
    // Keep provisioning resilient if migration is not applied yet.
  }
}

export async function ensurePrimaryNumberInventory() {
  const twilioNumbers = await getTwilioClient().incomingPhoneNumbers.list({
    limit: 100,
  });

  const now = new Date().toISOString();

  for (const number of twilioNumbers) {
    await adminSupabaseClient.from("whatsapp_numbers").upsert(
      {
        phone_number: number.phoneNumber,
        label: number.friendlyName || "Twilio number",
        twilio_phone_sid: number.sid,
        twilio_subaccount_sid: number.accountSid,
        status: "available",
        is_whatsapp_enabled: number.phoneNumber === primaryTwilioPhoneNumber,
        metadata: {
          source: "twilio_sync",
          capabilities: number.capabilities || {},
        },
        updated_at: now,
      },
      { onConflict: "phone_number" }
    );
  }

  if (!primaryTwilioPhoneNumber) {
    return null;
  }

  const { data, error } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .upsert(
      {
        phone_number: primaryTwilioPhoneNumber,
        label: "Primary platform number",
        status: "available",
        is_whatsapp_enabled: true,
        metadata: { source: "env" },
        updated_at: now,
      },
      { onConflict: "phone_number" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to sync WhatsApp number inventory: ${error.message}`);
  }

  return data;
}

export async function ensureRestaurantSubaccount({
  restaurantId,
  restaurantName,
}: ProvisionTwilioResourcesOptions) {
  const { data: existing } = await adminSupabaseClient
    .from("twilio_subaccounts")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (existing?.account_sid) {
    return existing;
  }

  const now = new Date().toISOString();

  try {
    const subaccount = await getTwilioClient().api.v2010.accounts.create({
      friendlyName: `restaurant:${restaurantName}`,
    });

    const payload = {
      restaurant_id: restaurantId,
      account_sid: subaccount.sid,
      friendly_name: subaccount.friendlyName || restaurantName,
      status: subaccount.status || "active",
      metadata: {
        dateCreated: subaccount.dateCreated?.toISOString?.() || null,
      },
      updated_at: now,
    };

    const { data, error } = await adminSupabaseClient
      .from("twilio_subaccounts")
      .upsert(payload, { onConflict: "restaurant_id" })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await createProvisioningRun(
      restaurantId,
      "subaccount_creation",
      "completed",
      { subaccountSid: subaccount.sid }
    );

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Twilio subaccount provisioning failed";
    await createProvisioningRun(
      restaurantId,
      "subaccount_creation",
      "failed",
      {},
      message
    );
    throw new Error(message);
  }
}

export async function assignAvailableWhatsAppNumber(
  restaurantId: string,
  twilioSubaccountId?: string | null
) {
  const { data: assigned } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .limit(1)
    .maybeSingle();

  if (assigned) {
    return assigned;
  }

  const { data: availableNumber } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .select("*")
    .eq("status", "available")
    .eq("is_whatsapp_enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!availableNumber) {
    await createProvisioningRun(
      restaurantId,
      "number_assignment",
      "pending",
      {},
      "No available WhatsApp numbers in inventory"
    );
    return null;
  }

  const now = new Date().toISOString();
  const { data: updatedNumber, error } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .update({
      status: "assigned",
      restaurant_id: restaurantId,
      assigned_at: now,
      twilio_subaccount_sid:
        availableNumber.twilio_subaccount_sid ||
        (twilioSubaccountId ?? null),
      updated_at: now,
    })
    .eq("id", availableNumber.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to assign WhatsApp number: ${error.message}`);
  }

  await createProvisioningRun(
    restaurantId,
    "number_assignment",
    "completed",
    { phoneNumber: updatedNumber.phone_number }
  );

  return updatedNumber;
}

export async function ensureRestaurantSenderRecord(
  restaurantId: string,
  phoneNumber: string,
  twilioSubaccountId?: string | null,
  whatsappNumberId?: string | null
) {
  const now = new Date().toISOString();

  const { data, error } = await adminSupabaseClient
    .from("whatsapp_senders")
    .upsert(
      {
        restaurant_id: restaurantId,
        twilio_subaccount_id: twilioSubaccountId || null,
        whatsapp_number_id: whatsappNumberId || null,
        phone_number: phoneNumber,
        status: "active",
        is_primary: true,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: "phone_number" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create WhatsApp sender record: ${error.message}`);
  }

  return data;
}

export async function provisionRestaurantTwilioResources({
  restaurantId,
  restaurantName,
}: ProvisionTwilioResourcesOptions) {
  await ensurePrimaryNumberInventory();
  const subaccount = await ensureRestaurantSubaccount({
    restaurantId,
    restaurantName,
  });
  const assignedNumber = await assignAvailableWhatsAppNumber(
    restaurantId,
    subaccount?.account_sid || null
  );

  if (!assignedNumber?.phone_number) {
    return {
      subaccount,
      assignedPhoneNumber: null,
      sender: null,
      setupStatus: "pending_whatsapp" as const,
    };
  }

  const sender = await ensureRestaurantSenderRecord(
    restaurantId,
    assignedNumber.phone_number,
    subaccount?.id || null,
    assignedNumber.id
  );

  await adminSupabaseClient
    .from("restaurants")
    .update({
      twilio_phone_number: assignedNumber.phone_number,
      setup_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", restaurantId);

  return {
    subaccount,
    assignedPhoneNumber: assignedNumber.phone_number,
    sender,
    setupStatus: "active" as const,
  };
}
