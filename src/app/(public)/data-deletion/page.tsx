import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "حذف بيانات Meta — نِحجز",
  description:
    "حالة طلب حذف بياناتك المرتبطة بحساب Facebook / Instagram في نِحجز، وما الذي يُحذف.",
  alternates: { canonical: "/data-deletion" },
};

const PRIVACY_EMAIL = "privacy@nehgzbot.com";

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const code = (await searchParams).code;

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-gray-700 leading-loose">
      <h1 className="text-3xl font-extrabold text-gray-900">
        حذف بيانات Facebook و Instagram
      </h1>

      {code ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">تم استلام طلب الحذف وتنفيذه.</p>
          <p className="mt-1 text-sm text-emerald-800">
            رمز التأكيد:{" "}
            <span dir="ltr" className="font-mono">
              {code}
            </span>
          </p>
        </div>
      ) : null}

      <p className="mt-6">
        عند ربط حساب Meta بنِحجز نحفظ فقط ما يلزم لإدارة إعلاناتك ومنشوراتك:
        رموز الوصول، ومعرّف حسابك الإعلاني، والصفحة وحساب Instagram المرتبط.
        يمكنك حذف هذه البيانات في أيّ وقت بإحدى الطرق التالية.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">من داخل التطبيق</h2>
      <ol className="mt-4 list-decimal pr-6 space-y-1">
        <li>افتح شاشة Facebook أو Instagram في تطبيق نِحجز.</li>
        <li>اضغط أيقونة فصل الحساب (تسجيل الخروج) في الأعلى.</li>
        <li>تُحذف رموز الوصول وروابط الحساب فورًا من خوادمنا.</li>
      </ol>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">من إعدادات Facebook</h2>
      <p>
        من إعدادات حسابك على Facebook ← التطبيقات والمواقع ← أزل تطبيق نِحجز.
        سيُرسل Facebook طلب حذف تلقائيًا ونحذف بياناتك المرتبطة بحسابك.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">ما الذي يُحذف؟</h2>
      <ul className="mt-4 list-disc pr-6 space-y-1">
        <li>رمز وصول المستخدم ورمز وصول الصفحة.</li>
        <li>معرّف الحساب الإعلاني واسمه.</li>
        <li>معرّف صفحة Facebook وحساب Instagram المرتبط.</li>
      </ul>
      <p className="mt-4">
        لا تُنشر المنشورات والإعلانات التي سبق إنشاؤها على Facebook/Instagram
        ضمن بياناتنا — يمكنك حذفها من حسابك على Meta مباشرة.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-bold text-gray-900">أسئلة أخرى؟</h2>
      <p>
        راجع{" "}
        <Link href="/privacy" className="text-emerald-700 underline hover:text-emerald-800">
          سياسة الخصوصية
        </Link>{" "}
        أو راسلنا على{" "}
        <a
          href={`mailto:${PRIVACY_EMAIL}`}
          className="text-emerald-700 underline hover:text-emerald-800"
          dir="ltr"
        >
          {PRIVACY_EMAIL}
        </a>
        .
      </p>

      <hr className="my-12 border-gray-200" />

      <section dir="ltr" className="text-sm text-gray-500 leading-relaxed">
        <h2 className="text-base font-semibold text-gray-700">
          Meta data deletion (English summary)
        </h2>
        <p className="mt-3">
          When you connect a Meta account, Nehgz stores only your access tokens,
          ad-account id, and the linked Page / Instagram account. You can delete
          this at any time: in-app via the Facebook/Instagram screen
          (disconnect), or by removing the Nehgz app from your Facebook
          Settings → Apps and Websites, which triggers an automatic deletion of
          the data tied to your Facebook user.
        </p>
      </section>
    </article>
  );
}
