/**
 * Order intent extractor.
 *
 * Runs after an order (escalation or reservation) is created. Pulls the last
 * ~12 messages from the conversation and asks Gemini to extract a structured
 * context blob: what the customer wants, which booking/inquiry details they
 * already provided, what's still missing, a short Arabic summary, and a
 * suggested next action for the manager.
 *
 * The extracted blob is stored on `orders.extracted_intent` so the mobile
 * Approvals widget can render "ready-to-act" cards instead of forcing the
 * owner to scroll the raw conversation.
 *
 * Failure is always non-fatal — callers fire-and-forget. Column stays null.
 */
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const MODEL_NAME = "gemini-3.1-flash-lite-preview";

export type IntentKind =
  | "booking"
  | "complaint"
  | "question"
  | "refund"
  | "other";

export interface ExtractedIntent {
  kind: IntentKind;
  /** 1–2 sentence Arabic summary of what the customer wants. */
  summary: string;
  /** Fields the customer already supplied. All optional. */
  provided: {
    customer_name?: string;
    phone?: string;
    party_size?: number;
    date?: string;
    time?: string;
    notes?: string;
  };
  /** Human-readable labels of fields still missing (e.g. "التاريخ"). */
  missing: string[];
  /** Short Arabic recommendation for the manager (e.g. "أكدي الحجز مباشرة"). */
  suggested_action: string;
  /** True if there's enough info to act without asking further questions. */
  ready_to_act: boolean;
  /** ISO timestamp of when extraction ran. */
  extracted_at: string;
}

const INTENT_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    kind: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["booking", "complaint", "question", "refund", "other"],
    },
    summary: { type: SchemaType.STRING },
    provided: {
      type: SchemaType.OBJECT,
      properties: {
        customer_name: { type: SchemaType.STRING },
        phone: { type: SchemaType.STRING },
        party_size: { type: SchemaType.NUMBER },
        date: { type: SchemaType.STRING },
        time: { type: SchemaType.STRING },
        notes: { type: SchemaType.STRING },
      },
    },
    missing: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    suggested_action: { type: SchemaType.STRING },
    ready_to_act: { type: SchemaType.BOOLEAN },
  },
  required: [
    "kind",
    "summary",
    "provided",
    "missing",
    "suggested_action",
    "ready_to_act",
  ],
};

interface TurnRow {
  role: string | null;
  content: string | null;
}

async function fetchRecentMessages(conversationId: string): Promise<TurnRow[]> {
  const { data } = await adminSupabaseClient
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []).slice().reverse();
}

function renderTranscript(rows: TurnRow[], fallbackMessage: string): string {
  const lines = rows
    .filter((r) => r.content && r.content.trim().length > 0)
    .map((r) => {
      const who = r.role === "user" ? "Customer" : "Agent";
      return `${who}: ${r.content}`;
    });
  if (lines.length === 0) return `Customer: ${fallbackMessage}`;
  return lines.join("\n");
}

const PROMPT_HEADER = `You are an assistant that extracts structured booking/inquiry context from a WhatsApp customer-service conversation so a manager can decide what to do next. Output MUST match the JSON schema.

Rules:
- kind: "booking" if the customer wants to reserve/book; "complaint" if they are upset; "refund" if they want money back; "question" if they are asking for information; "other" otherwise.
- provided: ONLY include fields the customer actually gave. Omit unknown fields. Dates as YYYY-MM-DD when possible, times as HH:MM 24h.
- missing: ONLY list fields that are clearly required for the NEXT step and not yet provided. Use short Arabic labels like "التاريخ", "الوقت", "عدد الأشخاص", "الاسم", "رقم الهاتف". Empty array is valid.
- summary: 1–2 short Arabic sentences. No emojis.
- suggested_action: one short Arabic sentence telling the manager what to do. No emojis.
- ready_to_act: true ONLY if nothing in "missing" is blocking the next step.
- Never invent data. If the customer did not say it, do not include it.`;

/**
 * Run Gemini extraction. Returns null on any failure.
 */
export async function extractOrderIntent(args: {
  conversationId: string;
  fallbackMessage: string;
  escalationReason?: string | null;
}): Promise<ExtractedIntent | null> {
  if (!genAI) return null;
  try {
    const rows = await fetchRecentMessages(args.conversationId);
    const transcript = renderTranscript(rows, args.fallbackMessage);

    const reasonLine = args.escalationReason
      ? `\nEscalation reason code: ${args.escalationReason}`
      : "";

    const prompt = `${PROMPT_HEADER}\n\nCONVERSATION:\n${transcript}${reasonLine}\n\nReturn JSON only.`;

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: INTENT_SCHEMA,
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      } as Record<string, unknown>,
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const parsed = JSON.parse(raw) as Omit<ExtractedIntent, "extracted_at">;

    return { ...parsed, extracted_at: new Date().toISOString() };
  } catch (err) {
    console.warn(
      "[extract-order-intent] extraction failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Convenience helper used by createOrder: extract + UPDATE in one call.
 * Fire-and-forget. Never throws.
 */
export async function extractAndStoreOrderIntent(args: {
  orderId: string;
  conversationId: string;
  fallbackMessage: string;
  escalationReason?: string | null;
}): Promise<void> {
  const intent = await extractOrderIntent({
    conversationId: args.conversationId,
    fallbackMessage: args.fallbackMessage,
    escalationReason: args.escalationReason,
  });
  if (!intent) return;
  try {
    await adminSupabaseClient
      .from("orders")
      .update({ extracted_intent: intent })
      .eq("id", args.orderId);
  } catch (err) {
    console.warn(
      "[extract-order-intent] UPDATE failed:",
      err instanceof Error ? err.message : err
    );
  }
}
