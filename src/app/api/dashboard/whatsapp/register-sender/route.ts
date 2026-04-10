import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";
import {
  deleteWhatsAppSender,
  registerCustomerOwnedNumber,
} from "@/lib/twilio-provisioning";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const body = (await request.json()) as { phoneNumber?: string };
    const phoneNumber = body.phoneNumber?.trim();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "phoneNumber is required" },
        { status: 400 }
      );
    }

    if (!/^\+?[1-9]\d{6,14}$/.test(phoneNumber.replace(/\s+/g, ""))) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    const result = await registerCustomerOwnedNumber(
      user.id,
      restaurant.id,
      phoneNumber,
      restaurant.name
    );

    const now = new Date().toISOString();
    await adminSupabaseClient
      .from("restaurants")
      .update({
        twilio_phone_number: phoneNumber,
        setup_status: result.setupStatus,
        updated_at: now,
      })
      .eq("id", restaurant.id);

    return NextResponse.json(
      {
        senderSid: result.senderSid,
        senderStatus: result.senderStatus,
        setupStatus: result.setupStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Delete the current primary WhatsApp sender for this restaurant so the user
 * can start over (e.g. after a Meta-side rejection because the number was
 * still active on WhatsApp). Removes the sender from Twilio, deletes the
 * whatsapp_numbers row, and clears the restaurant's bot phone number.
 */
export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const { data: numberRow } = await adminSupabaseClient
      .from("whatsapp_numbers")
      .select("id, twilio_whatsapp_sender_sid")
      .eq("restaurant_id", restaurant.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (numberRow?.twilio_whatsapp_sender_sid) {
      try {
        await deleteWhatsAppSender(numberRow.twilio_whatsapp_sender_sid);
      } catch (twilioError) {
        // Surface but still clean up local state so the user can retry.
        console.error("Failed to delete Twilio sender:", twilioError);
      }
    }

    if (numberRow?.id) {
      await adminSupabaseClient
        .from("whatsapp_numbers")
        .delete()
        .eq("id", numberRow.id);
    }

    const now = new Date().toISOString();
    await adminSupabaseClient
      .from("restaurants")
      .update({
        twilio_phone_number: null,
        primary_whatsapp_number_id: null,
        setup_status: "pending_whatsapp",
        updated_at: now,
      })
      .eq("id", restaurant.id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
