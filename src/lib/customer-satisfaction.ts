import crypto from "node:crypto";
import {
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from "@google/generative-ai";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { calculateSatisfactionMetrics } from "@/lib/customer-satisfaction-metrics";
import type {
  CustomerSatisfactionAnalysis,
  SatisfactionAnalysisResponse,
  SatisfactionEvidence,
  SatisfactionMetrics,
  SatisfactionRiskLevel,
  SatisfactionSentiment,
} from "@/lib/customer-satisfaction-types";

const MODEL =
  process.env.CUSTOMER_SATISFACTION_MODEL ??
  "gemini-3.1-flash-lite-preview";
const PROMPT_VERSION = "conversation-satisfaction-v1";
const MAX_MESSAGES = 100;

interface ConversationRow {
  id: string;
  restaurant_id: string;
  customer_name: string | null;
  customer_phone: string;
}

interface MessageRow {
  id: string;
  role: "customer" | "agent" | "system";
  content: string | null;
  message_type: string | null;
  metadata: Record<string, unknown> | null;
  sender_team_member_id: string | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  type: "reservation" | "escalation";
  status: string;
  details: string;
  escalation_reason: string | null;
  priority: string | null;
  extracted_intent: Record<string, unknown> | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface NehgzEventRow {
  event_id: string;
  event: string;
  occurred_at: string | null;
  received_at: string;
  payload: Record<string, unknown>;
}

interface ModelAnalysis {
  score: number;
  sentiment: SatisfactionSentiment;
  risk_level: SatisfactionRiskLevel;
  confidence: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  unanswered_questions: string[];
  recommended_actions: string[];
  evidence: SatisfactionEvidence[];
}

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    score: { type: SchemaType.NUMBER },
    sentiment: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["positive", "neutral", "negative", "mixed"],
    },
    risk_level: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["low", "medium", "high"],
    },
    confidence: { type: SchemaType.NUMBER },
    summary: { type: SchemaType.STRING },
    strengths: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    concerns: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    unanswered_questions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    recommended_actions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    evidence: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          source_type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["message", "order", "nehgz_event", "metric"],
          },
          source_id: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
        },
        required: ["source_type", "source_id", "description"],
      },
    },
  },
  required: [
    "score",
    "sentiment",
    "risk_level",
    "confidence",
    "summary",
    "strengths",
    "concerns",
    "unanswered_questions",
    "recommended_actions",
    "evidence",
  ],
};

function clampScore(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function stringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function phoneDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function nehgzCustomerPhone(payload: Record<string, unknown>): string {
  const data = payload.data;
  if (!data || typeof data !== "object") return "";
  const customer = (data as Record<string, unknown>).customer;
  if (!customer || typeof customer !== "object") return "";
  return phoneDigits((customer as Record<string, unknown>).phone);
}

function renderPrompt(
  conversation: ConversationRow,
  messages: MessageRow[],
  orders: OrderRow[],
  events: NehgzEventRow[],
  metrics: SatisfactionMetrics
): string {
  const transcript = messages
    .map((message) => {
      const actor =
        message.role === "customer"
          ? "CUSTOMER"
          : message.role === "agent"
            ? message.sender_team_member_id
              ? "HUMAN_AGENT"
              : "BOT_OR_BUSINESS"
            : "SYSTEM";
      const content = (message.content ?? "").replace(/\s+/g, " ").slice(0, 700);
      return `[message:${message.id}] ${actor} ${message.created_at}: ${content}`;
    })
    .join("\n");

  const orderEvidence = orders
    .map(
      (order) =>
        `[order:${order.id}] type=${order.type}; status=${order.status}; priority=${order.priority ?? "normal"}; reason=${order.escalation_reason ?? "none"}; details=${order.details.slice(0, 500)}; extracted=${JSON.stringify(order.extracted_intent ?? {}).slice(0, 700)}`
    )
    .join("\n");

  const eventEvidence = events
    .map(
      (event) =>
        `[nehgz_event:${event.event_id}] ${event.event} at ${event.occurred_at ?? event.received_at}; data=${JSON.stringify(event.payload.data ?? {}).slice(0, 700)}`
    )
    .join("\n");

  return `You analyze one restaurant customer's WhatsApp service experience for a manager. Return Arabic text and match the JSON schema exactly.

CUSTOMER
Name: ${conversation.customer_name ?? "unknown"}
Phone: ${conversation.customer_phone}

STRICT RULES
- Only CUSTOMER messages are evidence of customer sentiment. Never treat a bot, employee, or business message as the customer's opinion.
- A recent analysis time is not evidence of satisfaction or recent customer activity.
- If the customer never expresses satisfaction or dissatisfaction, use neutral sentiment. Do not assume silence means satisfaction.
- Treat pending complaints, refunds, cancellations, unanswered questions, and long response times as risks when supported by evidence.
- Payment pending by itself is not dissatisfaction.
- Do not invent booking outcomes, employee actions, or customer intent.
- Score is customer health from 0 to 100. 0-44 is high risk, 45-69 medium risk, 70-100 low risk.
- confidence reflects evidence quality, not how certain the wording sounds.
- Every important concern or recommendation must be supported by an evidence entry using an exact source ID below. For computed metrics use source_type=metric and source_id=conversation_metrics.
- Keep summary to 2-3 short Arabic sentences. Each list should contain concise Arabic items.

COMPUTED METRICS
[metric:conversation_metrics] ${JSON.stringify(metrics)}

WHATSAPP TRANSCRIPT (oldest to newest)
${transcript || "No messages"}

REQUESTS / ESCALATIONS
${orderEvidence || "No orders"}

NEHGZ BOOKING / PAYMENT EVENTS
${eventEvidence || "No matching events"}`;
}

function sanitizeModelAnalysis(
  raw: ModelAnalysis,
  allowedEvidenceIds: Set<string>,
  metrics: SatisfactionMetrics
): ModelAnalysis {
  let score = clampScore(raw.score);
  let risk: SatisfactionRiskLevel = ["low", "medium", "high"].includes(
    raw.risk_level
  )
    ? raw.risk_level
    : score < 45
      ? "high"
      : score < 70
        ? "medium"
        : "low";

  if (metrics.pending_escalations > 0) {
    score = Math.min(score, 69);
    if (risk === "low") risk = "medium";
  }
  if (metrics.last_customer_message_unanswered && risk === "low") {
    risk = "medium";
  }
  if (score < 45) risk = "high";
  else if (score < 70 && risk === "low") risk = "medium";

  const sentiment: SatisfactionSentiment = [
    "positive",
    "neutral",
    "negative",
    "mixed",
  ].includes(raw.sentiment)
    ? raw.sentiment
    : "neutral";

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence
        .filter(
          (item): item is SatisfactionEvidence =>
            !!item &&
            typeof item.source_id === "string" &&
            allowedEvidenceIds.has(item.source_id) &&
            typeof item.description === "string"
        )
        .map((item) => ({
          source_type: item.source_type,
          source_id: item.source_id,
          description: item.description.trim(),
        }))
        .filter((item) => item.description.length > 0)
        .slice(0, 12)
    : [];

  return {
    score,
    sentiment,
    risk_level: risk,
    confidence: Math.min(
      clampScore(raw.confidence),
      metrics.customer_messages < 3 ? 60 : 100
    ),
    summary:
      typeof raw.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "لا توجد أدلة كافية لتقييم رضا العميل بدقة.",
    strengths: stringArray(raw.strengths),
    concerns: stringArray(raw.concerns),
    unanswered_questions: stringArray(raw.unanswered_questions),
    recommended_actions: stringArray(raw.recommended_actions),
    evidence,
  };
}

export async function analyzeConversationSatisfaction(params: {
  conversation: ConversationRow;
  userId: string;
  force?: boolean;
}): Promise<SatisfactionAnalysisResponse> {
  const { conversation } = params;

  const [
    messagesResult,
    messageCountResult,
    ordersResult,
    slaResult,
    nehgzEventsResult,
    whatsappResult,
    hubResult,
    previousResult,
  ] = await Promise.all([
    adminSupabaseClient
      .from("messages")
      .select(
        "id, role, content, message_type, metadata, sender_team_member_id, created_at"
      )
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES),
    adminSupabaseClient
      .from("messages")
      .select("id", { head: true, count: "exact" })
      .eq("conversation_id", conversation.id),
    adminSupabaseClient
      .from("orders")
      .select(
        "id, type, status, details, escalation_reason, priority, extracted_intent, assigned_to, created_at, updated_at"
      )
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20),
    adminSupabaseClient
      .from("sla_notification_log")
      .select("id", { head: true, count: "exact" })
      .eq("conversation_id", conversation.id),
    adminSupabaseClient
      .from("nehgz_webhook_events")
      .select("event_id, event, occurred_at, received_at, payload")
      .eq("restaurant_id", conversation.restaurant_id)
      .order("received_at", { ascending: false })
      .limit(300),
    adminSupabaseClient
      .from("whatsapp_numbers")
      .select("assignment_status, onboarding_status")
      .eq("restaurant_id", conversation.restaurant_id)
      .eq("is_primary", true)
      .maybeSingle(),
    adminSupabaseClient
      .from("nehgz_hub_connections")
      .select("paired_at")
      .eq("restaurant_id", conversation.restaurant_id)
      .maybeSingle(),
    adminSupabaseClient
      .from("customer_satisfaction_analyses")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (messagesResult.error) throw messagesResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const messages = ((messagesResult.data ?? []) as MessageRow[]).toReversed();
  if (messages.length === 0) {
    throw new Error("لا توجد رسائل كافية لتحليل هذه المحادثة.");
  }
  const orders = (ordersResult.data ?? []) as OrderRow[];
  const customerDigits = phoneDigits(conversation.customer_phone);
  const nehgzEvents = ((nehgzEventsResult.data ?? []) as NehgzEventRow[])
    .filter((event) => nehgzCustomerPhone(event.payload) === customerDigits)
    .slice(0, 30)
    .toReversed();
  const sourceMessageCount = messageCountResult.count ?? messages.length;
  const previous = previousResult.data as CustomerSatisfactionAnalysis | null;
  const newMessageCount = previous
    ? Math.max(0, sourceMessageCount - previous.source_message_count)
    : sourceMessageCount;
  const latestMessage = messages[messages.length - 1];
  const latestOrderUpdate = orders.reduce<string | null>((latest, order) => {
    if (!latest || order.updated_at > latest) return order.updated_at;
    return latest;
  }, null);
  const latestEvent = nehgzEvents[nehgzEvents.length - 1] ?? null;
  const inputHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        conversationId: conversation.id,
        sourceMessageCount,
        latestMessageId: latestMessage.id,
        latestMessageAt: latestMessage.created_at,
        latestOrderUpdate,
        latestEventId: latestEvent?.event_id ?? null,
        latestEventAt: latestEvent?.received_at ?? null,
        promptVersion: PROMPT_VERSION,
      })
    )
    .digest("hex");

  if (previous && previous.input_hash === inputHash && !params.force) {
    return {
      analysis: previous,
      cached: true,
      has_new_messages: false,
      new_messages_since_analysis: 0,
    };
  }

  const metrics = calculateSatisfactionMetrics(
    messages,
    orders,
    nehgzEvents,
    slaResult.count ?? 0
  );
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("خدمة تحليل رضا العملاء غير مهيأة حالياً.");

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1600,
      thinkingConfig: { thinkingBudget: 0 },
    } as Record<string, unknown>,
  });
  const result = await model.generateContent(
    renderPrompt(conversation, messages, orders, nehgzEvents, metrics)
  );
  const raw = JSON.parse(result.response.text().trim()) as ModelAnalysis;
  const allowedEvidenceIds = new Set<string>([
    "conversation_metrics",
    ...messages.map((message) => message.id),
    ...orders.map((order) => order.id),
    ...nehgzEvents.map((event) => event.event_id),
  ]);
  const analysis = sanitizeModelAnalysis(raw, allowedEvidenceIds, metrics);
  const whatsappStatus = whatsappResult.data
    ? String(
        whatsappResult.data.onboarding_status ??
          whatsappResult.data.assignment_status ??
          "unknown"
      )
    : "not_connected";
  const nehgzStatus = hubResult.data ? "paired" : "not_paired";

  const { data: inserted, error: insertError } = await adminSupabaseClient
    .from("customer_satisfaction_analyses")
    .insert({
      restaurant_id: conversation.restaurant_id,
      conversation_id: conversation.id,
      customer_phone: conversation.customer_phone,
      customer_name: conversation.customer_name,
      ...analysis,
      metrics,
      analysis_mode:
        previous && newMessageCount === 0 ? "reanalysis" : "fresh",
      source_message_count: sourceMessageCount,
      new_message_count: newMessageCount,
      latest_message_at: latestMessage.created_at,
      whatsapp_status: whatsappStatus,
      nehgz_status: nehgzStatus,
      input_hash: inputHash,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      created_by_user_id: params.userId,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "تعذّر حفظ نتيجة التحليل.");
  }

  return {
    analysis: inserted as CustomerSatisfactionAnalysis,
    cached: false,
    has_new_messages: newMessageCount > 0,
    new_messages_since_analysis: newMessageCount,
  };
}
