import { adminSupabaseClient } from "@/lib/supabase/admin";
import { buildBusinessSupportContext } from "@/lib/customer-service";
import { generateGeminiResponse } from "@/lib/gemini";
import { sendWhatsAppMessage } from "@/lib/twilio";
import { sendInteractiveMessage } from "@/lib/twilio-content";
import { isSessionWindowOpen } from "@/lib/session-window";
import {
  RAG_MATCH_THRESHOLD,
  retrieveKnowledgeChunks,
  type RetrievedChunk,
} from "@/lib/rag";
import { classifyIntent } from "@/lib/intent-classifier";
import { createOrder } from "@/lib/order-manager";
import { loadActiveAgentInstructions } from "@/lib/agent-instructions";
import {
  classifyEscalation,
  isBookingRequest,
} from "@/lib/escalation-classifier";
import type { AvailableLabel, InteractiveReply } from "@/lib/types";

const ALLOWED_LABEL_COLORS = new Set([
  "slate",
  "red",
  "amber",
  "emerald",
  "blue",
  "indigo",
  "fuchsia",
  "rose",
]);

async function loadAvailableLabels(
  restaurantId: string
): Promise<AvailableLabel[]> {
  const { data, error } = await adminSupabaseClient
    .from("conversation_labels")
    .select("id, name, color")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data as AvailableLabel[];
}

/**
 * Apply labels chosen by the bot to the conversation. Best-effort: never
 * throws into the reply pipeline — labeling failures shouldn't block a send.
 *
 * - `labelIds` must already be validated against the tenant's labels.
 * - `newLabels` are created on the fly when they don't collide with an
 *   existing name (unique (restaurant_id, name)); collisions are resolved
 *   by attaching the existing label instead.
 */
async function applyBotSelectedLabels(params: {
  conversationId: string;
  restaurantId: string;
  labelIds: string[];
  newLabels: Array<{ name: string; color?: string }>;
  existing: AvailableLabel[];
}): Promise<void> {
  const { conversationId, restaurantId, labelIds, newLabels, existing } = params;
  try {
    const finalIds = new Set<string>(labelIds);

    if (newLabels.length > 0) {
      const existingByName = new Map(
        existing.map((l) => [l.name.toLowerCase(), l.id])
      );
      for (const proposal of newLabels) {
        const key = proposal.name.toLowerCase();
        const hit = existingByName.get(key);
        if (hit) {
          finalIds.add(hit);
          continue;
        }
        const color =
          proposal.color && ALLOWED_LABEL_COLORS.has(proposal.color)
            ? proposal.color
            : "slate";
        const { data, error } = await adminSupabaseClient
          .from("conversation_labels")
          .insert({
            restaurant_id: restaurantId,
            name: proposal.name,
            color,
            created_by: null,
          })
          .select("id")
          .single();
        if (!error && data?.id) {
          finalIds.add(data.id);
        } else if (error?.code === "23505") {
          // Race on unique (restaurant_id, name) — fetch the winner.
          const { data: row } = await adminSupabaseClient
            .from("conversation_labels")
            .select("id")
            .eq("restaurant_id", restaurantId)
            .eq("name", proposal.name)
            .maybeSingle();
          if (row?.id) finalIds.add(row.id);
        }
      }
    }

    if (finalIds.size === 0) return;

    const rows = Array.from(finalIds).map((label_id) => ({
      conversation_id: conversationId,
      label_id,
      assigned_by: null,
    }));
    await adminSupabaseClient
      .from("conversation_label_assignments")
      .upsert(rows, { onConflict: "conversation_id,label_id", ignoreDuplicates: true });
  } catch (err) {
    console.warn(
      "[ai-reply] applyBotSelectedLabels failed:",
      err instanceof Error ? err.message : err
    );
  }
}

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

    // Enrich customer interactive taps so the model sees the human-readable
    // title (in the customer's language) instead of only the opaque
    // "[user_action:<id>]" token. Without this, the language-detection
    // heuristic sees no natural-language turn and can flip locales.
    if (message.role === "customer" && message.message_type === "interactive_reply") {
      const meta = message.metadata as { tap?: { id?: string; title?: string | null } } | null;
      const title = meta?.tap?.title?.trim();
      const id = meta?.tap?.id;
      if (title) {
        content = id ? `${title} [user_action:${id}]` : title;
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

// Arabic/English stop-words used by the keyword KB fallback. Short pronouns
// and common verbs ("yes", "tell me", "ايوا", "عرفني") were silently killing
// retrieval on follow-up turns when the embedding RAG isn't populated.
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
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !KB_STOPWORDS.has(word));
}

/**
 * Legacy keyword fallback over the `knowledge_base` table that the website
 * crawler populates during onboarding. Used when the new vector RAG returns
 * nothing (e.g. tenant has not run the chunk ingestion yet, or the
 * embedding similarity threshold filtered everything out).
 */
async function fallbackKeywordKB(restaurantId: string, expandedQuery: string) {
  const { data } = await adminSupabaseClient
    .from("knowledge_base")
    .select("title, content")
    .eq("restaurant_id", restaurantId)
    .limit(200);

  if (!data?.length) return "";

  const renderEntry = (entry: { title: string | null; content: string }) => {
    const title = entry.title?.trim();
    return title ? `${title}: ${entry.content}` : entry.content;
  };

  const queryTokens = new Set(tokenize(expandedQuery));
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

  if (scored.length === 0) {
    return data.slice(0, 12).map(renderEntry).join("\n\n");
  }
  return scored.join("\n\n");
}

interface KnowledgeBaseResult {
  context: string;
  /**
   * How many RAG chunks grounded this turn. Drives the escalation classifier's
   * "knowledge gap" rule — zero hits on a non-trivial question triggers
   * handoff to a human.
   */
  chunkCount: number;
  /**
   * Max cosine similarity across the returned chunks. `null` when we fell
   * through to the keyword fallback (which has no similarity signal).
   */
  topScore: number | null;
  /** How many chunks cleared the "strong hit" bar (≥ 0.65). */
  strongHitCount: number;
  /** Expanded query string actually sent to the embedder / RPC. */
  expandedQuery: string;
}

const RESTAURANT_HAS_CHUNKS_CACHE = new Map<string, { hasChunks: boolean; expiresAt: number }>();
const RESTAURANT_HAS_CHUNKS_TTL_MS = 5 * 60 * 1000;

async function restaurantHasKnowledgeChunks(restaurantId: string): Promise<boolean> {
  const cached = RESTAURANT_HAS_CHUNKS_CACHE.get(restaurantId);
  if (cached && cached.expiresAt > Date.now()) return cached.hasChunks;

  const { count } = await adminSupabaseClient
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .limit(1);

  const hasChunks = (count ?? 0) > 0;
  RESTAURANT_HAS_CHUNKS_CACHE.set(restaurantId, {
    hasChunks,
    expiresAt: Date.now() + RESTAURANT_HAS_CHUNKS_TTL_MS,
  });
  return hasChunks;
}

async function queryKnowledgeBase(
  restaurantId: string,
  query: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<KnowledgeBaseResult> {
  // Expand the retrieval query with the last couple of USER turns. Short
  // follow-ups like "ايوا عرفني الانواع" carry no topical signal on their
  // own — the topic lives in the previous user turn — and that's true for
  // both embedding similarity and keyword matching.
  const recentUserTurns = history
    .filter((msg) => msg.role === "user")
    .slice(-3)
    .map((msg) => msg.content)
    .join(" ");
  const expandedQuery = `${query} ${recentUserTurns}`.trim();

  // Short-circuit the embedding call for tenants that haven't ingested
  // chunks yet. The embedQuery API call is ~500–1500ms per turn, and on a
  // table with zero rows for this restaurant it's pure waste. Cache the
  // empty-bucket result for 5 min so a freshly ingested tenant starts
  // using RAG soon after backfill.
  const hasChunks = await restaurantHasKnowledgeChunks(restaurantId);
  const { context, chunks } = hasChunks
    ? await retrieveKnowledgeChunks(restaurantId, expandedQuery, 5)
    : { context: "", chunks: [] as RetrievedChunk[] };
  if (chunks.length > 0) {
    return summarizeRagResult(context, chunks, expandedQuery);
  }

  // Fallback: legacy keyword search over the older `knowledge_base` table
  // (populated by the website crawler during onboarding). Ensures the agent
  // still has grounding for tenants that haven't run chunk ingestion. No
  // similarity signal here, so topScore stays null and the classifier's
  // weak-hit rule is skipped for this path.
  const fallback = await fallbackKeywordKB(restaurantId, expandedQuery);
  const chunkCount = fallback.trim()
    ? fallback.split(/\n\n+/).filter((s) => s.trim()).length
    : 0;
  return {
    context: fallback,
    chunkCount,
    topScore: null,
    strongHitCount: 0,
    expandedQuery,
  };
}

function summarizeRagResult(
  context: string,
  chunks: RetrievedChunk[],
  expandedQuery: string
): KnowledgeBaseResult {
  const topScore = chunks.reduce(
    (max, c) => (c.similarity > max ? c.similarity : max),
    0
  );
  const strongHitCount = chunks.filter((c) => c.similarity >= 0.65).length;
  return {
    context,
    chunkCount: chunks.length,
    topScore,
    strongHitCount,
    expandedQuery,
  };
}

// ---------------------------------------------------------------------------
// Menu intent gate (Change 4). Injecting the 200-row menu every turn is
// wasteful for non-menu questions (greetings, location, hours, complaints).
// When the query clearly doesn't need the menu we return an empty string and
// shave 500–1500 tokens off the prompt.
// ---------------------------------------------------------------------------

const MENU_INTENT_PATTERNS = [
  /\b(menu|price|prices|cost|costs|available|serves?|serving|offer|offers|item|items|order|dish|dishes|drink|drinks|how much)\b/i,
  /قائمة|مينيو|منيو|سعر|أسعار|كام|متوفر|عندك|عندكم|عندكن|الأنواع|الانواع|أنواع|انواع|ألوان|الوان|اطلب|طلب|اشتري|يوجد/u,
];

function shouldIncludeMenu(expandedQuery: string): boolean {
  return MENU_INTENT_PATTERNS.some((p) => p.test(expandedQuery));
}

async function getMenuContext(restaurantId: string) {
  // Bumped from 30 → 200 because tenants like Kiara have ~79 services and
  // RAG+menu work best as complementary channels: RAG handles deep semantic
  // queries, menu_context provides the always-visible flat catalog so price
  // questions get answered without a vector hop.
  const { data } = await adminSupabaseClient
    .from("menu_items")
    .select(
      "name_ar, name_en, description_ar, description_en, price, currency, category, subcategory"
    )
    .eq("restaurant_id", restaurantId)
    .eq("is_available", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(200);

  if (!data?.length) {
    return "";
  }

  // Group by category so the prompt is scannable for the model.
  const byCategory = new Map<string, typeof data>();
  for (const row of data) {
    const cat = row.category || "أخرى";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(row);
  }

  const lines: string[] = [];
  for (const [cat, items] of byCategory) {
    lines.push(`# ${cat}`);
    for (const item of items) {
      const name = item.name_ar || item.name_en || "Unknown";
      const description = item.description_ar || item.description_en || "";
      const parts = [`- ${name}: ${item.price} ${item.currency}`];
      if (description) parts.push(description.slice(0, 120));
      lines.push(parts.join(" — "));
    }
  }
  return lines.join("\n");
}

async function getConversationContext(conversationId: string) {
  const { data } = await adminSupabaseClient
    .from("conversations")
    .select("customer_name, last_inbound_at, bot_paused, handler_mode, assigned_to")
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

      // Stage A (Change 1): fire every independent tenant/conversation read
      // in one batch. These used to serialize for ~800ms–1.5s before we even
      // reached RAG.
      const [
        inboundMessageRes,
        restaurantRes,
        aiAgentRes,
        conversation,
        history,
        agentInstructionsRaw,
        availableLabels,
      ] = await Promise.all([
        adminSupabaseClient
          .from("messages")
          .select("*")
          .eq("id", job.inbound_message_id)
          .single(),
        adminSupabaseClient
          .from("restaurants")
          .select("*")
          .eq("id", job.restaurant_id)
          .single(),
        adminSupabaseClient
          .from("ai_agents")
          .select("*")
          .eq("restaurant_id", job.restaurant_id)
          .eq("is_active", true)
          .single(),
        getConversationContext(job.conversation_id),
        getConversationHistory(job.conversation_id, 12),
        loadActiveAgentInstructions(job.restaurant_id),
        loadAvailableLabels(job.restaurant_id),
      ]);

      const inboundMessage = inboundMessageRes.data;
      const restaurant = restaurantRes.data;
      const aiAgent = aiAgentRes.data;
      if (!inboundMessage || !restaurant || !aiAgent) {
        throw new Error("Missing inbound message, restaurant, or ai agent");
      }
      const agentInstructions = agentInstructionsRaw.map((i) => ({
        title: i.title,
        body: i.body,
      }));

      // Restaurant-level kill switch: manager has paused AI globally via the
      // mobile app Profile/Overview. Complete the job silently so it is not retried.
      if (
        (restaurant as { ai_enabled?: boolean } | null)?.ai_enabled === false
      ) {
        console.warn(
          `[ai-reply] AI disabled for restaurant ${job.restaurant_id}. Skipping.`
        );
        await adminSupabaseClient
          .from("ai_reply_jobs")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            last_error: "ai_disabled",
          })
          .eq("id", job.id);
        continue;
      }

      // Bot pause: owner has stopped the AI for this conversation via the mobile app.
      // Skip generating/sending a reply but mark the job completed so it isn't retried.
      if (conversation?.bot_paused) {
        console.warn(
          `[ai-reply] Bot paused for conversation ${job.conversation_id}. Skipping.`
        );
        await adminSupabaseClient
          .from("ai_reply_jobs")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            last_error: "bot_paused",
          })
          .eq("id", job.id);
        continue;
      }

      // Claim-first gate: bot only runs when the conversation is explicitly
      // delegated to it. Covers the race where a job was queued before the
      // human-claim landed.
      const handlerMode = (conversation as { handler_mode?: string } | null)?.handler_mode;
      if (handlerMode && handlerMode !== "bot") {
        console.warn(
          `[ai-reply] handler_mode=${handlerMode} for conversation ${job.conversation_id}. Skipping.`
        );
        await adminSupabaseClient
          .from("ai_reply_jobs")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            last_error: `handler_mode_${handlerMode}`,
          })
          .eq("id", job.id);
        continue;
      }

      // Stage B (Change 1 + Change 4): RAG and the intent-gated menu fetch
      // run in parallel. RAG is the usual long pole (embed + vector search);
      // menu is skipped entirely when the customer clearly isn't asking about
      // it (Change 4), which typically saves 500–1500 prompt tokens and a DB
      // round-trip.
      const ragPromise = queryKnowledgeBase(
        job.restaurant_id,
        inboundMessage.content,
        history
      );
      const menuPromise = (async () => {
        const recentUserTurns = history
          .filter((msg) => msg.role === "user")
          .slice(-3)
          .map((msg) => msg.content)
          .join(" ");
        const expandedQuery = `${inboundMessage.content} ${recentUserTurns}`.trim();
        return shouldIncludeMenu(expandedQuery)
          ? getMenuContext(job.restaurant_id)
          : "";
      })();

      const [
        {
          context: ragContext,
          chunkCount: ragChunkCount,
          topScore: ragTopScore,
          strongHitCount: ragStrongHitCount,
        },
        menuContext,
      ] = await Promise.all([ragPromise, menuPromise]);
      const businessContext = buildBusinessSupportContext(restaurant);

      console.log(
        `[ai-reply] rag chunks=${ragChunkCount} topScore=${ragTopScore?.toFixed(
          3
        ) ?? "n/a"} strong=${ragStrongHitCount} threshold=${RAG_MATCH_THRESHOLD} menuInjected=${menuContext.length > 0}`
      );

      const userLanguage = detectLanguage(inboundMessage.content);
      let responseText: string;
      let reply: InteractiveReply;
      let aiUncertain = false;
      let botLabelIds: string[] = [];
      let botNewLabels: Array<{ name: string; color?: string }> = [];

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
          agentInstructions,
          availableLabels,
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
        reply = result.reply;
        aiUncertain = result.aiUncertain === true;
        botLabelIds = result.labelIds ?? [];
        botNewLabels = result.newLabels ?? [];
      } catch {
        responseText =
          userLanguage === "ar"
            ? "عذراً، حدث خطأ. يرجى المحاولة لاحقاً."
            : "Sorry, an error occurred. Please try again later.";
        reply = { type: "text", content: responseText };
      }

      // -----------------------------------------------------------------
      // Classification gates, in precedence order:
      //   1. Booking pre-gate  — a reservation is a workflow, not a
      //      knowledge gap. If the customer clearly wants to book, take
      //      the reservation path and let the bot send its reply. The
      //      human confirms the slot via the orders surface.
      //   2. Escalation gate   — (complaint, human handoff, knowledge gap)
      //      holds the reply and fans a push to agents.
      //   3. Send reply + soft reservation classifier for edge cases.
      // -----------------------------------------------------------------
      const customerPhoneForJob =
        (job.payload as { customerPhone?: string | null })?.customerPhone || "";

      const isBooking = isBookingRequest(inboundMessage.content);

      if (isBooking) {
        // Create the reservation order synchronously so the push fires
        // before we send the AI reply. Extract structured details via the
        // intent classifier; fall back to the raw inbound on any failure so
        // we never drop the booking.
        let details = inboundMessage.content;
        try {
          const classified = await classifyIntent(
            inboundMessage.content,
            responseText,
            history
          );
          if (classified.intent === "reservation" && classified.details.trim()) {
            details = classified.details;
          }
        } catch {
          /* non-fatal — use the raw message */
        }

        await createOrder({
          restaurantId: job.restaurant_id,
          conversationId: job.conversation_id,
          customerPhone: customerPhoneForJob,
          customerName: conversation?.customer_name ?? null,
          type: "reservation",
          details,
        });

        // Fall through — we DO send the AI reply. The bot's acknowledgement
        // ("تم استلام الطلب وسنؤكد الموعد") is exactly what the customer
        // needs to see; the owner gets the push to confirm the slot.
      } else {
        const escalation = classifyEscalation({
          customerMessage: inboundMessage.content,
          aiReply: responseText,
          ragChunkCount,
          ragTopScore,
          aiUncertain,
        });

        if (escalation.shouldEscalate) {
          await createOrder({
            restaurantId: job.restaurant_id,
            conversationId: job.conversation_id,
            customerPhone: customerPhoneForJob,
            customerName: conversation?.customer_name ?? null,
            type: "escalation",
            details: inboundMessage.content,
            aiDraftReply: responseText,
            escalationReason: escalation.reason,
            priority:
              escalation.reason === "sensitive" ? "urgent" : "normal",
          });

          await adminSupabaseClient
            .from("ai_reply_jobs")
            .update({
              status: "completed",
              processed_at: new Date().toISOString(),
              last_error: `escalated:${escalation.reason}`,
            })
            .eq("id", job.id);

          processed += 1;
          continue;
        }

        // Non-booking, non-escalation: still run the soft reservation
        // classifier so we capture edge-case bookings the regex missed
        // (e.g. "ممكن تسجيلي لخميس القادم"). Fire-and-forget.
        classifyIntent(inboundMessage.content, responseText, history)
          .then(async ({ intent, details }) => {
            if (intent !== "reservation" || !details.trim()) return;
            await createOrder({
              restaurantId: job.restaurant_id,
              conversationId: job.conversation_id,
              customerPhone: customerPhoneForJob,
              customerName: conversation?.customer_name ?? null,
              type: intent,
              details,
            });
          })
          .catch(() => {
            /* non-fatal */
          });
      }

      const senderPhoneNumber =
        (job.payload as { senderPhoneNumber?: string | null })?.senderPhoneNumber ||
        restaurant.twilio_phone_number;
      const customerPhone = customerPhoneForJob;

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

      if (botLabelIds.length > 0 || botNewLabels.length > 0) {
        await applyBotSelectedLabels({
          conversationId: job.conversation_id,
          restaurantId: job.restaurant_id,
          labelIds: botLabelIds,
          newLabels: botNewLabels,
          existing: availableLabels,
        });
      }

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
