/** Only accept a presence-check identifier, never an arbitrary push URL. */
export function presenceCheckDestination(data: Record<string, unknown>) {
  if (data.type !== "presence_check") return null;
  const id = data.presence_check_id;
  if ((typeof id !== "string" && typeof id !== "number") || !/^[1-9]\d*$/.test(String(id))) return null;
  return { pathname: "/(hub)/(tabs)/hr/presence/[id]" as const, params: { id: String(id) } };
}
