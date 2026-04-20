/**
 * Curated library of WhatsApp template examples.
 *
 * Surfaced in the "new marketing campaign" flow: the user browses these cards,
 * clicks one, and lands on a fill-the-info page that pre-populates the
 * template editor. Identifiers in `variables` become `{{1}}`, `{{2}}`, ... in
 * the body that is later submitted to Twilio's Content API.
 *
 * The shape intentionally mirrors the POST body accepted by
 * `/api/marketing/templates` so copying an example into the editor is a
 * straight structural mapping with no translation step.
 */

import type { TemplateCategory, TemplateHeaderType } from "@/lib/types";

export interface TemplateExampleButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";
  title: string;
  url?: string;
  phone?: string;
  code?: string;
  id?: string;
}

export interface TemplateExamplePreview {
  body_template: string;
  header_type: TemplateHeaderType;
  header_text?: string;
  /** Suggested prompt for the AI image generator when `header_type==='image'`. */
  image_prompt?: string;
  footer_text?: string;
  buttons?: TemplateExampleButton[];
}

export interface TemplateExample {
  slug: string;
  category: TemplateCategory;
  title: string;
  description: string;
  /** Named placeholder labels (e.g. ["customer_name", "discount_percent"]). */
  variables: string[];
  language: string; // "ar" | "en" — we ship both Arabic and English bases
  preview: TemplateExamplePreview;
}

export const TEMPLATE_EXAMPLES: TemplateExample[] = [
  {
    slug: "promotion-discount",
    category: "MARKETING",
    title: "عرض خصم",
    description:
      "عرض محدود بالوقت لجذب العملاء القدامى ومكافأة المشتركين الحاليين.",
    variables: ["customer_name", "discount_percent", "promo_code"],
    language: "ar",
    preview: {
      body_template:
        "مرحباً {{1}}! لدينا خصم {{2}}% خاص لك لفترة محدودة. استخدم الكود {{3}} عند الطلب.",
      header_type: "image",
      image_prompt:
        "صورة دعائية أنيقة لعرض خصم، ألوان دافئة، عناصر هوية مطعم عصرية",
      footer_text: "العرض ساري حتى نفاد الكمية.",
      buttons: [
        { type: "QUICK_REPLY", title: "اطلب الآن", id: "order_now" },
        { type: "QUICK_REPLY", title: "لاحقاً", id: "remind_later" },
      ],
    },
  },
  {
    slug: "welcome-back",
    category: "MARKETING",
    title: "ترحيب بعميل قديم",
    description:
      "رسالة ودية لاستعادة العملاء الذين لم يطلبوا منذ فترة مع حافز للعودة.",
    variables: ["customer_name", "bonus_offer"],
    language: "ar",
    preview: {
      body_template:
        "اشتقنا لك يا {{1}} 🤍 عودتك تسعدنا، وكمكافأة خاصة {{2}} في طلبك القادم.",
      header_type: "text",
      header_text: "عودة دافئة 🤍",
      footer_text: "صالح لمرة واحدة على أي طلب.",
      buttons: [
        { type: "QUICK_REPLY", title: "اطلب الآن", id: "order_now" },
        { type: "QUICK_REPLY", title: "شاهد القائمة", id: "view_menu" },
      ],
    },
  },
  {
    slug: "order-status-update",
    category: "UTILITY",
    title: "تحديث حالة الطلب",
    description:
      "إشعار شفاف بحالة الطلب (قيد التحضير، في الطريق، جاهز) مع رابط للتتبع.",
    variables: ["customer_name", "order_number", "status_text"],
    language: "ar",
    preview: {
      body_template:
        "مرحباً {{1}}، طلبك رقم {{2}} الآن {{3}}. شكراً لاختيارك لنا.",
      header_type: "text",
      header_text: "تحديث طلبك",
      buttons: [
        {
          type: "URL",
          title: "تتبع الطلب",
          url: "https://example.com/track/{{2}}",
        },
      ],
    },
  },
  {
    slug: "event-invite",
    category: "MARKETING",
    title: "دعوة لفعالية",
    description: "دعوة عملائك لحدث خاص أو افتتاح فرع جديد مع تاريخ الحجز.",
    variables: ["customer_name", "event_name", "event_date"],
    language: "ar",
    preview: {
      body_template:
        "مرحباً {{1}}! يسعدنا دعوتك لحضور {{2}} بتاريخ {{3}}. المقاعد محدودة.",
      header_type: "image",
      image_prompt:
        "صورة احتفالية راقية، إضاءة دافئة، لقطة من داخل مطعم عصري جاهز لحدث خاص",
      footer_text: "احجز مكانك مبكراً لضمان الحضور.",
      buttons: [
        {
          type: "URL",
          title: "احجز الآن",
          url: "https://example.com/rsvp",
        },
        { type: "QUICK_REPLY", title: "لاحقاً", id: "remind_later" },
      ],
    },
  },
  {
    slug: "feedback-request",
    category: "UTILITY",
    title: "طلب تقييم",
    description: "متابعة بعد الزيارة لجمع تقييم سريع بضغطة زر.",
    variables: ["customer_name", "visit_day"],
    language: "ar",
    preview: {
      body_template:
        "مرحباً {{1}}، نتمنى أن زيارتك لنا يوم {{2}} كانت ممتازة. رأيك يهمنا 🙏",
      header_type: "none",
      buttons: [
        { type: "QUICK_REPLY", title: "ممتاز 👌", id: "rating_5" },
        { type: "QUICK_REPLY", title: "جيد 🙂", id: "rating_4" },
        { type: "QUICK_REPLY", title: "يحتاج تحسين", id: "rating_low" },
      ],
    },
  },
  {
    slug: "otp-auth-code",
    category: "AUTHENTICATION",
    title: "رمز التحقق",
    description:
      "رمز تحقق لمرة واحدة لتأكيد تسجيل الدخول أو تأكيد الطلب — فئة AUTHENTICATION.",
    variables: ["auth_code"],
    language: "ar",
    preview: {
      body_template:
        "رمز التحقق الخاص بك هو {{1}}. لا تشاركه مع أي شخص. ينتهي خلال ١٠ دقائق.",
      header_type: "none",
      footer_text: "لم تطلب الرمز؟ تجاهل هذه الرسالة.",
      buttons: [
        {
          type: "COPY_CODE",
          title: "نسخ الرمز",
          code: "{{1}}",
        },
      ],
    },
  },
];

export function findTemplateExample(slug: string): TemplateExample | undefined {
  return TEMPLATE_EXAMPLES.find((e) => e.slug === slug);
}
