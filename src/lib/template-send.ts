/**
 * Server-side helpers shared by the mobile "new chat / send template" routes.
 * Every lookup is scoped to the resolved restaurant.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";

export const E164 = /^\+[1-9]\d{1,14}$/;

export function twilioStatusCallbackUrl(): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
  return `${appUrl}/api/webhooks/twilio/status`;
}

/** Restaurant's outbound WhatsApp number (same order as the reply route). */
export async function resolveSenderPhone(restaurantId: string): Promise<string | null> {
  try {
    const { data: sender } = await adminSupabaseClient
      .from("whatsapp_senders")
      .select("phone_number")
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (sender?.phone_number) return sender.phone_number as string;
  } catch {
    // whatsapp_senders may not exist yet; fall through.
  }
  const { data: restaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("twilio_phone_number")
    .eq("id", restaurantId)
    .maybeSingle();
  return (
    (restaurant?.twilio_phone_number as string | null) ||
    process.env.TWILIO_PHONE_NUMBER ||
    null
  );
}

/** Either opt-out source of truth (customers flag or opt_outs row) blocks. */
export async function isPhoneOptedOut(
  restaurantId: string,
  phone: string
): Promise<boolean> {
  const [{ data: customer }, { data: optOut }] = await Promise.all([
    adminSupabaseClient
      .from("customers")
      .select("opted_out")
      .eq("restaurant_id", restaurantId)
      .eq("phone_number", phone)
      .maybeSingle(),
    adminSupabaseClient
      .from("opt_outs")
      .select("phone_number")
      .eq("restaurant_id", restaurantId)
      .eq("phone_number", phone)
      .limit(1)
      .maybeSingle(),
  ]);
  return !!customer?.opted_out || !!optOut;
}

export const OPTED_OUT_ERROR = "هذا العميل ألغى الاشتراك في الرسائل ولا يمكن مراسلته.";
