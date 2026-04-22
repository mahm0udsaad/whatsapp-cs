/**
 * Mobile-side mirror of the curated template examples library.
 *
 * The canonical source — and the one that drives Twilio Content API
 * creation — lives at `src/lib/template-examples.ts` in the Next.js tree.
 * Metro can't reach across the monorepo by default and the mobile app only
 * needs the data structurally to render preview cards, so we duplicate the
 * literal here. Keep these two files in sync if you add or edit examples.
 *
 * Meta/WhatsApp rules these presets must satisfy:
 *   • Buttons are either all QUICK_REPLY, or a call-to-action set (up to 2
 *     URL + 1 PHONE_NUMBER). Mixing QR with URL/PHONE is rejected by Meta.
 *   • AUTHENTICATION uses `whatsapp/authentication` content type, not
 *     `whatsapp/card` — so AUTH presets are intentionally absent here.
 *   • `sampleValues` are what Meta sees as the realized message during
 *     review — must be realistic filled-in text, not raw parameter names.
 */

export type TemplateCategory = "MARKETING" | "UTILITY";
export type TemplateHeaderType = "none" | "text" | "image";

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
  image_prompt?: string;
  footer_text?: string;
  buttons?: TemplateExampleButton[];
}

export interface TemplateExample {
  slug: string;
  category: TemplateCategory;
  title: string;
  description: string;
  variables: string[];
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
      buttons: [
        { type: "URL", title: "احجز الآن", url: "https://example.com/rsvp" },
        { type: "URL", title: "شاهد القائمة", url: "https://example.com/menu" },
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
