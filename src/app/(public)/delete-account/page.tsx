import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "حذف الحساب — نِحجز",
  description:
    "كيف تطلب حذف حسابك في نِحجز ولوحة التحكم وتطبيق نِحجز بوت، وما البيانات التي تُحذف ومتى.",
  alternates: {
    canonical: "/delete-account",
  },
};

const SUPPORT_EMAIL = "support@nehgzbot.com";
const PRIVACY_EMAIL = "privacy@nehgzbot.com";
const WHATSAPP_NUMBER = "966554866685";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "السلام عليكم، أرغب في حذف حسابي في نِحجز."
)}`;

export default function DeleteAccountPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-gray-700 leading-loose">
      <h1 className="text-3xl font-extrabold text-gray-900">حذف الحساب وبياناتك</h1>
      <p className="mt-4">
        نلتزم في <strong>نِحجز</strong> بحقّك في التحكم ببياناتك. تقدر تطلب حذف حسابك في أيّ وقت
        من داخل التطبيق أو عبر هذه الصفحة، بدون الحاجة لتسجيل دخول.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">
        الطريقة الأسرع: من داخل التطبيق
      </h2>
      <ol className="mt-4 list-decimal pr-6 space-y-1">
        <li>افتح تطبيق نِحجز بوت على جوّالك.</li>
        <li>اضغط على "ملفي" في شريط التنقل السفلي.</li>
        <li>اختر "حذف الحساب" وأكِّد الطلب.</li>
      </ol>
      <p className="mt-4">
        سيُرسَل طلبك تلقائيًا، وتصلك رسالة تأكيد على بريدك خلال ٢٤ ساعة.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">
        أو راسلنا — لا حاجة لتسجيل الدخول
      </h2>
      <p>
        أرسل بريدًا إلى{" "}
        <a
          href={`mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(
            "طلب حذف حساب"
          )}&body=${encodeURIComponent(
            "السلام عليكم،\n\nأرغب في حذف حسابي في نِحجز.\n\nالبريد المسجَّل بالحساب: \nاسم المتجر (إن أمكن): \n\nشكرًا."
          )}`}
          className="text-emerald-700 underline hover:text-emerald-800"
          dir="ltr"
        >
          {PRIVACY_EMAIL}
        </a>{" "}
        من نفس البريد المسجَّل بحسابك. اكتب في الرسالة:
      </p>
      <ul className="mt-3 list-disc pr-6 space-y-1">
        <li>عنوان الموضوع: "طلب حذف حساب".</li>
        <li>البريد المسجَّل بالحساب.</li>
        <li>اسم متجرك (اختياري ويُسرِّع التحقُّق).</li>
      </ul>
      <p className="mt-4">
        أو راسلنا على{" "}
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 underline hover:text-emerald-800"
        >
          واتساب الدعم
        </a>{" "}
        ونتولّى الباقي.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">ما الذي يُحذَف؟</h2>
      <ul className="mt-4 list-disc pr-6 space-y-1">
        <li>بيانات حسابك الشخصي (الاسم، البريد، رقم الجوّال، الدور).</li>
        <li>إعدادات متجرك على نِحجز (قاعدة المعرفة، تعليمات المساعد، أعضاء الفريق).</li>
        <li>محادثات الواتساب وسجلّات التسليم المرتبطة بمتجرك.</li>
        <li>سجلّات الجلسات وتقارير الأخطاء المرتبطة بحسابك.</li>
        <li>رموز الإشعارات للأجهزة المرتبطة بحسابك.</li>
      </ul>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">ما الذي قد يُحتفظ به؟</h2>
      <p>
        قد نحتفظ بنسخ احتياطية مشفَّرة لبعض السجلّات لفترة محدودة لأغراض الأمان والامتثال
        القانوني (الحدّ الأقصى ٩٠ يومًا). لا نستخدم هذه السجلّات لأيّ غرض آخر، وتُحذَف تلقائيًا
        عند انتهاء المدّة.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">المدّة الزمنيّة</h2>
      <p>
        نُنفِّذ طلبات الحذف خلال <strong>٣٠ يومًا</strong> من استلامها، وعادةً خلال أيّام قليلة.
        تصلك رسالة تأكيد بعد إتمام الحذف.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">أسئلة أخرى؟</h2>
      <p>
        راجع{" "}
        <Link
          href="/privacy"
          className="text-emerald-700 underline hover:text-emerald-800"
        >
          سياسة الخصوصية
        </Link>{" "}
        أو راسلنا على{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-emerald-700 underline hover:text-emerald-800"
          dir="ltr"
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <hr className="my-12 border-gray-200" />

      <section dir="ltr" className="text-sm text-gray-500 leading-relaxed">
        <h2 className="text-base font-semibold text-gray-700">
          Account &amp; data deletion (English summary)
        </h2>
        <p className="mt-3">
          You can request deletion of your Nehgz Bot account and associated data
          at any time:
        </p>
        <ul className="mt-3 list-disc pl-6 space-y-1">
          <li>
            <strong>In-app:</strong> Profile tab → Delete account.
          </li>
          <li>
            <strong>By email:</strong>{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(
                "Account deletion request"
              )}`}
              className="text-emerald-700 underline"
            >
              {PRIVACY_EMAIL}
            </a>
            , from the email address registered to your account.
          </li>
        </ul>
        <p className="mt-3">
          Deleted: account profile, store settings, knowledge base, WhatsApp
          conversations and delivery logs tied to your store, session and error
          logs, push tokens. Retained: encrypted backups for up to 90 days for
          security and legal compliance, then auto-purged. Requests are processed
          within 30 days, typically within a few days.
        </p>
      </section>
    </article>
  );
}
