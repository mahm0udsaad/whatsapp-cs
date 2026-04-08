import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { TwilioStatusCallback } from "@/lib/types";

/**
 * Status callback endpoint for tracking message delivery status
 * Twilio POSTs to this endpoint when message status changes
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse form data
    const bodyText = await request.text();
    const params = new URLSearchParams(bodyText);

    const statusData: TwilioStatusCallback = {
      MessageSid: params.get("MessageSid") || "",
      MessageStatus: (params.get("MessageStatus") ||
        "failed") as TwilioStatusCallback["MessageStatus"],
      ErrorCode: params.get("ErrorCode") || undefined,
    };

    const { MessageSid, MessageStatus, ErrorCode } = statusData;

    if (!MessageSid || !MessageStatus) {
      console.error("Missing required status fields", {
        MessageSid,
        MessageStatus,
      });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log("Status update received", {
      MessageSid,
      MessageStatus,
      ErrorCode,
    });

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

    console.log("Message status updated", {
      MessageSid,
      MessageStatus,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Status callback error:", error);

    return NextResponse.json(
      { error: "Failed to process status update" },
      { status: 200 }
    );
  }
}
