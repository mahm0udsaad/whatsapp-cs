import { supabase, type TeamMemberRow } from "./supabase";
import { apiFetch } from "./api";

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Permanently delete the signed-in user's account.
 *
 * Required by Apple App Store guideline 5.1.1(v): any app that lets users
 * create an account must let them delete it from inside the app.
 *
 * Backend contract (TODO — implement on the Next.js side):
 *   POST /api/auth/delete-account
 *     - Auth: Bearer access token (added by apiFetch).
 *     - Behavior: hard-delete the auth user, all team_members rows, and any
 *       other tables tied to user_id. Idempotent (returns 204 if already
 *       gone). The Supabase user row MUST be deleted, not just deactivated —
 *       Apple is strict about "no soft-delete dressed up as deletion".
 *     - Returns: 204 No Content on success.
 *
 * On the client we always sign out locally afterward so the deleted user
 * isn't left holding a stale access token.
 */
export async function deleteAccount() {
  await apiFetch("/api/auth/delete-account", { method: "POST" });
  // Best-effort sign out — the access token is invalid once the user row is
  // gone, but we still want local state cleared.
  try {
    await supabase.auth.signOut();
  } catch {
    // Non-fatal: the user is already deleted server-side.
  }
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Load all active team_members rows for the currently signed-in user.
 * The caller picks one to use as the active tenant.
 */
export async function loadTeamMemberships(userId: string): Promise<TeamMemberRow[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select(
      "id, restaurant_id, user_id, role, full_name, is_active, is_available, restaurants(id, name)"
    )
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw error;
  type RestaurantRef = { id: string; name: string | null };
  type Row = Omit<TeamMemberRow, "restaurant"> & {
    restaurants: RestaurantRef | RestaurantRef[] | null;
  };
  return ((data ?? []) as Row[]).map(({ restaurants, ...row }) => ({
    ...row,
    restaurant: Array.isArray(restaurants) ? restaurants[0] : restaurants ?? undefined,
  }));
}
