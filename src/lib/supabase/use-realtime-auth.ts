"use client";

/**
 * useRealtimeAuth — ensure the Supabase Realtime websocket uses the
 * authenticated user's JWT, not the anon key.
 *
 * Why this exists: `@supabase/ssr`'s createBrowserClient reads the session
 * cookie lazily. On a fresh page load the realtime socket can hand-shake with
 * the anon key before the session is hydrated, and every postgres_changes
 * event then fails RLS silently — the UI looks broken ("needs refresh").
 *
 * Call this once at the top of any component that subscribes to realtime.
 * It:
 *   1. Immediately sets realtime.setAuth(accessToken) if a session is present.
 *   2. Re-sets it on every onAuthStateChange (TOKEN_REFRESHED, SIGNED_IN).
 *   3. Returns `ready: true` once the initial setAuth pass has run, so
 *      components can wait before opening their subscription.
 */

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export function useRealtimeAuth(supabase: SupabaseClient): { ready: boolean } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (cancelled) return;
      // supabase-js accepts null to clear — but we only want to set when we have one.
      if (token) supabase.realtime.setAuth(token);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      if (token) supabase.realtime.setAuth(token);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return { ready };
}
