/**
 * POST /api/dashboard/export/start
 * Boots a new WhatsApp chat-history export on the isolated wa-export service and
 * records ownership (export id → restaurant) so later polling/download is scoped.
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { isWaExportConfigured, startExport } from "@/lib/wa-export";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!isWaExportConfigured()) {
    return NextResponse.json(
      { error: "Export service not configured" },
      { status: 503 }
    );
  }

  try {
    const summary = await startExport(restaurant.name);

    await adminSupabaseClient.from("client_exports").insert({
      id: summary.id,
      restaurant_id: restaurant.id,
      client_name: restaurant.name,
      status: summary.status,
    });

    return NextResponse.json({ exportId: summary.id, status: summary.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 429 from the service = concurrency cap reached.
    const busy = message.includes("429") || message.toLowerCase().includes("busy");
    return NextResponse.json(
      { error: busy ? "Export service is busy, try again shortly" : "Failed to start export" },
      { status: busy ? 429 : 502 }
    );
  }
}
