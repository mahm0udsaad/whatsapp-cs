/**
 * POST /api/mobile/marketing/campaigns/:id/send
 *
 * Mobile twin of the dashboard send endpoint. Authenticates via
 * `resolveCurrentRestaurantForAdmin` (Supabase JWT), validates the campaign
 * + template, and enqueues per-recipient send jobs for the worker to drain.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { enqueueCampaign } from "@/lib/campaign-send-jobs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveCurrentRestaurantForAdmin();
    if (ctx instanceof NextResponse) return ctx;
    const { restaurantId } = ctx;

    const { id } = await params;

    const { data: campaign, error: campaignError } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select(
        "id, status, template_id, scheduled_at, total_recipients, restaurant_id"
      )
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (
      campaign.status !== "draft" &&
      campaign.status !== "scheduled" &&
      campaign.status !== "queued"
    ) {
      return NextResponse.json(
        { error: `Cannot enqueue a campaign in status ${campaign.status}` },
        { status: 400 }
      );
    }
    if (!campaign.template_id) {
      return NextResponse.json(
        { error: "Campaign has no template" },
        { status: 400 }
      );
    }

    const { data: template } = await adminSupabaseClient
      .from("marketing_templates")
      .select("approval_status, twilio_content_sid")
      .eq("id", campaign.template_id)
      .single();
    if (
      !template?.twilio_content_sid ||
      template.approval_status !== "approved"
    ) {
      return NextResponse.json(
        { error: "Template not approved or missing Twilio content SID" },
        { status: 400 }
      );
    }

    const result = await enqueueCampaign(
      id,
      campaign.scheduled_at as string | null
    );

    await adminSupabaseClient
      .from("marketing_campaigns")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      campaign_id: result.campaign_id,
      enqueued: result.enqueued,
      opted_out_skipped: result.opted_out_skipped,
      status: "queued",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
