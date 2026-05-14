/**
 * GET /api/mobile/meta-ads/ai/usage
 *
 * Returns the current month's AI usage for both features so the mobile
 * composer can show "12 / 30 صور توليد متبقية" hints up-front.
 */

import { NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { getAiUsage } from "@/lib/ai-usage";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const [image, caption] = await Promise.all([
    getAiUsage(restaurantId, "image"),
    getAiUsage(restaurantId, "caption"),
  ]);

  return NextResponse.json({ image, caption });
}
