import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "الدعم — نِحجز",
  description: "تواصل معنا للمساعدة في إعداد نِحجز أو الحصول على إجابات للأسئلة الشائعة.",
};

const SUPPORT_EMAIL = "support@nehgzbot.com";
const WHATSAPP_NUMBER = "966554866685";
const WA_MSG = encodeURIComponent("السلام عليكم، أحتاج مساعدة في نِحجز.");
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${WA_MSG}`;

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">الدعم الفني</h1>
      <p className="mt-4 text-gray-600 leading-relaxed">
        نبي نِحجز يشتغل بدون ما تحس فيه، ويتصلح بسرعة لما يحتاج. اختر القناة المناسبة لك:
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 hover:border-emerald-400 hover:bg-emerald-50 transition"
        >
          <div className="text-2xl">💬</div>
          <h2 className="mt-3 font-bold text-gray-900">واتساب الدعم</h2>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            أسرع طريقة للتواصل. ردنا خلال ساعات العمل.
          </p>
          <p className="mt-3 text-emerald-700 font-semibold text-sm">6685 486 55 966+</p>
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-gray-400 transition"
        >
          <div className="text-2xl">✉️</div>
          <h2 className="mt-3 font-bold text-gray-900">البريد الإلكتروني</h2>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            للاستفسارات التفصيلية أو إرفاق الملفات.
          </p>
          <p className="mt-3 text-emerald-700 font-semibold text-sm" dir="ltr">
            {SUPPORT_EMAIL}
          </p>
        </a>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-gray-900">الأسئلة الشائعة</h2>
        <dl className="mt-6 space-y-5">
          <div className="rounded-xl border border-gray-200 p-5">
            <dt className="font-bold text-gray-900">كيف أربط رقم الواتساب؟</dt>
            <dd className="mt-2 text-sm text-gray-600 leading-relaxed">
              بعد تسجيل الدخول للوحة التحكم، روح لقسم "إعداد الواتساب" وسنرشدك خطوة خطوة لربط رقمك
              عبر منصة واتساب للأعمال.
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 p-5">
            <dt className="font-bold text-gray-900">هل المساعد يرد بالعربية السعودية؟</dt>
            <dd className="mt-2 text-sm text-gray-600 leading-relaxed">
              نعم، اللهجة الافتراضية سعودية طبيعية. تقدر تخصص شخصية المساعد ولهجته وأسلوبه من
              لوحة التحكم.
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 p-5">
            <dt className="font-bold text-gray-900">هل أقدر أتدخل وأرد بنفسي؟</dt>
            <dd className="mt-2 text-sm text-gray-600 leading-relaxed">
              بالتأكيد. تطبيق الجوّال يصلك إشعار لما عميل يحتاج رد بشري. بضغطة وحدة تستلم المحادثة
              وتوقف رد المساعد.
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 p-5">
            <dt className="font-bold text-gray-900">هل قاعدة معرفتي ومحادثاتي خاصة؟</dt>
            <dd className="mt-2 text-sm text-gray-600 leading-relaxed">
              نعم، كل عميل عنده بيئة معزولة تماماً. ما نشارك أي معرفة أو محادثات بين المتاجر.
              تفاصيل أكثر في{" "}
              <Link href="/privacy" className="text-emerald-700 hover:underline">
                سياسة الخصوصية
              </Link>
              .
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 p-5">
            <dt className="font-bold text-gray-900">كم تستغرق عملية التركيب؟</dt>
            <dd className="mt-2 text-sm text-gray-600 leading-relaxed">
              غالباً 24 ساعة من توقيع الاتفاقية. نتولى الإعداد التقني الكامل ونسلّمك حساباً جاهزاً.
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 p-5">
            <dt className="font-bold text-gray-900">هل تكلفة واتساب من Meta مشمولة؟</dt>
            <dd className="mt-2 text-sm text-gray-600 leading-relaxed">
              لا. واتساب تحتسب رسوم على المحادثة (تختلف حسب نوعها) وهي منفصلة عن اشتراكك في نِحجز.
              نوضح لك التكلفة المتوقعة قبل البداية.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
