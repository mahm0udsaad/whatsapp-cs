import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";
import { getWhatsAppSenderStatus } from "@/lib/twilio-provisioning";

export async function POST() {
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

    if (!numberRow?.twilio_whatsapp_sender_sid) {
      return NextResponse.json({ error: "No sender registered" }, { status: 404 });
    }

    const result = await getWhatsAppSenderStatus(
      numberRow.twilio_whatsapp_sender_sid
    );

    if (!result) {
      return NextResponse.json({ error: "Sender not found on Twilio" }, { status: 404 });
    }

    const isActive = result.status === "ONLINE" || result.status === "VERIFIED";
    const onboardingStatus = isActive ? "active" : "pending_test";
    const now = new Date().toISOString();

    await adminSupabaseClient
      .from("whatsapp_numbers")
      .update({ onboarding_status: onboardingStatus, updated_at: now })
      .eq("id", numberRow.id);

    if (isActive) {
      await adminSupabaseClient
        .from("restaurants")
        .update({ setup_status: "active", updated_at: now })
        .eq("id", restaurant.id);
    }

    return NextResponse.json(
      { twilioStatus: result.status, onboardingStatus },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
