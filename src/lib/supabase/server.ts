import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

/**
 * Build a per-request Supabase client. Supports two auth transports:
 *
 *  1. Cookie session — used by the Next.js dashboard (browser → SSR).
 *  2. `Authorization: Bearer <jwt>` — used by the Expo mobile app, which has
 *     no cookies. Without this branch, every mobile API call lands with
 *     `auth.getUser()` === null and returns 401.
 *
 * The bearer branch wraps `auth.getUser()` so existing call sites
 * (`supabase.auth.getUser()` with no args) transparently validate the token.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const headersList = await headers();
  const authHeader =
    headersList.get("authorization") ?? headersList.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );

      // Existing call sites do `supabase.auth.getUser()` with no args and
      // expect the server's session to answer. With a Bearer-only client
      // we must pass the token explicitly — so wrap it.
      const originalGetUser = client.auth.getUser.bind(client.auth);
      client.auth.getUser = ((jwt?: string) =>
        originalGetUser(jwt ?? token)) as typeof client.auth.getUser;

      return client;
    }
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
          }
        },
      },
    }
  );
}
