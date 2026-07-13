/**
 * Pre-submit validation for WhatsApp template content.
 *
 * Every rule here mirrors a documented Meta/WhatsApp rejection cause. A
 * rejection costs the tenant another review round (minutes to 48 hours), so
 * anything we can catch before hitting Twilio is a direct UX win. Errors are
 * user-facing Arabic — both the mobile app and the dashboard surface them
 * verbatim.
 */

// Meta-documented length limits.
const BODY_MAX = 1024;
const HEADER_TEXT_MAX = 60;
const FOOTER_MAX = 60;
const BUTTON_TEXT_MAX = 25;

const VARIABLE_RE = /\{\{(\d+)\}\}/g;
// Non-global twin for .test() — a /g regex is stateful across calls.
const HAS_VARIABLE_RE = /\{\{\d+\}\}/;

export interface TemplateValidationInput {
  bodyTemplate: string;
  headerType?: "none" | "text" | "image" | string;
  headerText?: string | null;
  footerText?: string | null;
  buttons?: Array<Record<string, unknown>> | null;
  /** Declared variable labels ({{1}}..{{n}}). */
  variables?: string[] | null;
  /** Realistic sample values shown to Meta reviewers. */
  sampleValues?: string[] | null;
}

/** Returns null when valid; otherwise a user-facing Arabic error message. */
export function validateTemplateContent(
  input: TemplateValidationInput
): string | null {
  const body = input.bodyTemplate ?? "";
  const trimmed = body.trim();

  if (!trimmed) return "نص الرسالة مطلوب";
  if (body.length > BODY_MAX) {
    return `نص الرسالة أطول من الحد المسموح (${BODY_MAX} حرفاً)`;
  }

  // -- Variable placement rules -------------------------------------------
  const indices: number[] = [];
  for (const match of body.matchAll(VARIABLE_RE)) {
    indices.push(Number(match[1]));
  }

  if (indices.length > 0) {
    // Body cannot start or end with a variable (documented rejection cause).
    if (/^\s*\{\{\d+\}\}/.test(body)) {
      return "لا يمكن أن تبدأ الرسالة بمتغيّر — أضف نصاً قبله";
    }
    if (/\{\{\d+\}\}\s*$/.test(body)) {
      return "لا يمكن أن تنتهي الرسالة بمتغيّر — أضف نصاً بعده";
    }
    // Adjacent variables with nothing between them.
    if (/\}\}\s*\{\{/.test(body)) {
      return "لا يمكن وضع متغيّرين متجاورين — افصل بينهما بنص";
    }
    // Variables must be sequential starting from {{1}} with no gaps.
    const unique = Array.from(new Set(indices)).sort((a, b) => a - b);
    for (let i = 0; i < unique.length; i++) {
      if (unique[i] !== i + 1) {
        return "أرقام المتغيّرات يجب أن تكون متسلسلة تبدأ من {{1}} دون فجوات";
      }
    }
  }

  // Declared variables/samples must cover every placeholder in the body.
  const placeholderCount =
    indices.length > 0 ? Math.max(...indices) : 0;
  const declaredCount = input.variables?.length ?? 0;
  if (placeholderCount > declaredCount) {
    return "عدد المتغيّرات المعرّفة لا يطابق المتغيّرات المستخدمة في النص";
  }
  if (placeholderCount > 0) {
    const samples = input.sampleValues ?? [];
    for (let i = 0; i < placeholderCount; i++) {
      if (!samples[i]?.trim()) {
        return "أدخل قيمة واقعية لكل متغيّر — يراها مراجع واتساب أثناء الاعتماد";
      }
    }
  }

  // -- Header / footer ------------------------------------------------------
  if (input.headerType === "text") {
    const header = input.headerText?.trim() ?? "";
    if (!header) return "نص الرأس مطلوب عند اختيار رأس نصي";
    if (header.length > HEADER_TEXT_MAX) {
      return `نص الرأس أطول من الحد المسموح (${HEADER_TEXT_MAX} حرفاً)`;
    }
    if (HAS_VARIABLE_RE.test(header)) {
      return "لا يمكن استخدام متغيّرات في نص الرأس";
    }
  }

  const footer = input.footerText?.trim() ?? "";
  if (footer.length > FOOTER_MAX) {
    return `نص التذييل أطول من الحد المسموح (${FOOTER_MAX} حرفاً)`;
  }
  if (footer && HAS_VARIABLE_RE.test(footer)) {
    return "لا يمكن استخدام متغيّرات في التذييل";
  }

  // -- Buttons --------------------------------------------------------------
  for (const btn of input.buttons ?? []) {
    const text = String(btn.title ?? btn.text ?? "").trim();
    if (!text) return "نص الزر مطلوب";
    if (text.length > BUTTON_TEXT_MAX) {
      return `نص الزر «${text.slice(0, 20)}» أطول من الحد المسموح (${BUTTON_TEXT_MAX} حرفاً)`;
    }
  }

  return null;
}
