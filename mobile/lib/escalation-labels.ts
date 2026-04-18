// Human-friendly Arabic labels + tone for the machine-readable
// `orders.escalation_reason` codes. Keep this list in sync with whatever the
// AI orchestrator / ai-reply-jobs emits. Unknown codes fall back to a neutral
// "تصعيد" so the UI never shows raw snake_case to the owner.

export type EscalationTone = "info" | "warn" | "danger";

interface Entry {
  label: string;
  tone: EscalationTone;
}

const DICT: Record<string, Entry> = {
  knowledge_gap: { label: "فجوة معرفية", tone: "warn" },
  human_request: { label: "طلب التحدث مع موظف", tone: "danger" },
  complaint: { label: "شكوى", tone: "danger" },
  refund_request: { label: "طلب استرداد", tone: "danger" },
  sla_breach: { label: "تأخر الرد", tone: "warn" },
  policy_required: { label: "يحتاج قرار إداري", tone: "info" },
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
