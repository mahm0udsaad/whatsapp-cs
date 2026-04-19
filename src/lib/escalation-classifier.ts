/**
 * Deterministic, zero-dependency classifier that decides whether a generated
 * AI reply should be held back and escalated to a human agent instead of
 * being sent to the customer.
 *
 * Runs locally (no LLM call) so it is cheap, fast, and unit-testable. The
 * rules are intentionally simple and ordered — first match wins.
 *
 * Escalation reasons, in precedence order (user-explicit intent beats
 * model-side uncertainty — if the customer literally says "I want to talk
 * to the manager", the reason is `customer_asked_human` regardless of
 * whether RAG was weak or the model flagged itself uncertain):
 *
 *   1. sensitive            — complaint / refund / cancellation wording.
 *   2. customer_asked_human — customer explicitly asked for a human / manager.
 *   3. knowledge_gap        — the AI self-reported uncertainty (aiUncertain
 *                             from the structured output), OR punted with
 *                             the "I'll check with the team" phrase (Arabic
 *                             or English), OR the RAG returned zero chunks
 *                             and the customer asked a non-trivial question,
 *                             OR RAG returned only weak hits (topScore below
 *                             RAG_MATCH_THRESHOLD) on a non-trivial question.
 *   4. (none)               — send the AI reply.
 */

// Mirror of rag.ts's RAG_MATCH_THRESHOLD. Duplicated on purpose so the
// classifier remains a zero-dependency, unit-testable module (importing
// from rag.ts pulls in supabase admin, which hard-fails without env vars).
const RAG_MATCH_THRESHOLD_FOR_CLASSIFIER = (() => {
  const env = Number.parseFloat(process.env.RAG_MATCH_THRESHOLD ?? "");
  return Number.isFinite(env) && env > 0 && env < 1 ? env : 0.55;
})();

export interface EscalationSignal {
  customerMessage: string;
  aiReply: string;
  ragChunkCount: number;
  /** Optional — the top cosine similarity from RAG. Pass null when unknown. */
  ragTopScore?: number | null;
  /** Optional — the model's self-reported uncertainty flag (Change 6). */
  aiUncertain?: boolean;
}

export type EscalationReason =
  | "knowledge_gap"
  | "sensitive"
  | "customer_asked_human";

export interface EscalationResult {
  shouldEscalate: boolean;
  reason: EscalationReason | null;
}

// ---------------------------------------------------------------------------
// Pattern catalog. Kept in one place so tests can exercise each branch.
// ---------------------------------------------------------------------------

const PUNT_PATTERNS: RegExp[] = [
  /سأتحقق\s+من\s+ذلك\s+مع\s+فريق/u,
  /سيتواصل\s+معك\s+فريق/u,
  /i['’]?ll\s+check\s+(on\s+)?that\s+with\s+(our|the)\s+team/i,
  /our\s+team\s+will\s+get\s+back\s+to\s+you/i,
];

const SENSITIVE_PATTERNS: RegExp[] = [
  /شكوى|مشكلة|غلط|خطأ|رفض|استرجاع|استرداد/u,
  /\b(complaint|refund|wrong order|not happy|disappointed)\b/i,
];

const HUMAN_HANDOFF_PATTERNS: RegExp[] = [
  // Saudi / Gulf dialect ("أبغى", "أبي")
  /أبغى\s+(أكلم|اكلم)|كلميني|أبي\s+(إنسان|انسان|بشر)|موظفة|مدير(ة)?|محامي/u,
  // Egyptian / Levantine dialect ("عايز" / "عاوز" / "بدي")
  // Covers: "عايز اتواصل مع المدير", "عاوز أكلم حد", "بدي موظف", etc.
  /(عايز|عاوز|بدي|بدنا|ابغى|ابي)\s+(اتواصل|اكلم|أكلم|أحكي|احكي|كلام|حد|واحد|موظف|موظفة|مدير(ة)?|مسؤول|بني\s*آدم)/u,
  // Direct mentions of a human role anywhere in the message.
  /\b(مدير|مديره|مديرة|مسؤول|مسؤوله|مسؤولة|موظف|موظفه|موظفة)\b/u,
  // English
  /\bspeak\s+to\s+(a\s+)?(human|agent|manager|person|real)\b/i,
  /\btalk\s+to\s+(a\s+)?(human|agent|manager|person|real)\b/i,
  /\b(contact|reach)\s+(a\s+)?(human|agent|manager)\b/i,
];

const MIN_CUSTOMER_MESSAGE_LENGTH_FOR_GAP = 15;

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function classifyEscalation(input: EscalationSignal): EscalationResult {
  const customer = input.customerMessage ?? "";
  const reply = input.aiReply ?? "";
  const customerIsNonTrivial =
    customer.trim().length >= MIN_CUSTOMER_MESSAGE_LENGTH_FOR_GAP;

  // 1. Sensitive content (complaint/refund/cancellation). User intent is the
  //    strongest signal — if the customer is upset we route to a human even
  //    when RAG could technically answer.
  if (matchesAny(customer, SENSITIVE_PATTERNS)) {
    return { shouldEscalate: true, reason: "sensitive" };
  }

  // 2. Explicit human handoff request. Also an explicit user intent — it
  //    MUST win over any AI-side uncertainty flag so the manager sees the
  //    reason as "customer asked for a human", not "knowledge gap".
  if (matchesAny(customer, HUMAN_HANDOFF_PATTERNS)) {
    return { shouldEscalate: true, reason: "customer_asked_human" };
  }

  // 3a. Model self-reported uncertainty via the structured-output flag.
  //     Narrow: only escalates when the customer asked something substantive,
  //     so a casual "ok" with aiUncertain=true doesn't bounce to a human.
  if (input.aiUncertain === true && customerIsNonTrivial) {
    return { shouldEscalate: true, reason: "knowledge_gap" };
  }

  // 3b. AI itself said "I'll check with the team".
  if (matchesAny(reply, PUNT_PATTERNS)) {
    return { shouldEscalate: true, reason: "knowledge_gap" };
  }

  // 3c. No RAG match + non-trivial customer question = knowledge gap.
  if (input.ragChunkCount === 0 && customerIsNonTrivial) {
    return { shouldEscalate: true, reason: "knowledge_gap" };
  }

  // 3d. Weak-hit gap: chunks came back but none were above the match
  //     threshold. This happens when the RPC is called with a lower floor
  //     (legacy callers) or when the top score sits in a grey zone. We only
  //     trust RAG as grounding when topScore ≥ threshold.
  if (
    typeof input.ragTopScore === "number" &&
    input.ragChunkCount > 0 &&
    input.ragTopScore < RAG_MATCH_THRESHOLD_FOR_CLASSIFIER &&
    customerIsNonTrivial
  ) {
    return { shouldEscalate: true, reason: "knowledge_gap" };
  }

  return { shouldEscalate: false, reason: null };
}
