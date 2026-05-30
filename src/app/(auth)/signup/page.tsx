"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Request-access / contact-sales flow (replaces self-serve sign-up).
 *
 * Compliance background:
 * - App Store Review Guidelines 3.1.1 (In-App Purchase) and 3.1.3(c)
 *   (Enterprise Services). Apple rejected submission d9e004fc twice because the
 *   service — although sold B2B — could be self-purchased by an individual via
 *   the open sign-up form. Apple's accepted resolution is to provide the
 *   service only to organizations/businesses.
 * - This page therefore creates NO account and NO credentials. It records a
 *   sales lead (POST /api/leads). The Nehgz team verifies the business and
 *   provisions the account manually after signing the commercial agreement —
 *   exactly as described in Terms section 2.1. There is no payment, pricing, or
 *   purchase anywhere in the iOS app; all commercial steps happen offline.
 */
const COUNTRIES = [
  { value: "SA", label: "السعودية" },
  { value: "AE", label: "الإمارات" },
  { value: "KW", label: "الكويت" },
  { value: "QA", label: "قطر" },
  { value: "BH", label: "البحرين" },
  { value: "OM", label: "عُمان" },
  { value: "EG", label: "مصر" },
  { value: "JO", label: "الأردن" },
  { value: "OTHER", label: "أخرى" },
];

export default function RequestAccessPage() {
  const [accountType, setAccountType] = useState<"business" | "personal">(
    "business"
  );
  const [formData, setFormData] = useState({
    businessName: "",
    contactEmail: "",
    contactPhone: "",
    country: "SA",
    commercialRegistration: "",
    message: "",
    acceptedBusinessTerms: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const isPersonal = accountType === "personal";

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type, checked } = target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isPersonal) {
      setError(
        "نِهجز بوت خدمة موجَّهة للأعمال (B2B) فقط — لا نوفّر حسابات شخصية أو عائلية."
      );
      return;
    }

    if (!formData.businessName.trim()) {
      setError("يرجى إدخال اسم النشاط التجاري.");
      return;
    }

    if (!formData.contactEmail.trim() || !formData.contactEmail.includes("@")) {
      setError("يرجى إدخال بريد إلكتروني صحيح للتواصل.");
      return;
    }

    if (!formData.acceptedBusinessTerms) {
      setError(
        "يلزم الإقرار بأنك ممثّل مفوّض عن نشاط تجاري قبل إرسال الطلب."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: formData.businessName.trim(),
          contactEmail: formData.contactEmail.trim(),
          contactPhone: formData.contactPhone.trim() || undefined,
          country: formData.country,
          commercialRegistration:
            formData.commercialRegistration.trim() || undefined,
          message: formData.message.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "تعذّر إرسال الطلب. حاول مرة أخرى.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border border-white/40 bg-white/88 shadow-[0_28px_80px_-40px_rgba(23,37,84,0.45)] backdrop-blur">
        <CardHeader className="space-y-5 text-center">
          <BrandLockup imageClassName="w-28" />
          <div>
            <CardTitle className="text-2xl text-[#172554]">
              وصلنا طلبك ✅
            </CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              شكراً لك. سيتواصل معك فريق المبيعات للتحقق من نشاطك التجاري
              وتجهيز حسابك. لا يتم إنشاء أي حساب أو الدفع داخل التطبيق — كل
              الخطوات التجارية تتم معنا مباشرة.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-center">
          <p className="mb-6 text-sm text-slate-600">
            عندك حساب نشاط تجاري قائم؟
          </p>
          <Link href="/login">
            <Button variant="outline" className="w-full" size="lg">
              تسجيل دخول الموظفين
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-white/40 bg-white/88 shadow-[0_28px_80px_-40px_rgba(23,37,84,0.45)] backdrop-blur">
      <CardHeader className="space-y-5 text-center">
        <BrandLockup
          imageClassName="w-28"
          subtitle="ابدأ بنفس الهوية التي سيتعرف عليها عملاؤك."
        />
        <div>
          <CardTitle className="text-2xl text-[#172554]">
            اطلب تفعيل نشاطك التجاري
          </CardTitle>
          <CardDescription className="mt-1">
            نِهجز بوت خدمة <strong>B2B</strong> للمتاجر والأنشطة التجارية فقط
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {/* Business-only eligibility banner — explicit and unambiguous. */}
        <div
          className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900"
          role="note"
          aria-label="Business-only eligibility notice"
        >
          <p className="font-semibold mb-1">
            هذه الخدمة للأعمال التجارية فقط
          </p>
          <p>
            نِهجز بوت مخصص للمطاعم والكافيهات والصالونات والعيادات والمتاجر
            وغيرها من الأنشطة التجارية. لا نوفّر حسابات للأفراد أو للاستخدام
            الشخصي أو العائلي. لا يوجد تسجيل ذاتي ولا دفع داخل التطبيق — يتم
            تجهيز الحساب يدوياً بعد التحقق من نشاطك التجاري وتوقيع الاتفاقية
            التجارية.
          </p>
        </div>

        {/* Account-type gate. Selecting "personal" disables the form. */}
        <fieldset className="mb-6">
          <legend className="text-sm font-medium text-slate-700 mb-2">
            من يقوم بالطلب؟
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm transition ${
                accountType === "business"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value="business"
                checked={accountType === "business"}
                onChange={() => setAccountType("business")}
                className="sr-only"
              />
              نشاط تجاري
            </label>
            <label
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm transition ${
                accountType === "personal"
                  ? "border-red-300 bg-red-50 text-red-900 font-semibold"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value="personal"
                checked={accountType === "personal"}
                onChange={() => setAccountType("personal")}
                className="sr-only"
              />
              استخدام شخصي
            </label>
          </div>
          {isPersonal && (
            <p
              className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              data-testid="personal-blocked-notice"
            >
              عذراً — نِهجز بوت خدمة موجّهة للأعمال التجارية فقط. لا يمكن
              تجهيز حساب للاستخدام الشخصي أو العائلي. إذا كنت تمثّل نشاطاً
              تجارياً، اختر «نشاط تجاري» أعلاه للمتابعة.
            </p>
          )}
        </fieldset>

        <form
          onSubmit={handleSubmit}
          className={`space-y-4 ${isPersonal ? "opacity-40 pointer-events-none select-none" : ""}`}
          aria-disabled={isPersonal}
        >
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              اسم النشاط التجاري <span className="text-red-600">*</span>
            </label>
            <Input
              type="text"
              name="businessName"
              placeholder="مثال: مطعم الذواقة"
              value={formData.businessName}
              onChange={handleChange}
              disabled={loading || isPersonal}
              required={!isPersonal}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                دولة النشاط <span className="text-red-600">*</span>
              </label>
              <select
                name="country"
                value={formData.country}
                onChange={handleChange}
                disabled={loading || isPersonal}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                السجل التجاري (اختياري)
              </label>
              <Input
                type="text"
                name="commercialRegistration"
                placeholder="إن وُجد"
                value={formData.commercialRegistration}
                onChange={handleChange}
                disabled={loading || isPersonal}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              البريد الإلكتروني للعمل <span className="text-red-600">*</span>
            </label>
            <Input
              type="email"
              name="contactEmail"
              placeholder="you@restaurant.com"
              value={formData.contactEmail}
              onChange={handleChange}
              disabled={loading || isPersonal}
              required={!isPersonal}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              رقم الجوال للتواصل (اختياري)
            </label>
            <Input
              type="tel"
              name="contactPhone"
              placeholder="05xxxxxxxx"
              value={formData.contactPhone}
              onChange={handleChange}
              disabled={loading || isPersonal}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              نبذة عن نشاطك (اختياري)
            </label>
            <textarea
              name="message"
              rows={3}
              placeholder="نوع النشاط، عدد الفروع، ما الذي تريد تحقيقه..."
              value={formData.message}
              onChange={handleChange}
              disabled={loading || isPersonal}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
            <input
              type="checkbox"
              name="acceptedBusinessTerms"
              checked={formData.acceptedBusinessTerms}
              onChange={handleChange}
              disabled={loading || isPersonal}
              className="mt-1"
            />
            <span>
              أُقرّ بأنني ممثّل مفوّض عن نشاط تجاري، وأن طلبي للخدمة هو
              للأغراض التجارية فقط، وفقاً لـ{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-medium text-emerald-700 underline hover:text-emerald-800"
              >
                شروط الاستخدام
              </Link>
              .
            </span>
          </label>

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading ||
              isPersonal ||
              !formData.acceptedBusinessTerms ||
              !formData.businessName.trim()
            }
            size="lg"
          >
            {loading ? "جارٍ إرسال الطلب..." : "أرسل طلب التفعيل"}
          </Button>

          <p className="text-center text-xs text-slate-500 leading-relaxed">
            لا يتم إنشاء حساب أو الدفع في هذه الخطوة. سيتواصل معك فريقنا
            لتجهيز الحساب بعد التحقق من نشاطك التجاري.
          </p>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          عندك حساب نشاط تجاري قائم؟{" "}
          <Link
            href="/login"
            className="font-medium text-emerald-700 underline hover:text-emerald-800"
          >
            تسجيل الدخول
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
