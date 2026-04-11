import { adminSupabaseClient } from "@/lib/supabase/admin";
import { generateGeminiResponse } from "@/lib/gemini";
import { sendWhatsAppMessage } from "@/lib/twilio";
import { sendInteractiveMessage } from "@/lib/twilio-content";
import { isSessionWindowOpen } from "@/lib/session-window";
import type { InteractiveReply } from "@/lib/types";

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
  options: {
    externalMessageSid?: string;
    deliveryStatus?: string;
    errorMessage?: string;
    messageType?: string;
    metadata?: Record<string, unknown> | null;
  } = {}
) {
  const { error } = await adminSupabaseClient.from("messages").insert({
    conversation_id: conversationId,
    role: "agent",
    content,
    message_type: options.messageType || "text",
    metadata: options.metadata ?? null,
    external_message_sid: options.externalMessageSid,
    delivery_status: options.deliveryStatus,
    error_message: options.errorMessage,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to save agent message: ${error.message}`);
  }
}

async function getConversationHistory(conversationId: string, limit = 12) {
  const { data } = await adminSupabaseClient
    .from("messages")
    .select("role, content, message_type, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []).reverse().map((message) => {
    let content = message.content as string;

    // Enrich agent interactive replies so Gemini sees the option titles it
    // previously offered. The webhook already encodes inbound taps as
    // "[user_action:<id>]" inside `content`, so the model has both sides.
    if (message.role === "agent" && message.message_type === "interactive") {
      const meta = message.metadata as { interactive?: InteractiveReply } | null;
      const interactive = meta?.interactive;
      if (interactive && interactive.type === "quick_reply") {
        const opts = interactive.options.map((o) => `${o.title} (${o.id})`).join(" | ");
        content = `${interactive.body}\n[quick_reply_options: ${opts}]`;
      } else if (interactive && interactive.type === "list") {
        const items = interactive.items.map((i) => `${i.title} (${i.id})`).join(" | ");
        content = `${interactive.body}\n[list_items: ${items}]`;
      }
    }

    return {
      role: (message.role === "customer" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content,
    };
  });
}

// Arabic/English stop-words that add no retrieval signal. Short pronouns and
// common verbs ("yes", "tell me", "ايوا", "عرفني") were silently killing KB
// matches on follow-up turns.
const KB_STOPWORDS = new Set([
  // English
  "the", "and", "for", "you", "are", "can", "have", "has", "with", "what",
  "how", "who", "when", "where", "yes", "no", "ok", "please", "tell", "me",
  "show", "give", "want", "need", "know", "about", "any", "all",
  // Arabic
  "ما", "هل", "في", "من", "إلى", "الى", "على", "عن", "هو", "هي", "انا",
  "أنا", "انت", "أنت", "نعم", "ايوا", "أيوا", "لا", "لو", "ممكن", "عايز",
  "عاوز", "اعرف", "أعرف", "عرفني", "قولي", "ابغى", "أبغى", "الانواع",
  "الأنواع", "انواع", "أنواع", "ايه", "إيه", "ايش", "شو", "وش", "كيف",
  "متى", "اين", "أين", "وين",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Keep letters (incl. Arabic) and digits, split on everything else
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !KB_STOPWORDS.has(word));
}

async function queryKnowledgeBase(
  restaurantId: string,
  query: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  // Pull the full KB for the tenant. Previously this capped at 8 rows BEFORE
  // filtering, so any business with a rich KB (a spa with 10+ services, a
  // restaurant with categories, etc.) would see most entries invisible to the
  // agent. KB entries are short, so fetching ~200 is cheap.
  const { data } = await adminSupabaseClient
    .from("knowledge_base")
    .select("title, content")
    .eq("restaurant_id", restaurantId)
    .limit(200);

  if (!data?.length) {
    return "";
  }

  // Expand the retrieval query with the last couple of USER turns. Short
  // follow-ups like "yes, show me the types" carry no topical keywords on
  // their own — the topic lives in the previous user message.
  const recentUserTurns = history
    .filter((msg) => msg.role === "user")
    .slice(-3)
    .map((msg) => msg.content)
    .join(" ");
  const expandedQuery = `${query} ${recentUserTurns}`;
  const queryTokens = new Set(tokenize(expandedQuery));

  const renderEntry = (entry: { title: string | null; content: string }) => {
    const title = entry.title?.trim();
    return title ? `${title}: ${entry.content}` : entry.content;
  };

  // If we have topical tokens, score entries by overlap against title+content
  // and keep the best. Fall back to the whole KB (capped) when we have no
  // signal at all — better to give the model everything than nothing, since
  // the strict "answer from knowledge" prompt depends on KB being present.
  if (queryTokens.size === 0) {
    return data.slice(0, 20).map(renderEntry).join("\n\n");
  }

  const scored = data
    .map((entry) => {
      const haystack = `${entry.title || ""} ${entry.content}`.toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (haystack.includes(token)) score += 1;
      }
      return { entry, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((row) => renderEntry(row.entry));

  // Even when scoring produces nothing (pure stop-words, or a greeting), we
  // still pass a slice of the KB so the agent has grounding to list from.
  if (scored.length === 0) {
    return data.slice(0, 12).map(renderEntry).join("\n\n");
  }

  return scored.join("\n\n");
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
      const ragContext = await queryKnowledgeBase(
        job.restaurant_id,
        inboundMessage.content,
        history
      );
      const menuContext = await getMenuContext(job.restaurant_id);
      const fullContext = [ragContext, menuContext]
        .filter((value) => value.trim())
        .join("\n\n");

      const userLanguage = detectLanguage(inboundMessage.content);
      let responseText: string;
      let reply: InteractiveReply;

      try {
        const result = await generateGeminiResponse({
          systemPrompt:
            aiAgent.system_instructions ||
            `You are a restaurant assistant for ${restaurant.name}.`,
          personality: aiAgent.personality || "friendly",
          ragContext: fullContext,
          conversationHistory: history.slice(0, -1),
          userMessage: inboundMessage.content,
          languagePreference:
            (aiAgent.language_preference as "ar" | "en" | "auto") || "auto",
          offTopicResponse:
            aiAgent.off_topic_response ||
            (userLanguage === "ar"
              ? "عذراً، أنا متخصص فقط في الإجابة على أسئلة المطعم."
              : "Sorry, I can only answer questions about the restaurant."),
        });

        responseText = result.content;
        reply = result.reply;
      } catch {
        responseText =
          userLanguage === "ar"
            ? "عذراً، حدث خطأ. يرجى المحاولة لاحقاً."
            : "Sorry, an error occurred. Please try again later.";
        reply = { type: "text", content: responseText };
      }

      const senderPhoneNumber =
        (job.payload as { senderPhoneNumber?: string | null })?.senderPhoneNumber ||
        restaurant.twilio_phone_number;
      const customerPhone =
        (job.payload as { customerPhone?: string | null })?.customerPhone || "";

      // Check 24-hour session window before sending
      const { data: conversation } = await adminSupabaseClient
        .from("conversations")
        .select("last_inbound_at")
        .eq("id", job.conversation_id)
        .single();

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

      const statusCallback = `${(process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "")}/api/webhooks/twilio/status`;

      let outboundMessageSid: string | undefined;
      let outboundMessageType: string = "text";
      let outboundMetadata: Record<string, unknown> | null = null;

      try {
        if (reply.type === "text") {
          outboundMessageSid = await sendWhatsAppMessage(customerPhone, reply.content, {
            fromPhoneNumber: senderPhoneNumber || undefined,
            statusCallback,
          });
        } else {
          if (!senderPhoneNumber) {
            throw new Error("Cannot send interactive message: no sender phone number configured");
          }
          const sent = await sendInteractiveMessage({
            reply,
            from: senderPhoneNumber,
            to: customerPhone,
            statusCallback,
            language: reply.type === "list" || reply.type === "quick_reply" ? userLanguage : undefined,
          });
          outboundMessageSid = sent.messageSid;
          outboundMessageType = "interactive";
          outboundMetadata = {
            interactive: reply,
            content_sid: sent.contentSid,
            cached: sent.cached,
          };
          console.log(
            `[ai-reply] interactive ${reply.type} sent (cached=${sent.cached}, sid=${sent.contentSid})`
          );
        }
      } catch (sendError) {
        await saveAgentMessage(job.conversation_id, responseText, {
          deliveryStatus: "failed",
          errorMessage: sendError instanceof Error ? sendError.message : "Twilio send failed",
          messageType: outboundMessageType,
          metadata: outboundMetadata,
        });
        throw sendError;
      }

      await saveAgentMessage(job.conversation_id, responseText, {
        externalMessageSid: outboundMessageSid,
        deliveryStatus: outboundMessageSid ? "queued" : "failed",
        messageType: outboundMessageType,
        metadata: outboundMetadata,
      });

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
