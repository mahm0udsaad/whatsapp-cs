/**
 * GET /api/mobile/marketing/campaigns/:id
 *
 * Campaign detail + recent recipient rows for the drill-down screen. Only
 * the newest 200 recipients are returned to keep the response small; the
 * live counters on the campaign row are the source of truth for progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { id: campaignId } = await params;

  const { data: campaign, error: campaignErr } = await adminSupabaseClient
    .from("marketing_campaigns")
    .select(
      "id, name, template_id, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, failed_count, created_at, sending_started_at, sending_completed_at, error_message, marketing_templates(id, name, category, language, approval_status, body_template)"
    )
    .eq("id", campaignId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (campaignErr) {
    return NextResponse.json({ error: campaignErr.message }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: recipients } = await adminSupabaseClient
    .from("campaign_recipients")
    .select("id, phone_number, name, status, error_message, sent_at, delivered_at, read_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({
    campaign,
    recipients: recipients ?? [],
  });
}
