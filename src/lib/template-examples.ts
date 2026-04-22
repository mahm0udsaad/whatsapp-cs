/**
 * Curated library of WhatsApp template examples.
 *
 * Surfaced in the "new marketing campaign" flow: the user browses these cards,
 * clicks one, and lands on a fill-the-info page that pre-populates the
 * template editor. Identifiers in `variables` become `{{1}}`, `{{2}}`, ... in
 * the body that is later submitted to Twilio's Content API.
 *
 * ── Meta / WhatsApp Cloud API rules these presets must satisfy ──
 *   • Body ≤1024 chars, variables sequential {{1}}..{{n}}, never start/end a
 *     body, never appear consecutively with nothing between them.
 *   • Header text ≤60 chars, ≤1 variable; image header has no variables.
 *   • Footer ≤60 chars, no variables, no formatting.
 *   • Buttons: MAX 3 total AND a single KIND — either all QUICK_REPLY, or a
 *     call-to-action set (up to 2 URL + 1 PHONE_NUMBER). **Mixing QR with
 *     URL/PHONE is rejected by Meta.**
 *   • AUTHENTICATION category requires the `whatsapp/authentication` content
 *     type (OTP shape), NOT `whatsapp/card`. We don't ship AUTH presets here
 *     — this file only carries MARKETING / UTILITY templates.
 *
 * The `sampleValues` array is what Meta reviewers SEE during approval as the
 * realized message. Must be realistic filled-in text — passing raw parameter
 * names like "customer_name" triggers Meta rejection for unclear examples.
 */

import type { TemplateCategory, TemplateHeaderType } from "@/lib/types";

export interface TemplateExampleButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  title: string;
  url?: string;
  phone?: string;
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
  /** Only MARKETING or UTILITY — AUTHENTICATION uses a different content type. */
  category: Exclude<TemplateCategory, "AUTHENTICATION">;
  title: string;
  description: string;
  /** Human labels for {{1}}..{{n}} placeholders — used in the editor UI only. */
  variables: string[];
  /** Realistic sample values submitted to Twilio/Meta for approval review. */
  sampleValues: string[];
  language: string;
  preview: TemplateExamplePreview;
}

export const TEMPLATE_EXAMPLES: TemplateExample[] = [
  {
    slug: "promotion_discount",
    category: "MARKETING",
    title: "عرض خصم",
    description:
      "عرض محدود بالوقت لجذب العملاء القدامى ومكافأة المشتركين الحاليين.",
    variables: ["customer_name", "discount_percent", "promo_code"],
    sampleValues: ["أحمد", "٥٠", "SUMMER50"],
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
        { type: "QUICK_REPLY", title: "ذكّرني لاحقاً", id: "remind_later" },
      ],
    },
  },
  {
    slug: "welcome_back",
    category: "MARKETING",
    title: "ترحيب بعميل قديم",
    description:
      "رسالة ودية لاستعادة العملاء الذين لم يطلبوا منذ فترة مع حافز للعودة.",
    variables: ["customer_name", "bonus_offer"],
    sampleValues: ["سارة", "قهوة مجانية"],
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
    slug: "order_status_update",
    category: "UTILITY",
    title: "تحديث حالة الطلب",
    description:
      "إشعار شفاف بحالة الطلب (قيد التحضير، في الطريق، جاهز) مع رابط للتتبع.",
    variables: ["customer_name", "order_number", "status_text"],
    sampleValues: ["محمد", "A-1042", "في الطريق"],
    language: "ar",
    preview: {
      body_template:
        "مرحباً {{1}}، طلبك رقم {{2}} الآن {{3}}. شكراً لاختيارك لنا.",
      header_type: "text",
      header_text: "تحديث طلبك",
      // Single URL button — reuses body var {{2}} at the end of the URL,
      // which Meta allows.
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
    slug: "event_invite",
    category: "MARKETING",
    title: "دعوة لفعالية",
    description: "دعوة عملائك لحدث خاص أو افتتاح فرع جديد مع رابط الحجز.",
    variables: ["customer_name", "event_name", "event_date"],
    sampleValues: ["ليان", "افتتاح فرع الخبر", "٢٠٢٦/٠٥/٠٣"],
    language: "ar",
    preview: {
      body_template:
        "مرحباً {{1}}! يسعدنا دعوتك لحضور {{2}} بتاريخ {{3}}. المقاعد محدودة.",
      header_type: "image",
      image_prompt:
        "صورة احتفالية راقية، إضاءة دافئة، لقطة من داخل مطعم عصري جاهز لحدث خاص",
      footer_text: "احجز مكانك مبكراً لضمان الحضور.",
      // All-URL CTA set — no QUICK_REPLY mixed in (Meta rejects mixed kinds).
      buttons: [
        {
          type: "URL",
          title: "احجز الآن",
          url: "https://example.com/rsvp",
        },
        {
          type: "URL",
          title: "شاهد القائمة",
          url: "https://example.com/menu",
        },
      ],
    },
  },
  {
    slug: "feedback_request",
    category: "UTILITY",
    title: "طلب تقييم",
    description: "متابعة بعد الزيارة لجمع تقييم سريع بضغطة زر.",
    variables: ["customer_name", "visit_day"],
    sampleValues: ["خالد", "الخميس"],
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
    slug: "booking_reminder",
    category: "UTILITY",
    title: "تذكير بالحجز",
    description: "تذكير قبل موعد الحجز مع إمكانية التأكيد أو إلغاء الحجز.",
    variables: ["customer_name", "booking_time", "party_size"],
    sampleValues: ["نورة", "الجمعة ٨ مساءً", "٤"],
    language: "ar",
    preview: {
      body_template:
        "مرحباً {{1}}، نذكّرك بحجزك يوم {{2}} لعدد {{3}} أشخاص. نتطلع لاستقبالك.",
      header_type: "text",
      header_text: "تذكير بالحجز",
      buttons: [
        { type: "QUICK_REPLY", title: "مؤكد الحضور", id: "confirm_booking" },
        { type: "QUICK_REPLY", title: "إلغاء الحجز", id: "cancel_booking" },
      ],
    },
  },
];

export function findTemplateExample(slug: string): TemplateExample | undefined {
  return TEMPLATE_EXAMPLES.find((e) => e.slug === slug);
}
