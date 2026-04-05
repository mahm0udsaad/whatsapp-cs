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

    // Try to find the message by MessageSid
    // Since we don't store MessageSid in the messages table yet, we can store it in metadata
    // For now, we'll just log the status update
    // In production, you'd want to:
    // 1. Store the Twilio MessageSid when you send a message
    // 2. Update the message record with the new status
    // 3. Update any campaign_recipient records if this is a marketing message

    // Example: Update campaign_recipient if this is a campaign message
    if (MessageStatus === "delivered" || MessageStatus === "read") {
      // Find and update campaign recipient
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
      // Update failed status in campaign recipient
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

    // Log status for debugging/analytics
    console.log("Message status updated", {
      MessageSid,
      MessageStatus,
      timestamp: new Date().toISOString(),
    });

    // Return 200 OK to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Status callback error:", error);

    // Still return 200 to prevent Twilio from retrying
    return NextResponse.json(
      { error: "Failed to process status update" },
      { status: 200 }
    );
  }
}
