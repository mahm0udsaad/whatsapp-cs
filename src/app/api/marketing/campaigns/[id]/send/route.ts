import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { sendTemplateMessage } from "@/lib/twilio-content";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const { id } = await params;

    // Fetch campaign
    const { data: campaign, error: campaignError } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      return NextResponse.json(
        { error: "Campaign must be in draft or scheduled status to send" },
        { status: 400 }
      );
    }

    if (!campaign.template_id) {
      return NextResponse.json(
        { error: "Campaign has no template assigned" },
        { status: 400 }
      );
    }

    // Validate template is approved
    const { data: template, error: templateError } = await adminSupabaseClient
      .from("marketing_templates")
      .select("*")
      .eq("id", campaign.template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (template.approval_status !== "approved") {
      return NextResponse.json(
        { error: "Template must be approved before sending" },
        { status: 400 }
      );
    }

    if (!template.twilio_content_sid) {
      return NextResponse.json(
        { error: "Template has no Twilio content SID" },
        { status: 400 }
      );
    }

    // Fetch pending recipients
    const { data: recipients, error: recipientError } = await adminSupabaseClient
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", id)
      .eq("status", "pending");

    if (recipientError) {
      return NextResponse.json({ error: recipientError.message }, { status: 500 });
    }

    if (!recipients || recipients.length === 0) {
      return NextResponse.json(
        { error: "No pending recipients found for this campaign" },
        { status: 400 }
      );
    }

    // Determine the sending phone number
    const fromNumber = restaurant.twilio_phone_number || process.env.TWILIO_PHONE_NUMBER!;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const statusCallback = `${appUrl}/api/webhooks/twilio/status`;

    // Update campaign status to sending
    const now = new Date().toISOString();
    await adminSupabaseClient
      .from("marketing_campaigns")
      .update({
        status: "sending",
        sending_started_at: now,
        updated_at: now,
      })
      .eq("id", id);

    let sentCount = 0;
    let failedCount = 0;

    // Send in batches
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (recipient) => {
        try {
          // Build content variables from recipient data
          const contentVariables: Record<string, string> = {};
          if (recipient.name) {
            contentVariables["1"] = recipient.name;
          }
          // Add any additional variables from recipient metadata
          if (recipient.metadata && typeof recipient.metadata === "object") {
            const meta = recipient.metadata as Record<string, string>;
            for (const [key, value] of Object.entries(meta)) {
              if (!contentVariables[key]) {
                contentVariables[key] = String(value);
              }
            }
          }

          const { messageSid } = await sendTemplateMessage({
            contentSid: template.twilio_content_sid!,
            contentVariables,
            from: fromNumber,
            to: recipient.phone_number,
            statusCallback,
          });

          // Update recipient as sent
          await adminSupabaseClient
            .from("campaign_recipients")
            .update({
              status: "sent",
              twilio_message_sid: messageSid,
              sent_at: new Date().toISOString(),
            })
            .eq("id", recipient.id);

          sentCount++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown send error";

          await adminSupabaseClient
            .from("campaign_recipients")
            .update({
              status: "failed",
              error_message: errorMessage,
            })
            .eq("id", recipient.id);

          failedCount++;
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches (except after the last batch)
      if (i + BATCH_SIZE < recipients.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // Update campaign with final stats
    const completedAt = new Date().toISOString();
    const finalStatus = failedCount === recipients.length ? "failed" : "completed";

    await adminSupabaseClient
      .from("marketing_campaigns")
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        status: finalStatus,
        sending_completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", id);

    return NextResponse.json(
      {
        success: true,
        campaign_id: id,
        total: recipients.length,
        sent: sentCount,
        failed: failedCount,
        status: finalStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Try to mark campaign as failed
    try {
      const { id } = await params;
      await adminSupabaseClient
        .from("marketing_campaigns")
        .update({
          status: "failed",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
