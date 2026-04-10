import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";
import { verifyWhatsAppSender } from "@/lib/twilio-provisioning";

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

    const body = (await request.json()) as {
      senderSid?: string;
      verificationCode?: string;
    };

    const { senderSid, verificationCode } = body;

    if (!senderSid || !verificationCode) {
      return NextResponse.json(
        { error: "senderSid and verificationCode are required" },
        { status: 400 }
      );
    }

    const { status } = await verifyWhatsAppSender(senderSid, verificationCode.trim());

    const isActive = status === "ONLINE" || status === "VERIFIED";
    const onboardingStatus = isActive ? "active" : "pending_test";
    const now = new Date().toISOString();

    await adminSupabaseClient
      .from("whatsapp_numbers")
      .update({ onboarding_status: onboardingStatus, updated_at: now })
      .eq("twilio_whatsapp_sender_sid", senderSid);

    if (isActive) {
      await adminSupabaseClient
        .from("restaurants")
        .update({ setup_status: "active", updated_at: now })
        .eq("id", restaurant.id);
    }

    return NextResponse.json({ status, onboardingStatus }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
