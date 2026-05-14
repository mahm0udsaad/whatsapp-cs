/**
 * Tracks per-restaurant AI feature usage with monthly soft limits.
 * Captions are nearly free (~$0.0001 per call); images cost ~$0.04 each.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";

export type AiFeature = "image" | "caption";

export const AI_LIMITS: Record<AiFeature, number> = {
  image: 30, // ~$1.20/month max per restaurant
  caption: 100, // basically free
};

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface UsageRow {
  used: number;
  limit: number;
  remaining: number;
  month: string;
}

export async function getAiUsage(
  restaurantId: string,
  feature: AiFeature
): Promise<UsageRow> {
  const month = monthKey();
  const { data } = await adminSupabaseClient
    .from("ai_usage")
    .select("count")
    .eq("restaurant_id", restaurantId)
    .eq("feature", feature)
    .eq("month_key", month)
    .maybeSingle();

  const used = data?.count ?? 0;
  const limit = AI_LIMITS[feature];
  return { used, limit, remaining: Math.max(0, limit - used), month };
}

/**
 * Increments usage atomically. Returns the new count and whether the user is
 * over the limit. Callers should check `.overLimit` BEFORE doing the expensive
 * Gemini call.
 */
export async function incrementAiUsage(
  restaurantId: string,
  feature: AiFeature
): Promise<UsageRow & { overLimit: boolean }> {
  const month = monthKey();

  // Upsert + atomic increment via Postgres RPC-style query
  const { data: existing } = await adminSupabaseClient
    .from("ai_usage")
    .select("count")
    .eq("restaurant_id", restaurantId)
    .eq("feature", feature)
    .eq("month_key", month)
    .maybeSingle();

  const nextCount = (existing?.count ?? 0) + 1;

  await adminSupabaseClient.from("ai_usage").upsert(
    {
      restaurant_id: restaurantId,
      feature,
      month_key: month,
      count: nextCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "restaurant_id,feature,month_key" }
  );

  const limit = AI_LIMITS[feature];
  return {
    used: nextCount,
    limit,
    remaining: Math.max(0, limit - nextCount),
    month,
    overLimit: nextCount > limit,
  };
}
