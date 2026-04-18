import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to all `orders` changes scoped to a single restaurant.
 * `onChange` fires for INSERT / UPDATE / DELETE — the caller decides how
 * to react (most often: invalidate the react-query "orders" key).
 */
export function subscribeToOrders(
  restaurantId: string,
  onChange: () => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`orders-${restaurantId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToMessages(
  conversationId: string,
  onChange: () => void
): () => void {
  const channel = supabase
    .channel(`messages-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
