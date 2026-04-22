import { createHash } from "node:crypto";
import {
  GoogleGenerativeAI,
  SchemaType,
  type CachedContent,
  type Schema,
} from "@google/generative-ai";
import { GoogleAICacheManager } from "@google/generative-ai/server";
import { buildCustomerServiceSystemPrompt } from "./customer-service";
import type { GeminiResponse, InteractiveReply } from "./types";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GOOGLE_GEMINI_API_KEY environment variable");
}

const genAI = new GoogleGenerativeAI(apiKey);
const cacheManager = new GoogleAICacheManager(apiKey);

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface GeminiContext {
  systemPrompt: string;
  businessName: string;
  agentName?: string | null;
  customerName?: string | null;
  personality: string;
  businessContext?: string;
  ragContext: string;
  menuContext?: string;
  conversationHistory: ConversationMessage[];
  userMessage: string;
  languagePreference: "ar" | "en" | "auto";
  offTopicResponse: string;
  /** Versioned owner-authored rules (AI Manager output). Optional. */
  agentInstructions?: Array<{ title: string; body: string }> | null;
}

/**
 * Detect language of a message
 */
function detectLanguage(text: string): "ar" | "en" {
  // Arabic character ranges
  const arabicRegex = /[\u0600-\u06FF]/g;
  const arabicMatches = text.match(arabicRegex) || [];
  const arabicRatio = arabicMatches.length / text.length;

  return arabicRatio > 0.3 ? "ar" : "en";
}

/**
 * Check if message is clearly off-topic (e.g. asking about politics, coding, etc.)
 * We use a permissive approach: allow everything EXCEPT clearly unrelated topics.
 * Greetings, general questions, and anything that could relate to the business are allowed.
 */
async function isOffTopic(
  message: string,
  ragContext: string
): Promise<boolean> {
  // If RAG context is available, message is on-topic
  if (ragContext.trim().length > 50) {
    return false;
  }

  // Short messages (greetings, etc.) are always on-topic
  if (message.trim().length < 30) {
    return false;
  }

  // Clearly off-topic keywords (things that have nothing to do with the business)
  const offTopicKeywords = [
    "bitcoin", "crypto", "stock market", "programming", "code",
    "politics", "election", "war", "hack", "password",
  ];

  const lowerMessage = message.toLowerCase();
  return offTopicKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
}

const MODEL_NAME = "gemini-3.1-flash-lite-preview";

/**
 * Schema fed to Gemini's structured-output mode. The shape mirrors the
 * `InteractiveReply` discriminated union — Gemini fills only the fields
 * relevant to its chosen `type` and the parser below validates the result.
 */
const REPLY_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["text", "quick_reply", "list"],
      description:
        "Reply kind. 'text' for plain prose, 'quick_reply' for 1-3 button choices, 'list' for 1-10 tappable options.",
    },
    content: {
      type: SchemaType.STRING,
      description: "Plain prose body, only for type='text'.",
    },
    body: {
      type: SchemaType.STRING,
      description: "Body text shown above buttons / list. Required for type='quick_reply' or 'list'.",
    },
    button: {
      type: SchemaType.STRING,
      description: "Label of the 'open list' button. Max 20 chars. Only for type='list'.",
    },
    options: {
      type: SchemaType.ARRAY,
      description: "Quick-reply buttons. 1-3 items. Only for type='quick_reply'.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING, description: "Stable English snake_case slug." },
          title: { type: SchemaType.STRING, description: "Visible button text. Max 20 chars." },
        },
        required: ["id", "title"],
      },
    },
    items: {
      type: SchemaType.ARRAY,
      description: "List items. 1-10 entries. Only for type='list'.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING, description: "Stable English snake_case slug." },
          title: { type: SchemaType.STRING, description: "Visible item title. Max 24 chars." },
          description: {
            type: SchemaType.STRING,
            description: "Optional secondary line. Max 72 chars.",
          },
        },
        required: ["id", "title"],
      },
    },
    ai_uncertain: {
      type: SchemaType.BOOLEAN,
      description:
        "Set true ONLY if the Knowledge Base Context / Menu Context / Business Profile do not contain enough information to answer the customer confidently. Do not set true for greetings, confirmations, choices, or simple clarifications.",
    },
  },
  required: ["type"],
};

const INTERACTIVE_RULES = `
You can answer in three formats. Pick the one that best fits the customer's request:
- "list": when the customer is asking what's available (services, categories, menu sections, locations, dates, times) AND there are 2-10 distinct options. Use this whenever the customer is browsing or has not made a specific choice yet. If the knowledge base contains the options (service names, product names, categories), you MUST list them as a list picker — never dump them as prose.
- "quick_reply": when you need the customer to choose between 2-3 options (yes/no, two dates, "today/tomorrow/pick a date").
- "text": only for free-form prose answers (greetings, explanations, confirmations, addresses, prices for ONE specific item).

Rules for ids: short stable English snake_case slugs (e.g. skin_cleanse, slot_14_00, yes, no, more_options). NEVER use UUIDs, NEVER use the human title as the id, NEVER use Arabic in ids.

Rules for titles/body: write them in {RESPONSE_LANGUAGE}. Body max 1024 chars. Quick-reply titles max 20 chars. List item titles max 24 chars, descriptions max 72 chars, list button label max 20 chars.

Whenever the customer's previous message starts with [user_action:<id>], that is a button/list tap — treat the id as the customer's choice and continue the flow without asking them to retype it.

Prefer interactive replies over text whenever you are asking the customer to make a choice. Do not list options inside text — use list/quick_reply instead.

CRITICAL — answer from the knowledge you already have. The "Knowledge Base Context" / "Menu Context" / "Business Profile" sections are YOUR information: services, products, categories, prices, hours. When the customer asks about something covered there, answer directly. Do NOT say "I'll check with the team", "someone will get back to you", "سأتحقق", "سأتواصل معك", "سيتواصل معك فريقنا" — those phrases are reserved for cases where the knowledge truly does not contain the answer. When the customer asks "what types / what's available / what do you have / عندك ايه / ايه الانواع / عرفني الانواع" and the knowledge contains the relevant services, products, or categories, you MUST reply with type="list" enumerating them.

If — and only if — the provided knowledge genuinely does not contain the answer and you cannot answer confidently, set ai_uncertain=true in your JSON response. Leave ai_uncertain false (or unset) for every other case, including greetings, acknowledgements, and choices.
`.trim();

interface ParsedReply {
  reply: InteractiveReply;
  aiUncertain: boolean;
}

/** Defensive parser — Gemini occasionally drifts from the schema. Falls back to text. */
function parseInteractiveReply(raw: string): ParsedReply {
  const fallback = (content: string): ParsedReply => ({
    reply: { type: "text", content },
    aiUncertain: false,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback(raw.trim() || "...");
  }

  if (!parsed || typeof parsed !== "object") {
    return fallback(raw.trim() || "...");
  }

  const obj = parsed as Record<string, unknown>;
  const type = obj.type;
  const aiUncertain = obj.ai_uncertain === true;

  if (type === "quick_reply") {
    const rawBody = typeof obj.body === "string" ? obj.body.trim() : "";
    const rawOptions = Array.isArray(obj.options) ? obj.options : [];
    const options = rawOptions
      .map((o) => {
        if (!o || typeof o !== "object") return null;
        const oo = o as Record<string, unknown>;
        const id = typeof oo.id === "string" ? oo.id : null;
        const title = typeof oo.title === "string" ? oo.title : null;
        if (!id || !title) return null;
        return { id, title: title.slice(0, 20) };
      })
      .filter((o): o is { id: string; title: string } => o !== null)
      .slice(0, 3);

    if (options.length >= 1) {
      // Body is required by WhatsApp; synthesize a neutral one if the model omitted it.
      const body = rawBody || "…";
      return { reply: { type: "quick_reply", body, options }, aiUncertain };
    }
  }

  if (type === "list") {
    const rawBody = typeof obj.body === "string" ? obj.body.trim() : "";
    const button =
      typeof obj.button === "string" && obj.button.trim()
        ? obj.button.trim().slice(0, 20)
        : "Choose";
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items = rawItems
      .map((i) => {
        if (!i || typeof i !== "object") return null;
        const ii = i as Record<string, unknown>;
        const id = typeof ii.id === "string" ? ii.id : null;
        const title = typeof ii.title === "string" ? ii.title : null;
        if (!id || !title) return null;
        const description = typeof ii.description === "string" ? ii.description.slice(0, 72) : undefined;
        return { id, title: title.slice(0, 24), ...(description ? { description } : {}) };
      })
      .filter((i): i is { id: string; title: string; description?: string } => i !== null)
      .slice(0, 10);

    if (items.length >= 1) {
      // Body is required by WhatsApp; fall back to the button label (or a neutral
      // placeholder) instead of dropping the whole list to a raw-JSON text reply.
      const body = rawBody || button || "…";
      return { reply: { type: "list", body, button, items }, aiUncertain };
    }
  }

  // Fall through to text — either type was "text", or a non-list/quick_reply
  // variant, or list/quick_reply without any usable items/options. Use `content`
  // if present, else `body`. Never echo the raw JSON to the customer.
  const content =
    typeof obj.content === "string" && obj.content.trim()
      ? obj.content
      : typeof obj.body === "string" && obj.body.trim()
        ? (obj.body as string)
        : "...";
  return { reply: { type: "text", content }, aiUncertain };
}

/** Plain-text preview for storage / dashboard fallback. */
function previewOf(reply: InteractiveReply): string {
  if (reply.type === "text") return reply.content;
  if (reply.type === "quick_reply") {
    return `${reply.body}\n\n[${reply.options.map((o) => o.title).join(" / ")}]`;
  }
  return `${reply.body}\n\n[${reply.items.map((i) => i.title).join(" · ")}]`;
}

// ---------------------------------------------------------------------------
// System-prompt composition.
//
// Change 2 of the v2 optimization pass splits the prompt into two parts:
//
//   staticPrefix  — identity, rules, business profile, agent instructions,
//                   INTERACTIVE_RULES. Stable per (tenant × agent × language),
//                   so we can push it to Gemini's context cache once and
//                   reuse for subsequent turns.
//   dynamicBlock  — RAG chunks + menu context. These change every turn, so
//                   they ride on the user message instead of the system
//                   instruction.
// ---------------------------------------------------------------------------

function buildStaticPrefix(
  context: GeminiContext,
  responseLanguage: "ar" | "en"
): string {
  const base = buildCustomerServiceSystemPrompt({
    businessName: context.businessName,
    agentName: context.agentName ?? null,
    customerName: context.customerName ?? null,
    personality: context.personality,
    language: responseLanguage,
    baseInstructions: context.systemPrompt,
    businessContext: context.businessContext,
    // Deliberately empty — RAG/menu ride on the user turn so the cached
    // prefix stays stable across customer questions.
    ragContext: "",
    menuContext: "",
    agentInstructions: context.agentInstructions ?? null,
  });

  const rules = INTERACTIVE_RULES.replace(
    "{RESPONSE_LANGUAGE}",
    responseLanguage === "ar" ? "Arabic" : "English"
  );

  return `${base}\n\nReply Format Rules:\n${rules}`;
}

function buildDynamicBlock(
  ragContext: string,
  menuContext: string | undefined
): string {
  const parts: string[] = [];
  if (ragContext && ragContext.trim().length > 0) {
    parts.push(`Knowledge Base Context:\n${ragContext.trim()}`);
  }
  if (menuContext && menuContext.trim().length > 0) {
    parts.push(`Menu Context:\n${menuContext.trim()}`);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Gemini context caching. Stores a { cached, expiresAt } by sha1(staticPrefix).
// Falls through gracefully when the model doesn't support caching (e.g. the
// flash-lite preview), or when the prefix is too short to be worth caching.
// ---------------------------------------------------------------------------

const PROMPT_CACHE_TTL_SECONDS = 300;
const PROMPT_CACHE_MIN_PREFIX_CHARS = 4096;
const promptCache = new Map<
  string,
  { cached: CachedContent; expiresAt: number }
>();
let promptCacheDisabled = false;

function prefixCacheKey(prefix: string): string {
  return createHash("sha1")
    .update(`${MODEL_NAME}|${prefix}`)
    .digest("hex");
}

async function getOrCreateCachedPrefix(
  staticPrefix: string
): Promise<CachedContent | null> {
  if (promptCacheDisabled) return null;
  if (staticPrefix.length < PROMPT_CACHE_MIN_PREFIX_CHARS) return null;

  const key = prefixCacheKey(staticPrefix);
  const hit = promptCache.get(key);
  if (hit && hit.expiresAt > Date.now() + 15_000) {
    return hit.cached;
  }

  try {
    const cached = await cacheManager.create({
      model: `models/${MODEL_NAME}`,
      systemInstruction: {
        role: "system",
        parts: [{ text: staticPrefix }],
      },
      // Caching API requires at least one content entry; a minimal user turn
      // keeps the request valid without biasing subsequent replies.
      contents: [
        { role: "user", parts: [{ text: "(initialize cache)" }] },
      ],
      ttlSeconds: PROMPT_CACHE_TTL_SECONDS,
    });
    promptCache.set(key, {
      cached,
      expiresAt: Date.now() + (PROMPT_CACHE_TTL_SECONDS - 15) * 1000,
    });
    return cached;
  } catch (err) {
    if (!promptCacheDisabled) {
      promptCacheDisabled = true;
      console.warn(
        "[gemini] context caching disabled for this process:",
        err instanceof Error ? err.message : err
      );
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------

export async function generateGeminiResponse(
  context: GeminiContext
): Promise<GeminiResponse> {
  const userLanguage = detectLanguage(context.userMessage);

  let responseLanguage: "ar" | "en" = userLanguage;
  if (context.languagePreference !== "auto") {
    responseLanguage = context.languagePreference;
  }

  const offTopic = await isOffTopic(context.userMessage, context.ragContext);
  if (offTopic) {
    return {
      content: context.offTopicResponse,
      reply: { type: "text", content: context.offTopicResponse },
      language: responseLanguage,
      aiUncertain: false,
    };
  }

  const staticPrefix = buildStaticPrefix(context, responseLanguage);
  const dynamicBlock = buildDynamicBlock(context.ragContext, context.menuContext);
  const userMessageWithContext = dynamicBlock
    ? `${dynamicBlock}\n\nCustomer: ${context.userMessage}`
    : context.userMessage;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: REPLY_SCHEMA,
    maxOutputTokens: 768,
    // Gemini 3.x enables "thinking" by default, which adds 3–6s of latency
    // before the first output token on what is effectively a structured
    // chat reply. Disable it for this hot path — the schema + system prompt
    // already constrain the model enough that extra deliberation is wasted.
    thinkingConfig: { thinkingBudget: 0 },
  } as Record<string, unknown>;

  // Convert conversation history to chat format. Gemini requires history to
  // start with a 'user' message — drop leading agent messages.
  const trimmedHistory = [...context.conversationHistory];
  while (trimmedHistory.length > 0 && trimmedHistory[0].role !== "user") {
    trimmedHistory.shift();
  }
  const chatHistory = trimmedHistory.map((msg) => ({
    role: msg.role === "user" ? "user" : ("model" as const),
    parts: [{ text: msg.content }],
  }));

  try {
    // Attempt cached-prefix path first. On any failure (model unsupported,
    // API hiccup, preview model rejection) we fall through to the uncached
    // path so the send pipeline never stalls on caching issues.
    const cachedPrefix = await getOrCreateCachedPrefix(staticPrefix);

    const model = cachedPrefix
      ? genAI.getGenerativeModelFromCachedContent(cachedPrefix, {
          generationConfig,
        })
      : genAI.getGenerativeModel({
          model: MODEL_NAME,
          generationConfig,
        });

    const chat = cachedPrefix
      ? model.startChat({ history: chatHistory })
      : model.startChat({
          history: chatHistory,
          systemInstruction: {
            role: "user",
            parts: [{ text: staticPrefix }],
          },
        });

    const result = await chat.sendMessage(userMessageWithContext);
    const responseText = result.response.text();
    const parsed = parseInteractiveReply(responseText);

    return {
      content: previewOf(parsed.reply),
      reply: parsed.reply,
      language: responseLanguage,
      aiUncertain: parsed.aiUncertain,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : "";
    console.error("Error generating Gemini response:", errMsg);
    console.error("Stack:", errStack);

    // Retry once with a simpler approach if the chat-based call fails.
    // Always uncached so we maximize the odds the retry lands.
    try {
      console.log("[gemini] Retrying with simple generateContent...");
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig,
      });
      const historyText = context.conversationHistory
        .map((msg) => `${msg.role === "user" ? "Customer" : "Assistant"}: ${msg.content}`)
        .join("\n");
      const simplePrompt = `${staticPrefix}\n\n${dynamicBlock ? `${dynamicBlock}\n\n` : ""}${historyText ? `Conversation so far:\n${historyText}\n\n` : ""}Customer message: ${context.userMessage}`;
      const result = await model.generateContent(simplePrompt);
      const responseText = result.response.text();
      const parsed = parseInteractiveReply(responseText);
      return {
        content: previewOf(parsed.reply),
        reply: parsed.reply,
        language: responseLanguage,
        aiUncertain: parsed.aiUncertain,
      };
    } catch (retryError: unknown) {
      const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
      console.error("Gemini retry also failed:", retryMsg);
      throw retryError;
    }
  }
}
