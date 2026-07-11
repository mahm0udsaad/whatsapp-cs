/**
 * Shared tenant-ownership guard for export API routes: resolves the caller's
 * restaurant and confirms the given export id belongs to it. Returns either an
 * error `NextResponse` to return immediately, or the owned restaurant id.
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";

export async function requireOwnedExport(
  exportId: string
): Promise<{ error: NextResponse } | { restaurantId: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) {
    return { error: NextResponse.json({ error: "Restaurant not found" }, { status: 404 }) };
  }

  const { data } = await adminSupabaseClient
    .from("client_exports")
    .select("id")
    .eq("id", exportId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!data) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { restaurantId: restaurant.id };
}
