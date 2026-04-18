/**
 * POST /api/dashboard/inbox/:id/send
 *
 * Composer endpoint used by the web inbox inspector. Sends an agent reply as
 * a plain-text WhatsApp session message, records it in `messages`, marks the
 * order as replied, and bumps the conversation's last_message_at.
 *
 * AUTH CHECK:
 *   - Must be a Supabase-session user (cookies). 401 otherwise.
 *   - Must be one of:
 *       (a) the restaurant owner (profiles/restaurants.owner_id), OR
 *       (b) a profile with is_super_admin = true, OR
 *       (c) the team_member that currently claims this order
 *           (orders.assigned_to == team_members.id with matching user_id).
 *     Anyone else gets 403.
 *
 * Conversation.bot_paused is NOT touched here — the /orders/:id/claim route
 * already set it to true at claim time. We rely on that invariant so the AI
 * reply worker stays out of this thread regardless of who sends next.
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

interface SendBody {
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
      return NextResponse.json({ error: "Order id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as SendBody;
    const text = (body.text || "").trim();
    const attachment = body.attachment;
    if (!text && !attachment) {
      return NextResponse.json(
        { error: "Message must have text or an attachment" },
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
          { error: "attachment.storagePath and attachment.contentType are required" },
          { status: 400 }
        );
      }
      const { restaurantId: attachmentRestaurantId } = parseMediaStoragePath(
        attachment.storagePath
      );
      // Tenant-scope check — the storage path must start with this order's
      // restaurant id so an agent can't reference another tenant's blob.
      if (!attachmentRestaurantId) {
        return NextResponse.json(
          { error: "Invalid attachment storagePath" },
          { status: 400 }
        );
      }
    }

    // 1. Load the order + parent restaurant (for the tenant sender number).
    const { data: order, error: orderErr } = await adminSupabaseClient
      .from("orders")
      .select(
        "id, restaurant_id, conversation_id, customer_phone, assigned_to, type, status"
      )
      .eq("id", id)
      .maybeSingle();
    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: restaurant, error: rErr } = await adminSupabaseClient
      .from("restaurants")
      .select("id, owner_id, twilio_phone_number")
      .eq("id", order.restaurant_id)
      .maybeSingle();
    if (rErr || !restaurant) {
      return NextResponse.json(
        { error: rErr?.message || "Restaurant not found" },
        { status: 500 }
      );
    }

    // 2. Authorization. Resolve the caller's team_members row (if any) in
    //    this tenant and check owner / super_admin / claimer.
    const [{ data: member }, { data: profile }] = await Promise.all([
      adminSupabaseClient
        .from("team_members")
        .select("id, user_id, is_active, restaurant_id")
        .eq("user_id", user.id)
        .eq("restaurant_id", order.restaurant_id)
        .eq("is_active", true)
        .maybeSingle(),
      adminSupabaseClient
        .from("profiles")
        .select("id, is_super_admin")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const isOwner = restaurant.owner_id === user.id;
    const isSuperAdmin = profile?.is_super_admin === true;
    const isClaimer =
      member && order.assigned_to && order.assigned_to === member.id;

    if (!isOwner && !isSuperAdmin && !isClaimer) {
      return NextResponse.json(
        { error: "Forbidden: must own, super-admin, or claim this order" },
        { status: 403 }
      );
    }

    if (!order.customer_phone) {
      return NextResponse.json(
        { error: "Order has no customer phone" },
        { status: 400 }
      );
    }
    if (!order.conversation_id) {
      return NextResponse.json(
        { error: "Order has no conversation" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 3. Tenant-scope the attachment and resolve a signed URL for Twilio.
    let attachmentSignedUrl: string | null = null;
    if (attachment) {
      const { restaurantId: attachmentRestaurantId } = parseMediaStoragePath(
        attachment.storagePath
      );
      if (attachmentRestaurantId !== order.restaurant_id) {
        return NextResponse.json(
          {
            error:
              "Attachment does not belong to this order's restaurant (tenant mismatch)",
          },
          { status: 403 }
        );
      }
      try {
        // 1h TTL is plenty — Twilio fetches the media within a few seconds.
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

    const outboundMessageType = attachment
      ? messageTypeFromContentType(attachment.contentType)
      : "text";

    const outboundMetadata: Record<string, unknown> = {
      source: "inbox_composer",
      order_id: order.id,
      sender_user_id: user.id,
      sender_team_member_id: member?.id ?? null,
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

    // 4. Insert the agent message row up front so the UI can render it
    //    optimistically via realtime while Twilio is still sending.
    const { data: inserted, error: insertErr } = await adminSupabaseClient
      .from("messages")
      .insert({
        conversation_id: order.conversation_id,
        role: "agent",
        content: text || "",
        message_type: outboundMessageType,
        channel: "whatsapp",
        delivery_status: "queued",
        metadata: outboundMetadata,
      })
      .select()
      .maybeSingle();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: insertErr?.message || "Failed to persist message" },
        { status: 500 }
      );
    }

    // 5. Send via Twilio — branch on whether we have an attachment.
    let twilioSid: string | null = null;
    try {
      const statusCallback = `${(process.env.NEXT_PUBLIC_APP_URL || "")
        .replace(/\/$/, "")}/api/webhooks/twilio/status`;
      if (attachment && attachmentSignedUrl) {
        twilioSid = await sendWhatsAppMedia(order.customer_phone, {
          fromPhoneNumber: restaurant.twilio_phone_number || undefined,
          statusCallback,
          mediaUrl: attachmentSignedUrl,
          caption: text || undefined,
        });
      } else {
        twilioSid = await sendWhatsAppMessage(order.customer_phone, text, {
          fromPhoneNumber: restaurant.twilio_phone_number || undefined,
          statusCallback,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "twilio send failed";
      // Mark message as failed but keep the row so the agent sees what happened.
      await adminSupabaseClient
        .from("messages")
        .update({
          delivery_status: "failed",
          error_message: msg,
        })
        .eq("id", inserted.id);
      return NextResponse.json(
        { error: msg, messageId: inserted.id },
        { status: 500 }
      );
    }

    // 5. Update message with twilio sid + record side-effects on order/conv.
    await adminSupabaseClient
      .from("messages")
      .update({
        twilio_message_sid: twilioSid,
        external_message_sid: twilioSid,
        delivery_status: "sent",
      })
      .eq("id", inserted.id);

    const adminReplyPreview = attachment
      ? `[${messageTypeFromContentType(attachment.contentType)}]${text ? ` ${text}` : ""}`
      : text;
    await adminSupabaseClient
      .from("orders")
      .update({
        status: "replied",
        replied_at: now,
        admin_reply: adminReplyPreview,
        updated_at: now,
      })
      .eq("id", order.id);

    await adminSupabaseClient
      .from("conversations")
      .update({ last_message_at: now })
      .eq("id", order.conversation_id);

    return NextResponse.json(
      {
        messageId: inserted.id,
        twilioSid,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
