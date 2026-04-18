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
