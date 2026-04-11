import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getRestaurantForUserId } from "@/lib/tenant";
import { sendWhatsAppMessage } from "@/lib/twilio";

interface RespondBody {
  action: "confirm" | "reject" | "reply";
  admin_note?: string;
  admin_reply?: string; // message to send on WhatsApp
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const { id } = await params;
  const body: RespondBody = await request.json();

  // Verify order belongs to this restaurant
  const { data: order, error: fetchError } = await adminSupabaseClient
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("restaurant_id", restaurant.id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const newStatus =
    body.action === "confirm" ? "confirmed" :
    body.action === "reject"  ? "rejected"  : "replied";

  // Build WhatsApp message to send
  let whatsappMessage = body.admin_reply?.trim() || "";

  if (!whatsappMessage) {
    if (body.action === "confirm") {
      whatsappMessage = order.type === "reservation"
        ? `✅ تم تأكيد حجزك! ${body.admin_note ? `\n${body.admin_note}` : ""}`
        : `✅ تم تأكيد طلبك. ${body.admin_note ? `\n${body.admin_note}` : ""}`;
    } else if (body.action === "reject") {
      whatsappMessage = `عذراً، لم نتمكن من تأكيد طلبك في هذا الوقت. ${body.admin_note || ""}`.trim();
    }
  }

  // Send WhatsApp message if we have a message and customer phone
  let messageSid: string | undefined;
  if (whatsappMessage && order.customer_phone) {
    try {
      messageSid = await sendWhatsAppMessage(
        order.customer_phone,
        whatsappMessage,
        {
          fromPhoneNumber: restaurant.twilio_phone_number || undefined,
          statusCallback: `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/api/webhooks/twilio/status`,
        }
      );
    } catch (err) {
      console.error("[orders/respond] WhatsApp send failed:", err);
      // Continue — update the DB even if WhatsApp fails
    }
  }

  // Update order in DB
  const { error: updateError } = await adminSupabaseClient
    .from("orders")
    .update({
      status: newStatus,
      admin_note: body.admin_note || null,
      admin_reply: whatsappMessage || null,
      replied_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, messageSid: messageSid ?? null });
}
