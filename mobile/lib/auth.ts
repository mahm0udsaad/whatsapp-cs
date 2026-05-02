import { supabase, type TeamMemberRow } from "./supabase";

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
