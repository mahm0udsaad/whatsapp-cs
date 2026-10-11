/**
 * Turn a failed WhatsApp send into something an agent can act on.
 *
 * The server stores Twilio's code as "Twilio error code: 63049". Meta's
 * refusals arrive with delivery_status "undelivered" (not "failed").
 */

export function isDeliveryFailure(status: string | null | undefined): boolean {
  return status === "failed" || status === "undelivered";
}

export function deliveryErrorCode(
  errorMessage: string | null | undefined
): string | null {
  return errorMessage?.match(/\b(\d{5})\b/)?.[1] ?? null;
}

const REASONS: Record<string, string> = {
  // Meta's per-user cap on marketing templates / low expected engagement.
  "63049":
    "واتساب لم يسلّم هذه الرسالة التسويقية لهذا العميل (حدّ الرسائل التسويقية). لا تُعد الإرسال الآن — جرّب بعد يوم، أو اطلب من العميل مراسلتكم أولاً.",
  "63016":
    "خارج نافذة الـ٢٤ ساعة. أرسل قالباً معتمداً لإعادة فتح المحادثة.",
  "63024": "الرقم غير صالح أو غير مسجّل في واتساب.",
  "63003": "الرقم غير صالح أو غير مسجّل في واتساب.",
  "63032": "واتساب قيّد التسليم لهذا العميل حالياً. جرّب لاحقاً.",
  "63018": "تم تجاوز حدّ الإرسال. انتظر قليلاً ثم أعد المحاولة.",
  "63051": "رقم واتساب الخاص بكم مقيّد من Meta. تحقق من حالة الحساب.",
  "63112": "حساب واتساب للأعمال معطّل من Meta. تحقق من حالة الحساب.",
};

/** Arabic explanation for a failed send, or null when the message is fine. */
export function deliveryFailureReason(
  status: string | null | undefined,
  errorMessage: string | null | undefined
): string | null {
  if (!isDeliveryFailure(status)) return null;
  const code = deliveryErrorCode(errorMessage);
  if (code && REASONS[code]) return REASONS[code];
  return code ? `لم تُسلَّم الرسالة (رمز ${code}).` : "لم تُسلَّم الرسالة.";
}
