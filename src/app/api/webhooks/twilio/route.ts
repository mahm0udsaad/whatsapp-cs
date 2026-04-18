import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  sendWhatsAppMessage,
  generateTwiMLResponse,
  validateTwilioRequest,
} from "@/lib/twilio";
import { queueAIReplyJob, processPendingAIReplyJobs } from "@/lib/ai-reply-jobs";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  notifyAgentsOfNewConversation,
  notifyAssignedAgentOfNewMessage,
} from "@/lib/conversation-notifications";
import {
  downloadTwilioMedia,
  uploadInboundMedia,
  messageTypeFromContentType,
  placeholderCaptionFor,
  MAX_INBOUND_MEDIA_BYTES,
} from "@/lib/storage-media";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Opt-out keywords (case-insensitive) */
const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "cancel", "إلغاء", "توقف", "الغاء"];
const OPT_IN_KEYWORDS = ["start", "subscribe", "اشتراك", "ابدأ"];

interface TwilioPayload {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  ProfileName: string;
  /** Title of a tapped quick-reply button (set by Twilio for button taps). */
  ButtonText: string;
  /** Stable id of a tapped quick-reply button (the value we set on send). */
  ButtonPayload: string;
  /** Stable id of a tapped list-picker item. */
  ListId: string;
  /** Visible title of a tapped list-picker item. */
  ListTitle: string;
  /** Twilio MessageSid of the original interactive message that was tapped. */
  OriginalRepliedMessageSid: string;
}

function parseTwilioBody(bodyText: string): TwilioPayload {
  const params = new URLSearchParams(bodyText);
  return {
    MessageSid: params.get("MessageSid") || "",
    From: params.get("From") || "",
    To: params.get("To") || "",
    Body: params.get("Body") || "",
    ProfileName: params.get("ProfileName") || "",
    ButtonText: params.get("ButtonText") || "",
    ButtonPayload: params.get("ButtonPayload") || "",
    ListId: params.get("ListId") || "",
    ListTitle: params.get("ListTitle") || "",
    OriginalRepliedMessageSid: params.get("OriginalRepliedMessageSid") || "",
  };
}

async function findOrCreateConversation(restaurantId: string, customerPhone: string) {
  const { data: existing } = await adminSupabaseClient
    .from("conversations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", customerPhone)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  const now = new Date().toISOString();

  if (existing) {
    await adminSupabaseClient
      .from("conversations")
      .update({
        status: "active",
        last_message_at: now,
        last_inbound_at: now,
      })
      .eq("id", existing.id);
    return { ...existing, last_inbound_at: now };
  }

  const { data: created, error } = await adminSupabaseClient
    .from("conversations")
    .insert({
      restaurant_id: restaurantId,
      customer_phone: customerPhone,
      status: "active",
      started_at: now,
      last_message_at: now,
      last_inbound_at: now,
    })
    .select()
    .single();

  if (error || !created) throw new Error(`Failed to create conversation: ${error?.message}`);
  return created;
}

async function saveMessage(
  conversationId: string,
  role: "customer" | "agent" | "system",
  content: string,
  options: {
    externalMessageSid?: string;
    deliveryStatus?: string;
    errorMessage?: string;
    messageType?: string;
    metadata?: Record<string, unknown> | null;
  } = {}
) {
  const { data, error } = await adminSupabaseClient
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      message_type: options.messageType || "text",
      metadata: options.metadata ?? null,
      external_message_sid: options.externalMessageSid,
      delivery_status: options.deliveryStatus,
      error_message: options.errorMessage,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    console.error("Failed to save message:", error.message);
    return null;
  }
  return data;
}

async function hasMessageWithExternalSid(messageSid: string) {
  const { data } = await adminSupabaseClient
    .from("messages")
    .select("id")
    .eq("external_message_sid", messageSid)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function resolveRestaurantByIncomingNumber(businessPhone: string) {
  try {
    const { data: sender } = await adminSupabaseClient
      .from("whatsapp_senders")
      .select("restaurant_id, phone_number, status")
      .eq("phone_number", businessPhone)
      .limit(1)
      .maybeSingle();

    if (sender?.restaurant_id) {
      const { data: restaurant } = await adminSupabaseClient
        .from("restaurants")
        .select("*")
        .eq("id", sender.restaurant_id)
        .single();

      if (restaurant) {
        return { restaurant, senderPhoneNumber: sender.phone_number as string };
      }
    }
  } catch {
    // whatsapp_senders table may not exist yet. Fall back to legacy lookup.
  }

  const { data: restaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("twilio_phone_number", businessPhone)
    .single();

  return {
    restaurant,
    senderPhoneNumber: restaurant?.twilio_phone_number as string | undefined,
  };
}

function detectLanguage(text: string): "ar" | "en" {
  const arabicMatches = (text.match(/[\u0600-\u06FF]/g) || []).length;
  return arabicMatches / text.length > 0.3 ? "ar" : "en";
}

/** Check if a phone number has opted out for a restaurant */
async function isOptedOut(restaurantId: string, phone: string): Promise<boolean> {
  const { data } = await adminSupabaseClient
    .from("opt_outs")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("phone_number", phone)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** Handle opt-out request */
async function handleOptOut(restaurantId: string, phone: string): Promise<void> {
  await adminSupabaseClient.from("opt_outs").upsert(
    { restaurant_id: restaurantId, phone_number: phone, reason: "user_request" },
    { onConflict: "restaurant_id,phone_number" }
  );
}

/** Handle opt-in (re-subscribe) request */
async function handleOptIn(restaurantId: string, phone: string): Promise<void> {
  await adminSupabaseClient
    .from("opt_outs")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("phone_number", phone);
}

/** Log webhook event for observability */
async function logWebhookEvent(
  eventType: string,
  messageSid: string | null,
  restaurantId: string | null,
  payload: Record<string, unknown>,
  processingTimeMs: number,
  error?: string
) {
  await adminSupabaseClient
    .from("webhook_events")
    .insert({
      event_type: eventType,
      message_sid: messageSid,
      restaurant_id: restaurantId,
      payload,
      processing_time_ms: processingTimeMs,
      error: error || null,
    })
    .then(() => {});
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  let restaurantId: string | null = null;
  let messageSid: string | null = null;

  try {
    const bodyText = await request.text();
    const params = Object.fromEntries(new URLSearchParams(bodyText).entries());
    const {
      MessageSid,
      From,
      To,
      Body,
      ProfileName,
      ButtonText,
      ButtonPayload,
      ListId,
      ListTitle,
      OriginalRepliedMessageSid,
    } = parseTwilioBody(bodyText);
    messageSid = MessageSid;
    const twilioSignature = request.headers.get("x-twilio-signature") || "";

    // Validate Twilio signature (mandatory)
    if (!twilioSignature || !validateTwilioRequest(request.url, params, twilioSignature)) {
      logWebhookEvent("signature_invalid", MessageSid, null, {}, Date.now() - startTime, "Invalid or missing signature");
      return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
    }

    // Detect interactive taps. When the customer taps a list item or quick-reply
    // button, Twilio sends ListId / ButtonPayload alongside (or sometimes
    // instead of) Body. Treat the slug as the canonical input for the AI so it's
    // language-independent and unambiguous.
    const tappedId = ListId || ButtonPayload || "";
    const tappedTitle = ListTitle || ButtonText || "";

    // Allow messages with no Body/tap when they include media attachments.
    const numMedia = Number(params.NumMedia || "0") || 0;
    if (!From || !To || !MessageSid || (!Body && !tappedId && numMedia <= 0)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Strip whatsapp: prefix
    const customerPhone = From.replace("whatsapp:", "");
    const businessPhone = To.replace("whatsapp:", "");

    // Synthesize a stable, language-independent message body for the AI when
    // this is a tap. The system prompt teaches Gemini to read [user_action:<id>]
    // tokens as the customer's choice.
    const effectiveBody = tappedId ? `[user_action:${tappedId}]` : Body;

    // Rate limit by customer phone number
    const rateLimitResult = checkRateLimit(`webhook:${customerPhone}`, RATE_LIMITS.webhook);
    if (!rateLimitResult.allowed) {
      logWebhookEvent("rate_limited", MessageSid, null, { customerPhone }, Date.now() - startTime);
      return new NextResponse(EMPTY_TWIML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Idempotency check
    if (await hasMessageWithExternalSid(MessageSid)) {
      return new NextResponse(EMPTY_TWIML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    console.log(
      `[webhook] From: ${customerPhone} | To: ${businessPhone} | ${tappedId ? `Tap: ${tappedId}` : `Body: ${Body.substring(0, 60)}`}`
    );

    // Resolve restaurant
    const { restaurant, senderPhoneNumber } = await resolveRestaurantByIncomingNumber(businessPhone);

    if (!restaurant) {
      console.error(`[webhook] No restaurant found for phone: ${businessPhone}`);
      const fallback = detectLanguage(Body) === "ar"
        ? "مرحباً! الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً."
        : "Hello! This service is not configured yet. Please try again later.";
      await sendWhatsAppMessage(customerPhone, fallback).catch(() => {});
      logWebhookEvent("no_restaurant", MessageSid, null, { businessPhone }, Date.now() - startTime);
      return new NextResponse(generateTwiMLResponse(fallback), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    restaurantId = restaurant.id;
    const normalizedBody = Body.trim().toLowerCase();

    // --- Opt-out handling ---
    if (OPT_OUT_KEYWORDS.includes(normalizedBody)) {
      await handleOptOut(restaurant.id, customerPhone);
      const msg = detectLanguage(Body) === "ar"
        ? "تم إلغاء اشتراكك بنجاح. لن تتلقى رسائل بعد الآن. أرسل 'ابدأ' للاشتراك مرة أخرى."
        : "You have been unsubscribed. You will no longer receive messages. Send 'start' to re-subscribe.";
      await sendWhatsAppMessage(customerPhone, msg, { fromPhoneNumber: senderPhoneNumber }).catch(() => {});
      logWebhookEvent("opt_out", MessageSid, restaurant.id, { customerPhone }, Date.now() - startTime);
      return new NextResponse(EMPTY_TWIML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // --- Opt-in handling ---
    if (OPT_IN_KEYWORDS.includes(normalizedBody)) {
      await handleOptIn(restaurant.id, customerPhone);
      const msg = detectLanguage(Body) === "ar"
        ? "مرحباً بك مجدداً! تم تفعيل اشتراكك. كيف يمكنني مساعدتك؟"
        : "Welcome back! You have been re-subscribed. How can I help you?";
      await sendWhatsAppMessage(customerPhone, msg, { fromPhoneNumber: senderPhoneNumber }).catch(() => {});
      logWebhookEvent("opt_in", MessageSid, restaurant.id, { customerPhone }, Date.now() - startTime);
      return new NextResponse(EMPTY_TWIML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // --- Check if user is opted out ---
    if (await isOptedOut(restaurant.id, customerPhone)) {
      // Silently ignore messages from opted-out users (don't respond)
      logWebhookEvent("ignored_opted_out", MessageSid, restaurant.id, { customerPhone }, Date.now() - startTime);
      return new NextResponse(EMPTY_TWIML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Find or create conversation (now tracks last_inbound_at)
    const conversation = await findOrCreateConversation(restaurant.id, customerPhone);

    // --- Media ingest ---
    // If Twilio posted NumMedia > 0, download each item with Basic auth, push
    // into Supabase Storage, and persist a single "customer" message row
    // whose message_type reflects the first (primary) media kind. Each media
    // slot is captured in metadata.media[] so the dashboard can render all of
    // them and we keep Twilio's original URL for auditing.
    interface MediaSlot {
      storage_path: string | null;
      content_type: string;
      size_bytes: number | null;
      twilio_url: string;
      original_filename: string | null;
      delivery_status?: "stored" | "too_large" | "failed";
      error?: string;
      needs_transcription?: boolean;
    }
    const mediaSlots: MediaSlot[] = [];
    if (numMedia > 0) {
      for (let i = 0; i < numMedia; i++) {
        const twilioUrl = params[`MediaUrl${i}`] || "";
        const contentType = params[`MediaContentType${i}`] || "application/octet-stream";
        if (!twilioUrl) continue;

        try {
          // Cheap HEAD probe via GET — downloadTwilioMedia enforces both
          // the declared content-length and the actual body size against
          // MAX_INBOUND_MEDIA_BYTES (20MB).
          const { buffer, contentType: serverCt, sizeBytes } =
            await downloadTwilioMedia(twilioUrl);

          const effectiveCt = contentType || serverCt;
          const { storagePath } = await uploadInboundMedia({
            restaurantId: restaurant.id,
            conversationId: conversation.id,
            contentType: effectiveCt,
            buffer,
          });

          const slot: MediaSlot = {
            storage_path: storagePath,
            content_type: effectiveCt,
            size_bytes: sizeBytes,
            twilio_url: twilioUrl,
            original_filename: null,
            delivery_status: "stored",
          };
          if (
            effectiveCt.toLowerCase().startsWith("audio/ogg") ||
            effectiveCt.toLowerCase() === "audio/opus"
          ) {
            slot.needs_transcription = true;
          }
          mediaSlots.push(slot);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "download failed";
          const tooLarge = /too large/i.test(msg);
          mediaSlots.push({
            storage_path: null,
            content_type: contentType,
            size_bytes: null,
            twilio_url: twilioUrl,
            original_filename: null,
            delivery_status: tooLarge ? "too_large" : "failed",
            error: msg.slice(0, 500),
          });
          console.error(
            `[webhook] media ${i} ingest failed (${contentType}) — ${msg}. cap=${MAX_INBOUND_MEDIA_BYTES}`
          );
        }
      }
    }

    // Derive message_type + content from media (when present). Keep taps
    // taking precedence since they come from interactive message replies
    // and shouldn't be confused with media uploads.
    const primaryMedia = mediaSlots[0];
    let inboundMessageType: string;
    let inboundContent: string;
    if (tappedId) {
      inboundMessageType = "interactive_reply";
      inboundContent = effectiveBody;
    } else if (primaryMedia) {
      inboundMessageType = messageTypeFromContentType(primaryMedia.content_type);
      inboundContent = Body && Body.trim().length > 0
        ? Body
        : placeholderCaptionFor(inboundMessageType);
    } else {
      inboundMessageType = "text";
      inboundContent = effectiveBody;
    }

    // Save incoming message. For interactive taps we store the encoded
    // [user_action:<id>] token in `content` (so the AI sees it consistently)
    // and the original tap details in `metadata` for the dashboard renderer.
    // For media we store metadata.media[] with storage paths + Twilio URLs.
    const inboundMessage = await saveMessage(conversation.id, "customer", inboundContent, {
      externalMessageSid: MessageSid,
      deliveryStatus:
        mediaSlots.length > 0 && mediaSlots.every((m) => m.delivery_status === "too_large")
          ? "too_large"
          : "received",
      messageType: inboundMessageType,
      metadata: tappedId
        ? {
            tap: {
              id: tappedId,
              title: tappedTitle || null,
              replied_to: OriginalRepliedMessageSid || null,
              raw_body: Body || null,
            },
          }
        : mediaSlots.length > 0
        ? { media: mediaSlots }
        : null,
    });

    if (ProfileName && !conversation.customer_name) {
      await adminSupabaseClient
        .from("conversations")
        .update({ customer_name: ProfileName })
        .eq("id", conversation.id);
    }

    // Claim-first gate:
    //   * bot        → AI auto-replies (existing flow)
    //   * human      → silent, the claimed agent will reply manually
    //   * unassigned → silent + broadcast push to on-shift agents
    //
    // AI-first promotion: if the tenant has AI enabled and nobody has claimed
    // this conversation yet, auto-delegate to the bot. The eq('handler_mode',
    // 'unassigned') filter keeps this race-safe against a concurrent claim.
    let handlerMode: string = (conversation.handler_mode as string) || "unassigned";
    if (handlerMode === "unassigned" && restaurant.ai_enabled === true) {
      const { data: promoted, error: promoteErr } = await adminSupabaseClient
        .from("conversations")
        .update({ handler_mode: "bot" })
        .eq("id", conversation.id)
        .eq("handler_mode", "unassigned")
        .select("id")
        .maybeSingle();
      if (!promoteErr && promoted) {
        handlerMode = "bot";
      }
    }

    if (handlerMode === "human") {
      // Ping the agent currently claiming this conversation so they see the
      // new message even with the app backgrounded. Fire-and-forget.
      if (conversation.assigned_to) {
        const preview = {
          customerName: ProfileName || conversation.customer_name || null,
          customerPhone,
          body: tappedId
            ? tappedTitle || Body || "رسالة جديدة"
            : inboundContent,
        };
        void notifyAssignedAgentOfNewMessage(
          restaurant.id,
          conversation.id,
          conversation.assigned_to,
          preview
        );
      }
      logWebhookEvent(
        "inbound_human_owned",
        MessageSid,
        restaurant.id,
        { conversationId: conversation.id, assignedTo: conversation.assigned_to ?? null },
        Date.now() - startTime
      );
      return new NextResponse(EMPTY_TWIML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    if (handlerMode === "unassigned") {
      // Fire-and-forget push broadcast. Do not block Twilio's response.
      const preview = {
        customerName: ProfileName || conversation.customer_name || null,
        customerPhone,
        body: tappedId ? tappedTitle || Body || "رسالة جديدة" : inboundContent,
      };
      void notifyAgentsOfNewConversation(restaurant.id, conversation.id, preview);
      logWebhookEvent(
        "inbound_unassigned_broadcast",
        MessageSid,
        restaurant.id,
        { conversationId: conversation.id },
        Date.now() - startTime
      );
      return new NextResponse(EMPTY_TWIML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // handlerMode === 'bot' (claimed + delegated to bot)

    // Get AI agent config
    const { data: aiAgent } = await adminSupabaseClient
      .from("ai_agents")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .single();

    if (!aiAgent) {
      console.error(`[webhook] No active AI agent for restaurant: ${restaurant.id}`);
      const msg = detectLanguage(Body) === "ar"
        ? "مرحباً! المساعد الذكي غير متاح حالياً."
        : "Hello! The AI assistant is not configured yet.";
      let outboundSid: string | undefined;
      try {
        outboundSid = await sendWhatsAppMessage(customerPhone, msg, {
          fromPhoneNumber: senderPhoneNumber,
          statusCallback: `${request.nextUrl.origin}/api/webhooks/twilio/status`,
        });
      } catch {
        outboundSid = undefined;
      }
      await saveMessage(conversation.id, "agent", msg, {
        externalMessageSid: outboundSid,
        deliveryStatus: outboundSid ? "queued" : "failed",
      });
      logWebhookEvent("no_ai_agent", MessageSid, restaurant.id, {}, Date.now() - startTime);
      return new NextResponse(generateTwiMLResponse(msg), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Queue AI reply job then process it immediately
    const queued = inboundMessage
      ? await queueAIReplyJob({
          restaurantId: restaurant.id,
          conversationId: conversation.id,
          inboundMessageId: inboundMessage.id,
          customerPhone,
          senderPhoneNumber,
        })
      : { queued: false };

    if (queued.queued && inboundMessage) {
      await processPendingAIReplyJobs(1, inboundMessage.id).catch((err) =>
        console.error("[webhook] processPendingAIReplyJobs error:", err)
      );
    }

    if (!queued.queued) {
      const fallback = detectLanguage(Body) === "ar"
        ? "عذراً، حدث تأخير مؤقت. يرجى المحاولة لاحقاً."
        : "Sorry, the assistant is temporarily delayed. Please try again shortly.";
      let outboundSid: string | undefined;
      try {
        outboundSid = await sendWhatsAppMessage(customerPhone, fallback, {
          fromPhoneNumber: senderPhoneNumber,
          statusCallback: `${request.nextUrl.origin}/api/webhooks/twilio/status`,
        });
      } catch {
        outboundSid = undefined;
      }
      await saveMessage(conversation.id, "agent", fallback, {
        externalMessageSid: outboundSid,
        deliveryStatus: outboundSid ? "queued" : "failed",
      });
    }

    logWebhookEvent("processed", MessageSid, restaurant.id, { queued: queued.queued }, Date.now() - startTime);

    return new NextResponse(EMPTY_TWIML, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("[webhook] Unhandled error:", error);
    logWebhookEvent(
      "error",
      messageSid,
      restaurantId,
      {},
      Date.now() - startTime,
      error instanceof Error ? error.message : "Unknown error"
    );
    const msg = "عذراً، حدث خطأ. / Sorry, an error occurred.";
    return new NextResponse(generateTwiMLResponse(msg), {
      status: 500,
      headers: { "Content-Type": "application/xml" },
    });
  }
}
