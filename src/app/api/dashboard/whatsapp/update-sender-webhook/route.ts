import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";
import { updateWhatsAppSenderWebhook } from "@/lib/twilio-provisioning";

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
      .select("twilio_whatsapp_sender_sid")
      .eq("restaurant_id", restaurant.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (!numberRow?.twilio_whatsapp_sender_sid) {
      return NextResponse.json({ error: "No sender registered" }, { status: 404 });
    }

    await updateWhatsAppSenderWebhook(numberRow.twilio_whatsapp_sender_sid);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
