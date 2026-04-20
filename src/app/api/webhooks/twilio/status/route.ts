import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { validateTwilioRequest } from "@/lib/twilio";
import { TwilioStatusCallback } from "@/lib/types";

/**
 * Status callback endpoint for tracking message delivery status.
 *
 * Twilio guarantees at-least-once delivery for status callbacks: the same
 * (MessageSid, MessageStatus) pair can arrive multiple times if Twilio
 * retried us during a transient outage. We dedup against the
 * `twilio_status_events` table — the row insert short-circuits on a primary
 * key conflict, in which case we early-return without touching `messages`,
 * `campaign_recipients`, or `campaign_send_jobs`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bodyText = await request.text();
    const params = new URLSearchParams(bodyText);

    const twilioSignature = request.headers.get("x-twilio-signature") || "";
    const formParams = Object.fromEntries(params.entries());
    if (
      !twilioSignature ||
      !validateTwilioRequest(request.url, formParams, twilioSignature)
    ) {
      console.error("Invalid or missing Twilio signature on status callback");
      return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
    }

    const statusData: TwilioStatusCallback = {
      MessageSid: params.get("MessageSid") || "",
      MessageStatus: (params.get("MessageStatus") ||
        "failed") as TwilioStatusCallback["MessageStatus"],
      ErrorCode: params.get("ErrorCode") || undefined,
    };

    const { MessageSid, MessageStatus, ErrorCode } = statusData;

    if (!MessageSid || !MessageStatus) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Idempotency — dedup on (sid, status). The primary key is (message_sid,
    // status) so a replay of the same transition raises a 23505
    // unique_violation; we treat that as a benign no-op and return 200.
    const { error: dedupError } = await adminSupabaseClient
      .from("twilio_status_events")
      .insert({ message_sid: MessageSid, status: MessageStatus });

    if (dedupError) {
      const msg = String(dedupError.message ?? "");
      const code = (dedupError as { code?: string }).code ?? "";
      if (code === "23505" || /duplicate|conflict/i.test(msg)) {
        return NextResponse.json({ deduped: true }, { status: 200 });
      }
      // Any other DB error — log but continue so we don't lose status updates
      // if the dedup table itself is briefly unavailable.
      console.warn("twilio_status_events insert failed:", msg);
    }

    console.log("Status update received", { MessageSid, MessageStatus, ErrorCode });

    const { error: messageUpdateError } = await adminSupabaseClient
      .from("messages")
      .update({
        delivery_status: MessageStatus,
        error_message: ErrorCode ? `Twilio error code: ${ErrorCode}` : null,
      })
      .eq("external_message_sid", MessageSid);
    if (messageUpdateError) {
      console.error("Failed to update message status:", messageUpdateError);
    }

    if (MessageStatus === "delivered" || MessageStatus === "read") {
      const { error: updateError } = await adminSupabaseClient
        .from("campaign_recipients")
        .update({
          status: MessageStatus === "read" ? "read" : "delivered",
          delivered_at:
            MessageStatus === "delivered" ? new Date().toISOString() : undefined,
          read_at: MessageStatus === "read" ? new Date().toISOString() : undefined,
        })
        .eq("twilio_message_sid", MessageSid);
      if (updateError) {
        console.error("Failed to update campaign recipient:", updateError);
      }
    } else if (MessageStatus === "failed") {
      const { error: updateError } = await adminSupabaseClient
        .from("campaign_recipients")
        .update({
          status: "failed",
          error_message: ErrorCode ? `Error code: ${ErrorCode}` : "Failed",
        })
        .eq("twilio_message_sid", MessageSid);
      if (updateError) {
        console.error("Failed to update campaign recipient:", updateError);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Status callback error:", error);
    return NextResponse.json(
      { error: "Failed to process status update" },
      { status: 200 }
    );
  }
}
