/**
 * Push fanout for Nehgz Hub booking events.
 *
 * Triggered from the /api/webhooks/nehgz receiver. Given a restaurant + the
 * raw event payload, looks up every active team member's Expo push token and
 * sends a localized title/body so the merchant sees a new-booking notification
 * on their phone within seconds of the Hub firing the webhook.
 *
 * Fire-and-forget from the webhook handler — we ACK 200 to the Hub regardless,
 * since the event row is persisted and can be replayed.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendExpoPush, type ExpoPushMessage } from "@/lib/expo-push";

// Matches the Android channel created in mobile/lib/push.ts.
const PUSH_CHANNEL = "reservations";

export type NehgzEvent =
  | "booking.created"
  | "booking.updated"
  | "booking.cancelled"
  | "booking.completed"
  | "payment.updated"
  | "webhook.test";

interface BookingData {
  id?: string;
  date?: string;
  time_from?: string;
  time_to?: string;
  status?: string;
  customer?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  service?: {
    title?: { ar?: string; en?: string } | string | null;
  } | null;
  staff?: { name?: string | null } | null;
  total?: number | null;
  currency?: string | null;
  [key: string]: unknown;
}

export interface NehgzWebhookPayload {
  event_id: string;
  event: NehgzEvent | string;
  occurred_at?: string;
  version?: string;
  merchant_id?: string;
  branch_id?: string | null;
  data?: BookingData & { message?: string };
}

async function fetchPushTokens(
  restaurantId: string
): Promise<Array<{ id: string; expo_token: string }>> {
  const { data: members, error: membersErr } = await adminSupabaseClient
    .from("team_members")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  if (membersErr) {
    console.error("[nehgz-notifications] team_members lookup failed:", membersErr.message);
    return [];
  }
  const memberIds = (members ?? []).map((m) => m.id as string);
  if (memberIds.length === 0) return [];

  const { data, error } = await adminSupabaseClient
    .from("user_push_tokens")
    .select("id, expo_token")
    .in("team_member_id", memberIds)
    .eq("disabled", false);
  if (error) {
    console.error("[nehgz-notifications] user_push_tokens read failed:", error.message);
    return [];
  }
  return (data ?? []) as Array<{ id: string; expo_token: string }>;
}

async function disableInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await adminSupabaseClient
    .from("user_push_tokens")
    .update({ disabled: true })
    .in("expo_token", tokens);
  if (error) {
    console.error("[nehgz-notifications] failed to disable tokens:", error.message);
  }
}

function pickServiceTitle(service: BookingData["service"]): string | null {
  if (!service) return null;
  const t = service.title;
  if (!t) return null;
  if (typeof t === "string") return t;
  return t.ar || t.en || null;
}

function formatTitleBody(payload: NehgzWebhookPayload): { title: string; body: string } {
  const d = payload.data ?? {};
  const customerName = d.customer?.name?.trim();
  const customerPhone = d.customer?.phone?.trim();
  const customer = customerName || customerPhone || "عميل";
  const service = pickServiceTitle(d.service);
  const when = [d.date, d.time_from].filter(Boolean).join(" ");
  const total =
    d.total != null
      ? `${d.total}${d.currency ? ` ${d.currency}` : ""}`
      : null;

  switch (payload.event) {
    case "booking.created":
      return {
        title: "حجز جديد",
        body: [customer, service, when, total].filter(Boolean).join(" • "),
      };
    case "booking.updated":
      return {
        title: "تعديل حجز",
        body: [customer, service, when].filter(Boolean).join(" • "),
      };
    case "booking.cancelled":
      return {
        title: "إلغاء حجز",
        body: [customer, service, when].filter(Boolean).join(" • "),
      };
    case "booking.completed":
      return {
        title: "حجز مكتمل",
        body: [customer, service, total].filter(Boolean).join(" • "),
      };
    case "payment.updated":
      return {
        title: "تحديث دفع",
        body: [customer, total, d.status].filter(Boolean).join(" • "),
      };
    case "webhook.test":
      return { title: "Nehgz Hub", body: d.message || "اختبار اتصال" };
    default:
      return { title: "تنبيه نِحجز", body: payload.event };
  }
}

export async function notifyMerchantOfNehgzEvent(
  restaurantId: string,
  payload: NehgzWebhookPayload
): Promise<{ sent: number; skipped: number; errors: number }> {
  const tokens = await fetchPushTokens(restaurantId);
  if (tokens.length === 0) {
    console.warn(
      `[nehgz-notifications] no active push tokens for restaurant=${restaurantId}`
    );
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const { title, body } = formatTitleBody(payload);

  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.expo_token,
    title,
    body,
    data: {
      type: "nehgz_event",
      event: payload.event,
      eventId: payload.event_id,
      bookingId: payload.data?.id ?? null,
      merchantId: payload.merchant_id ?? null,
      restaurantId,
    },
    priority: "high",
    channelId: PUSH_CHANNEL,
    sound: "default",
  }));

  const result = await sendExpoPush(messages);
  if (result.invalidTokens.length > 0) {
    await disableInvalidTokens(result.invalidTokens);
  }
  if (result.errors.length > 0) {
    console.warn(
      `[nehgz-notifications] restaurant=${restaurantId} event=${payload.event} sent=${result.sent} skipped=${result.skipped} errors=${result.errors.length}`
    );
  }
  return { sent: result.sent, skipped: result.skipped, errors: result.errors.length };
}
