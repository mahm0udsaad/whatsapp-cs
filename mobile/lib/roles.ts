import type { TeamMemberRow } from "./supabase";

/**
 * Manager-tier check for the mobile app.
 *
 * Mirrors the SQL helper `public.is_restaurant_admin`. A member is a manager
 * when their role is `admin`. The restaurant owner is expected to also have an
 * admin team_members row (owners who don't have one cannot use the mobile app
 * at all because `loadTeamMemberships` reads from team_members).
 */
export function isManager(member: TeamMemberRow | null | undefined): boolean {
  return !!member && member.role === "admin";
}
