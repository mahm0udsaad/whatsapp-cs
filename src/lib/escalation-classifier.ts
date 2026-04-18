/**
 * Deterministic, zero-dependency classifier that decides whether a generated
 * AI reply should be held back and escalated to a human agent instead of
 * being sent to the customer.
 *
 * Runs locally (no LLM call) so it is cheap, fast, and unit-testable. The
 * rules are intentionally simple and ordered — first match wins.
 *
 * Escalation reasons, in precedence order:
 *   1. knowledge_gap        — the AI itself punted with the "I'll check with
 *                             the team" phrase (Arabic or English), OR the
 *                             RAG returned zero chunks and the customer asked
 *                             a non-trivial question.
 *   2. sensitive            — complaint / refund / cancellation wording.
 *   3. customer_asked_human — customer explicitly asked for a human / manager.
 *   4. (none)               — send the AI reply.
 */

export interface EscalationSignal {
  customerMessage: string;
  aiReply: string;
  ragChunkCount: number;
  /** Optional — pass the top cosine score from RAG if known, else leave null. */
  ragTopScore?: number | null;
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
  /أبغى\s+(أكلم|اكلم)|كلميني|أبي\s+(إنسان|انسان|بشر)|موظفة|مدير(ة)?|محامي/u,
  /\bspeak\s+to\s+(a\s+)?(human|agent|manager|person|real)\b/i,
  /\btalk\s+to\s+(a\s+)?(human|agent|manager|person|real)\b/i,
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

  // 1a. AI itself said "I'll check with the team".
  if (matchesAny(reply, PUNT_PATTERNS)) {
    return { shouldEscalate: true, reason: "knowledge_gap" };
  }

  // 2. Sensitive content (complaint/refund/etc.). Check BEFORE the knowledge
  //    gap so a long complaint with zero RAG chunks still gets the right tag.
  if (matchesAny(customer, SENSITIVE_PATTERNS)) {
    return { shouldEscalate: true, reason: "sensitive" };
  }

  // 3. Explicit human handoff request.
  if (matchesAny(customer, HUMAN_HANDOFF_PATTERNS)) {
    return { shouldEscalate: true, reason: "customer_asked_human" };
  }

  // 1b. No RAG match + non-trivial customer question = knowledge gap.
  if (
    input.ragChunkCount === 0 &&
    customer.trim().length >= MIN_CUSTOMER_MESSAGE_LENGTH_FOR_GAP
  ) {
    return { shouldEscalate: true, reason: "knowledge_gap" };
  }

  return { shouldEscalate: false, reason: null };
}
