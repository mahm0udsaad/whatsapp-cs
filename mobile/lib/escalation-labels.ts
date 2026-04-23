// Human-friendly Arabic labels + tone for the machine-readable
// `orders.escalation_reason` codes. These codes are emitted by
// src/lib/escalation-classifier.ts — keep the keys in sync with that file.
// Unknown codes fall back to a neutral "تصعيد" so the UI never shows raw
// snake_case to the owner.

export type EscalationTone = "info" | "warn" | "danger";

interface Entry {
  label: string;
  tone: EscalationTone;
}

const DICT: Record<string, Entry> = {
  // Emitted by the classifier today
  customer_asked_human: { label: "العميل طلب التحدث مع موظف", tone: "danger" },
  sensitive: { label: "محادثة حساسة تحتاج مراجعتكِ", tone: "danger" },
  knowledge_gap: {
    label: "البوت لا يعرف الإجابة ويحتاج مساعدتكِ",
    tone: "warn",
  },
  // Emitted by other escalation paths (SLA sweep, AI orchestrator direct calls)
  sla_breach: { label: "الرد تأخر أكثر من اللازم", tone: "warn" },
  // Legacy / alternate synonyms kept for backwards compat with historical rows.
  human_request: { label: "العميل طلب التحدث مع موظف", tone: "danger" },
  complaint: { label: "شكوى من العميل", tone: "danger" },
  refund_request: { label: "طلب استرداد مبلغ", tone: "danger" },
  policy_required: { label: "يحتاج قراراً من الإدارة", tone: "info" },
  safety: { label: "محتوى حساس", tone: "danger" },
};

export function escalationReasonLabel(code: string | null | undefined): string {
  if (!code) return "تصعيد";
  const hit = DICT[code];
  if (hit) return hit.label;
  // Fallback: show the code in a readable form (snake_case → spaces).
  return code.replace(/_/g, " ");
}

export function escalationReasonTone(
  code: string | null | undefined
): EscalationTone {
  if (!code) return "info";
  return DICT[code]?.tone ?? "info";
}

export const escalationToneClasses: Record<
  EscalationTone,
  { bg: string; fg: string }
> = {
  info: { bg: "bg-indigo-50", fg: "text-indigo-900" },
  warn: { bg: "bg-amber-50", fg: "text-amber-900" },
  danger: { bg: "bg-red-50", fg: "text-red-900" },
};
