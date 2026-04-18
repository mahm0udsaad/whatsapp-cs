"use client";

/**
 * HomeRealtimeRefresh — invisible client component that keeps the server-
 * rendered dashboard home page live.
 *
 * The home page (/dashboard) is a server component that aggregates
 * conversations / messages / orders counts. Without this ticker, those
 * numbers and the "recent conversations" list only update when the user
 * navigates or reloads.
 *
 * Strategy: subscribe to postgres_changes on the three tenant-scoped tables
 * and trigger router.refresh() on any change. Refreshes are debounced so
 * a burst of DB writes (webhook fan-out) collapses into a single refetch.
 */

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAuth } from "@/lib/supabase/use-realtime-auth";

const REFRESH_DEBOUNCE_MS = 800;

export function HomeRealtimeRefresh({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useRealtimeAuth(supabase);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`home-live:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        schedule
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        schedule
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        schedule
      )
      .subscribe((status, err) => {
        if (err) console.warn("[home-live] channel error", status, err);
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, restaurantId, ready, router]);

  return null;
}
