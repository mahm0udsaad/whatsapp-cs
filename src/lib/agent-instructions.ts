/**
 * Loader for `agent_instructions` — versioned rules the tenant owner (Hanan
 * for Kiara) authors via the AI Manager page. These are rendered inline into
 * the customer-service system prompt so the CS AI reflects the owner's current
 * guidance without a deploy.
 *
 * Never throws: returns `[]` on any error and logs a warning. The caller
 * should treat the prompt additions as best-effort.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";

export interface ActiveAgentInstruction {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

const MAX_ROWS = 50;

export async function loadActiveAgentInstructions(
  restaurantId: string
): Promise<ActiveAgentInstruction[]> {
  if (!restaurantId) return [];

  const { data, error } = await adminSupabaseClient
    .from("agent_instructions")
    .select("id, title, body, tags")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.warn(
      `[agent-instructions] load failed for restaurant=${restaurantId}: ${error.message}`
    );
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "",
    body: (row.body as string) ?? "",
    tags: (row.tags as string[]) ?? [],
  }));
}
