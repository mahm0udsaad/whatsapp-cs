import type { TeamMemberRow } from "./supabase";
import { isManager } from "./roles";

/** Normal launches always enter Hub; workspace switches are session-local. */
export const HUB_HOME = "/(hub)/(tabs)/dashboard" as const;
export const HR_HOME = "/(hub)/(tabs)/hr" as const;

export function whatsappHome(member: TeamMemberRow | null | undefined) {
  return isManager(member) ? "/(app)/overview" as const : "/(app)/inbox" as const;
}

/** Only local, known app routes may survive a login redirect. */
export function loginDestination(returnTo?: string | string[]) {
  const target = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (!target) return "/(hub)";
  const [path, query = ""] = target.split("?");
  if (!/^\/(?:hr|bookings)(?:\/[A-Za-z0-9_-]+)*$/.test(path)) return "/(hub)";
  const code = new URLSearchParams(query).get("code");
  if (path === "/hr/activate" && code && /^[A-Za-z0-9 -]{1,32}$/.test(code)) return `${path}?code=${encodeURIComponent(code)}`;
  return path;
}
