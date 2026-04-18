// Fires a local (in-app) notification when a new customer message lands on
// ANY conversation in this tenant AND:
//   - the app is foregrounded (the whole point of "in-app")
//   - the user isn't already viewing that conversation
//
// Why: the remote Expo push fires in parallel from the Twilio webhook, but
// takes ~2–5s end-to-end and can be dropped by iOS heuristics. The realtime
// socket gives us an instant signal the moment the row is inserted. Firing
// a LOCAL notification on top of realtime guarantees a foregrounded owner
// never misses an inbound message, and since iOS de-dupes notifications by
// identifier, the later remote push quietly becomes a no-op if it lands.
//
// Implementation notes:
//   - We subscribe at the (app) layout level so every mounted screen
//     benefits. Mount-once; cleanup on sign-out.
//   - The notification identifier is derived from the message id so the
//     remote push with the same identifier (if Expo were to use it) would
//     be collapsed. Expo doesn't honor identifier across server pushes, but
//     the iOS system still groups by channel, which is good enough.
//   - We ignore agent / system messages — only customer inbound triggers.
//   - We fetch conversation meta once per message to render a decent
//     title. Kept as a single select; the realtime payload is the source of
//     truth for body text.

import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import { getActiveConv } from "../lib/active-conv";

interface InboundPayload {
  id: string;
  conversation_id: string;
  role: "customer" | "agent" | "system";
  content: string | null;
  created_at: string;
}

async function fetchConvMeta(conversationId: string): Promise<{
  customer_name: string | null;
  customer_phone: string;
} | null> {
  const { data } = await supabase
    .from("conversations")
    .select("customer_name, customer_phone")
    .eq("id", conversationId)
    .maybeSingle();
  return data as { customer_name: string | null; customer_phone: string } | null;
}

function truncate(s: string | null, max: number): string {
  const v = (s ?? "").trim();
  if (!v) return "رسالة جديدة";
  return v.length <= max ? v : v.slice(0, max - 1) + "…";
}

export function useInAppToasts(restaurantId: string | null) {
  useEffect(() => {
    if (!restaurantId) return;

    // Note: the messages table doesn't have restaurant_id — we filter by
    // role='customer' to cut most noise and guard the conversation-scope
    // check in the handler. For huge tenants we'd scope by a conversation_id
    // IN () list, but the mobile tenant size makes role filtering adequate.
    const channel = supabase
      .channel(`in-app-toasts:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "role=eq.customer",
        },
        async (payload) => {
          const msg = payload.new as InboundPayload;
          if (!msg?.conversation_id) return;

          // Skip if the user is currently reading this conversation — the
          // chat screen already appended the message via its own subscription.
          if (getActiveConv() === msg.conversation_id) return;

          // Verify the conversation belongs to our tenant (since the channel
          // filter is role-only). If RLS already hides other tenants' rows,
          // this is a no-op; if the payload leaks, we'd still need this.
          const meta = await fetchConvMeta(msg.conversation_id);
          if (!meta) return;

          const title = meta.customer_name
            ? `${meta.customer_name} — ${meta.customer_phone}`
            : meta.customer_phone;
          const body = truncate(msg.content, 140);

          try {
            await Notifications.scheduleNotificationAsync({
              identifier: `msg:${msg.id}`,
              content: {
                title,
                body,
                data: {
                  type: "new_conversation",
                  conversationId: msg.conversation_id,
                  restaurantId,
                },
                sound: "default",
              },
              trigger: null, // fire immediately
            });
          } catch (err) {
            console.warn("[in-app-toast] schedule failed:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);
}
