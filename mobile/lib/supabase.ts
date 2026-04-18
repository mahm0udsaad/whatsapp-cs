import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// SecureStore has a 2KB value limit. Supabase sessions stay under that, but
// we fall back to AsyncStorage on web (where SecureStore is unavailable).
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const storage = Platform.OS === "web" ? AsyncStorage : SecureStoreAdapter;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing. " +
      "Set them in mobile/.env before running."
  );
}

// Visible on Metro/Expo console at app launch — confirms which project the
// bundle was compiled against. If this prints the wrong host, the JS bundle
// is stale and you need to fully kill the app + restart `expo start -c`.
console.log(
  "[supabase] connecting to:",
  url ?? "(missing)",
  "anonKeyTail=...",
  anonKey?.slice(-12) ?? "(missing)"
);

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    storage: storage as never,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ---------------------------------------------------------------------------
// Realtime JWT wiring
//
// On a cold launch, the Realtime websocket can hand-shake with the anon key
// before the persisted session finishes hydrating. Every `postgres_changes`
// event then silently fails RLS and the UI looks broken ("needs pull to
// refresh"). We push the access token into the realtime socket as soon as we
// have one — at boot, and on every auth state change (TOKEN_REFRESHED,
// SIGNED_IN, SIGNED_OUT).
// ---------------------------------------------------------------------------

supabase.auth
  .getSession()
  .then(({ data }) => {
    const token = data.session?.access_token ?? null;
    if (token) supabase.realtime.setAuth(token);
  })
  .catch(() => {
    // Ignore — surface is handled by the auth screen.
  });

supabase.auth.onAuthStateChange((_event, session) => {
  const token = session?.access_token ?? null;
  if (token) {
    supabase.realtime.setAuth(token);
  }
});

export type TeamMemberRow = {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: "admin" | "agent";
  full_name: string | null;
  is_active: boolean;
  is_available: boolean;
  restaurant?: { id: string; name: string | null };
};
