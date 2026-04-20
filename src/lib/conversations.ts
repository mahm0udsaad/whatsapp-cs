/**
 * Shared helper for locating or creating the single active `conversations`
 * row for a tenant + customer phone. Extracted from
 * `src/app/api/webhooks/twilio/route.ts` so routes that need to "send a
 * WhatsApp message to this phone number" can reuse the exact same logic the
 * webhook uses for inbound traffic.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { isInTwilioCsWindow } from "@/lib/cs-window";

export { isInTwilioCsWindow };

export interface FindOrCreateResult {
  id: string;
  restaurant_id: string;
  customer_phone: string;
  last_inbound_at: string | null;
  last_message_at: string | null;
  status: string;
  is_new: boolean;
  /** True if `last_inbound_at` is within the Twilio 24h CS window. */
  in_24h_window: boolean;
}

// Use the shared, dependency-free helper from `cs-window.ts` so tests can
// validate the 24h-window arithmetic in isolation.
const inWindow = isInTwilioCsWindow;

/**
 * Look up the most recent conversation for `(restaurantId, customerPhone)`.
 * If one exists, return it (its activity fields are NOT bumped by this
 * helper — the Twilio webhook path does that when a real inbound arrives).
 * If no row exists, create a fresh `active` conversation seeded with `now()`
 * for `started_at` / `last_message_at` and a null `last_inbound_at`.
 */
export async function findOrCreateConversationForPhone(
  restaurantId: string,
  customerPhone: string
): Promise<FindOrCreateResult> {
  const { data: existing } = await adminSupabaseClient
    .from("conversations")
    .select(
      "id, restaurant_id, customer_phone, last_inbound_at, last_message_at, status, started_at"
    )
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", customerPhone)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return {
      id: existing.id as string,
      restaurant_id: existing.restaurant_id as string,
      customer_phone: existing.customer_phone as string,
      last_inbound_at: (existing.last_inbound_at as string | null) ?? null,
      last_message_at: (existing.last_message_at as string | null) ?? null,
      status: (existing.status as string) ?? "active",
      is_new: false,
      in_24h_window: inWindow(existing.last_inbound_at as string | null),
    };
  }

  const now = new Date().toISOString();
  const { data: created, error } = await adminSupabaseClient
    .from("conversations")
    .insert({
      restaurant_id: restaurantId,
      customer_phone: customerPhone,
      status: "active",
      started_at: now,
      last_message_at: now,
      last_inbound_at: null,
    })
    .select(
      "id, restaurant_id, customer_phone, last_inbound_at, last_message_at, status"
    )
    .single();

  if (error || !created) {
    throw new Error(
      `Failed to create conversation: ${error?.message ?? "unknown error"}`
    );
  }

  return {
    id: created.id as string,
    restaurant_id: created.restaurant_id as string,
    customer_phone: created.customer_phone as string,
    last_inbound_at: null,
    last_message_at: (created.last_message_at as string) ?? now,
    status: (created.status as string) ?? "active",
    is_new: true,
    in_24h_window: false,
  };
}

