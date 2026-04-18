/**
 * POST /api/mobile/inbox/conversations/:id/reply
 *
 * Lets a claimed agent send a manual WhatsApp reply from the mobile app.
 *
 * Rules:
 *   - Caller must own the team_member that currently holds the conversation.
 *   - handler_mode must be 'human' (bot-delegated conversations are answered
 *     automatically; no manual replies through this route).
 *   - Body must be plain text <= 4096 chars.
 *
 * Body: { text: string }
 * Reply: { message } — the inserted agent-side row
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage, sendWhatsAppMedia } from "@/lib/twilio";
import {
  createMediaSignedUrl,
  messageTypeFromContentType,
  parseMediaStoragePath,
} from "@/lib/storage-media";

interface AttachmentInput {
  storagePath: string;
  contentType: string;
  sizeBytes?: number;
  originalFilename?: string;
}

interface ReplyBody {
  text?: string;
  attachment?: AttachmentInput;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as ReplyBody;
    const text = (body.text || "").trim();
    const attachment = body.attachment;
    if (!text && !attachment) {
      return NextResponse.json(
        { error: "text or attachment required" },
        { status: 400 }
      );
    }
    if (text.length > 4096) {
      return NextResponse.json(
        { error: "Message too long (max 4096 chars)" },
        { status: 400 }
      );
    }
    if (attachment) {
      if (!attachment.storagePath || !attachment.contentType) {
        return NextResponse.json(
          {
            error:
              "attachment.storagePath and attachment.contentType are required",
          },
          { status: 400 }
        );
      }
    }

    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select("id, restaurant_id, customer_phone, handler_mode, assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { data: member } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", conv.restaurant_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    if (conv.handler_mode !== "human") {
      return NextResponse.json(
        {
          error:
            conv.handler_mode === "bot"
              ? "Conversation is delegated to the bot"
              : "Conversation is not claimed",
        },
        { status: 409 }
      );
    }
    if (conv.assigned_to !== member.id) {
      return NextResponse.json(
        { error: "Conversation is claimed by another agent" },
        { status: 409 }
      );
    }

    // Resolve the restaurant's outbound WhatsApp sender so we use the right
    // from-number (matches the pattern used by the twilio webhook).
    let senderPhone: string | undefined;
    try {
      const { data: sender } = await adminSupabaseClient
        .from("whatsapp_senders")
        .select("phone_number")
        .eq("restaurant_id", conv.restaurant_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (sender?.phone_number) senderPhone = sender.phone_number as string;
    } catch {
      // whatsapp_senders may not exist yet; fall through to restaurants.twilio_phone_number.
    }
    if (!senderPhone) {
      const { data: restaurant } = await adminSupabaseClient
        .from("restaurants")
        .select("twilio_phone_number")
        .eq("id", conv.restaurant_id)
        .maybeSingle();
      senderPhone = (restaurant?.twilio_phone_number as string | undefined) || undefined;
    }

    // Tenant-scope the attachment and resolve a signed URL for Twilio.
    let attachmentSignedUrl: string | null = null;
    if (attachment) {
      const { restaurantId: attachmentRestaurantId } = parseMediaStoragePath(
        attachment.storagePath
      );
      if (attachmentRestaurantId !== conv.restaurant_id) {
        return NextResponse.json(
          {
            error:
              "Attachment does not belong to this conversation's restaurant",
          },
          { status: 403 }
        );
      }
      try {
        attachmentSignedUrl = await createMediaSignedUrl(
          attachment.storagePath,
          3600
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "signed url generation failed";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    let sid: string | undefined;
    try {
      if (attachment && attachmentSignedUrl) {
        sid = await sendWhatsAppMedia(conv.customer_phone, {
          fromPhoneNumber: senderPhone,
          mediaUrl: attachmentSignedUrl,
          caption: text || undefined,
        });
      } else {
        sid = await sendWhatsAppMessage(conv.customer_phone, text, {
          fromPhoneNumber: senderPhone,
        });
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "send failed";
      return NextResponse.json({ error: m }, { status: 502 });
    }

    const nowIso = new Date().toISOString();
    const outboundMessageType = attachment
      ? messageTypeFromContentType(attachment.contentType)
      : "text";
    const outboundMetadata: Record<string, unknown> = {
      sent_by_team_member_id: member.id,
    };
    if (attachment) {
      outboundMetadata.media = [
        {
          storage_path: attachment.storagePath,
          content_type: attachment.contentType,
          size_bytes: attachment.sizeBytes ?? null,
          original_filename: attachment.originalFilename ?? null,
          caption: text || null,
        },
      ];
    }
    const { data: inserted } = await adminSupabaseClient
      .from("messages")
      .insert({
        conversation_id: conv.id,
        role: "agent",
        content: text,
        message_type: outboundMessageType,
        external_message_sid: sid,
        delivery_status: sid ? "queued" : "failed",
        metadata: outboundMetadata,
        created_at: nowIso,
      })
      .select("*")
      .single();

    await adminSupabaseClient
      .from("conversations")
      .update({ last_message_at: nowIso })
      .eq("id", conv.id);

    return NextResponse.json({ message: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
