import { adminSupabaseClient } from "@/lib/supabase/admin";
import { buildBusinessSupportContext } from "@/lib/customer-service";
import { generateGeminiResponse } from "@/lib/gemini";
import { sendWhatsAppMessage } from "@/lib/twilio";
import { isSessionWindowOpen } from "@/lib/session-window";
import { retrieveKnowledgeChunks } from "@/lib/rag";
import { classifyIntent } from "@/lib/intent-classifier";
import { createOrder } from "@/lib/order-manager";

interface QueueAIReplyJobInput {
  restaurantId: string;
  conversationId: string;
  inboundMessageId: string;
  customerPhone: string;
  senderPhoneNumber?: string;
}

function detectLanguage(text: string): "ar" | "en" {
  const arabicMatches = (text.match(/[\u0600-\u06FF]/g) || []).length;
  return text.length > 0 && arabicMatches / text.length > 0.3 ? "ar" : "en";
}

async function saveAgentMessage(
  conversationId: string,
  content: string,
  externalMessageSid?: string,
  deliveryStatus?: string,
  errorMessage?: string
) {
  const { error } = await adminSupabaseClient.from("messages").insert({
    conversation_id: conversationId,
    role: "agent",
    content,
    message_type: "text",
    external_message_sid: externalMessageSid,
    delivery_status: deliveryStatus,
    error_message: errorMessage,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to save agent message: ${error.message}`);
  }
}

async function getConversationHistory(conversationId: string, limit = 12) {
  const { data } = await adminSupabaseClient
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || [])
    .reverse()
    .map((message) => ({
      role: (message.role === "customer" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: message.content,
    }));
}

async function queryKnowledgeBase(restaurantId: string, query: string) {
  return retrieveKnowledgeChunks(restaurantId, query, 5);
}

async function getMenuContext(restaurantId: string) {
  const { data } = await adminSupabaseClient
    .from("menu_items")
    .select("name_ar, name_en, description_ar, description_en, price, currency, category")
    .eq("restaurant_id", restaurantId)
    .eq("is_available", true)
    .limit(30);

  if (!data?.length) {
    return "";
  }

  return data
    .map((item) => {
      const name = item.name_ar || item.name_en || "Unknown";
      const description = item.description_ar || item.description_en || "";
      const parts = [`${name}: ${item.price} ${item.currency}`];
      if (description) {
        parts.push(description);
      }
      if (item.category) {
        parts.push(`Category: ${item.category}`);
      }
      return parts.join(" | ");
    })
    .join("\n");
}

async function getConversationContext(conversationId: string) {
  const { data } = await adminSupabaseClient
    .from("conversations")
    .select("customer_name, last_inbound_at")
    .eq("id", conversationId)
    .maybeSingle();

  return data;
}

export async function queueAIReplyJob(input: QueueAIReplyJobInput) {
  try {
    await adminSupabaseClient.from("ai_reply_jobs").upsert(
      {
        restaurant_id: input.restaurantId,
        conversation_id: input.conversationId,
        inbound_message_id: input.inboundMessageId,
        status: "pending",
        payload: {
          customerPhone: input.customerPhone,
          senderPhoneNumber: input.senderPhoneNumber || null,
        },
      },
      { onConflict: "inbound_message_id" }
    );
    return { queued: true };
  } catch {
    return { queued: false };
  }
}

export async function processPendingAIReplyJobs(limit = 10, inboundMessageId?: string) {
  let queryBuilder = adminSupabaseClient
    .from("ai_reply_jobs")
    .select("*")
    .in("status", ["pending", "retryable"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (inboundMessageId) {
    queryBuilder = queryBuilder.eq("inbound_message_id", inboundMessageId);
  }

  const { data: jobs, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to load AI reply jobs: ${error.message}`);
  }

  let processed = 0;

  for (const job of jobs || []) {
    try {
      await adminSupabaseClient
        .from("ai_reply_jobs")
        .update({
          status: "processing",
          locked_at: new Date().toISOString(),
          attempt_count: (job.attempt_count || 0) + 1,
        })
        .eq("id", job.id);

      const { data: inboundMessage } = await adminSupabaseClient
        .from("messages")
        .select("*")
        .eq("id", job.inbound_message_id)
        .single();

      const { data: restaurant } = await adminSupabaseClient
        .from("restaurants")
        .select("*")
        .eq("id", job.restaurant_id)
        .single();

      const { data: aiAgent } = await adminSupabaseClient
        .from("ai_agents")
        .select("*")
        .eq("restaurant_id", job.restaurant_id)
        .eq("is_active", true)
        .single();

      if (!inboundMessage || !restaurant || !aiAgent) {
        throw new Error("Missing inbound message, restaurant, or ai agent");
      }

      const history = await getConversationHistory(job.conversation_id, 12);
      const conversation = await getConversationContext(job.conversation_id);
      const ragContext = await queryKnowledgeBase(
        job.restaurant_id,
        inboundMessage.content
      );
      const menuContext = await getMenuContext(job.restaurant_id);
      const businessContext = buildBusinessSupportContext(restaurant);

      const userLanguage = detectLanguage(inboundMessage.content);
      let responseText: string;

      try {
        const result = await generateGeminiResponse({
          systemPrompt:
            aiAgent.system_instructions ||
            `You are the customer service agent for ${restaurant.name}.`,
          businessName: restaurant.name,
          agentName: aiAgent.name,
          customerName: conversation?.customer_name || null,
          personality: aiAgent.personality || "friendly",
          businessContext,
          ragContext,
          menuContext,
          conversationHistory: history.slice(0, -1),
          userMessage: inboundMessage.content,
          languagePreference:
            (aiAgent.language_preference as "ar" | "en" | "auto") || "auto",
          offTopicResponse:
            aiAgent.off_topic_response ||
            (userLanguage === "ar"
              ? "عذراً، أستطيع المساعدة فقط في الأسئلة المتعلقة بهذا النشاط."
              : "Sorry, I can only help with questions about this business."),
        });

        responseText = result.content;

        // Fire-and-forget: classify intent and create order/escalation if needed
        classifyIntent(inboundMessage.content, responseText, history)
          .then(async ({ intent, details }) => {
            if (intent === "none" || !details.trim()) return;
            await createOrder({
              restaurantId: job.restaurant_id,
              conversationId: job.conversation_id,
              customerPhone: (job.payload as { customerPhone?: string })?.customerPhone || "",
              customerName: conversation?.customer_name ?? null,
              type: intent,
              details,
            });
          })
          .catch(() => {/* non-fatal */});
      } catch {
        responseText =
          userLanguage === "ar"
            ? "عذراً، حدث خطأ. يرجى المحاولة لاحقاً."
            : "Sorry, an error occurred. Please try again later.";
      }

      const senderPhoneNumber =
        (job.payload as { senderPhoneNumber?: string | null })?.senderPhoneNumber ||
        restaurant.twilio_phone_number;
      const customerPhone =
        (job.payload as { customerPhone?: string | null })?.customerPhone || "";

      // Check 24-hour session window before sending
      if (!isSessionWindowOpen(conversation?.last_inbound_at)) {
        console.warn(`[ai-reply] 24-hour window expired for conversation ${job.conversation_id}. Skipping.`);
        await adminSupabaseClient
          .from("ai_reply_jobs")
          .update({
            status: "failed",
            last_error: "24-hour session window expired. Cannot send free-form message.",
            processed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        continue;
      }

      // Check opt-out status
      const { data: optOut } = await adminSupabaseClient
        .from("opt_outs")
        .select("id")
        .eq("restaurant_id", job.restaurant_id)
        .eq("phone_number", customerPhone)
        .limit(1)
        .maybeSingle();

      if (optOut) {
        console.warn(`[ai-reply] Customer ${customerPhone} has opted out. Skipping.`);
        await adminSupabaseClient
          .from("ai_reply_jobs")
          .update({
            status: "failed",
            last_error: "Customer has opted out of messages.",
            processed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        continue;
      }

      let outboundMessageSid: string | undefined;
      try {
        outboundMessageSid = await sendWhatsAppMessage(customerPhone, responseText, {
          fromPhoneNumber: senderPhoneNumber || undefined,
          statusCallback: `${(process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "")}/api/webhooks/twilio/status`,
        });
      } catch (sendError) {
        await saveAgentMessage(
          job.conversation_id,
          responseText,
          undefined,
          "failed",
          sendError instanceof Error ? sendError.message : "Twilio send failed"
        );
        throw sendError;
      }

      await saveAgentMessage(
        job.conversation_id,
        responseText,
        outboundMessageSid,
        outboundMessageSid ? "queued" : "failed"
      );

      await adminSupabaseClient
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", job.conversation_id);

      await adminSupabaseClient
        .from("ai_reply_jobs")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", job.id);

      processed += 1;
    } catch (jobError) {
      const maxAttempts = job.max_attempts || 5;
      const nextStatus =
        (job.attempt_count || 0) + 1 >= maxAttempts ? "failed" : "retryable";

      await adminSupabaseClient
        .from("ai_reply_jobs")
        .update({
          status: nextStatus,
          last_error:
            jobError instanceof Error ? jobError.message : "Unknown job error",
        })
        .eq("id", job.id);
    }
  }

  return { processed, fetched: jobs?.length || 0 };
}
