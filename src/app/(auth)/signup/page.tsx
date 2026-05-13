"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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
 * Sign-up flow is restricted to businesses only.
 *
 * Compliance background:
 * - App Store Review Guideline 3.1.3(c) — Enterprise Services. Because Nehgz
 *   Bot is sold as a B2B service (the iOS app is a free client for an existing
 *   paid business workspace), the public sign-up flow must clearly gate
 *   eligibility to organizations/merchants only. Individual, consumer, and
 *   family use is not offered and is blocked at the form level here.
 * - Apple's review of submission d9e004fc cited 3.1.3(c) on 2026-05-11; this
 *   gate, the required Business Name field, and the matching Terms eligibility
 *   clause are the response.
 */
export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [accountType, setAccountType] = useState<"business" | "personal">(
    "business"
  );
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    businessName: "",
    country: "SA",
    commercialRegistration: "",
    acceptedBusinessTerms: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isPersonal = accountType === "personal";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type, checked } = target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isPersonal) {
      setError(
        "نِهجز بوت خدمة موجَّهة للأعمال (B2B) فقط — لا نوفّر حسابات شخصية أو عائلية."
      );
      return;
    }

    if (!formData.businessName.trim()) {
      setError("يرجى إدخال اسم النشاط التجاري لإتمام التسجيل.");
      return;
    }

    if (!formData.acceptedBusinessTerms) {
      setError(
        "يلزم الإقرار بأنك ممثّل مفوّض عن نشاط تجاري قبل إنشاء الحساب."
      );
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }

    if (formData.password.length < 6) {
      setError("يجب أن تكون كلمة المرور 6 أحرف على الأقل");
      return;
    }

    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            account_type: "business",
            business_name: formData.businessName.trim(),
            business_country: formData.country,
            commercial_registration:
              formData.commercialRegistration.trim() || null,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        router.push("/onboarding");
      }
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError("");
    if (isPersonal) {
      setError(
        "نِهجز بوت خدمة موجَّهة للأعمال (B2B) فقط — لا نوفّر حسابات شخصية أو عائلية."
      );
      return;
    }
    if (!formData.businessName.trim()) {
      setError(
        "يرجى إدخال اسم النشاط التجاري قبل المتابعة عبر جوجل."
      );
      return;
    }
    if (!formData.acceptedBusinessTerms) {
      setError(
        "يلزم الإقرار بأنك ممثّل مفوّض عن نشاط تجاري قبل المتابعة."
      );
      return;
    }
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            // Encode business intent in the OAuth flow so the callback can
            // persist these values on first sign-in.
            business_name: formData.businessName.trim(),
            business_country: formData.country,
          },
        },
      });

      if (signInError) {
        setError(signInError.message);
      }
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-white/40 bg-white/88 shadow-[0_28px_80px_-40px_rgba(23,37,84,0.45)] backdrop-blur">
      <CardHeader className="space-y-5 text-center">
        <BrandLockup
          imageClassName="w-28"
          subtitle="ابدأ بنفس الهوية التي سيتعرف عليها عملاؤك."
        />
        <div>
          <CardTitle className="text-2xl text-[#172554]">
            تسجيل نشاط تجاري جديد
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
            الشخصي أو العائلي. التسعير وجميع المدفوعات تتم عبر هذا الموقع
            مباشرة وليس داخل تطبيق الجوّال.
          </p>
        </div>

        {/* Account-type gate. Selecting "personal" disables the form. */}
        <fieldset className="mb-6">
          <legend className="text-sm font-medium text-slate-700 mb-2">
            من يقوم بالتسجيل؟
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
              إنشاء حساب للاستخدام الشخصي أو العائلي. إذا كنت تمثّل نشاطاً
              تجارياً، اختر &laquo;نشاط تجاري&raquo; أعلاه للمتابعة.
            </p>
          )}
        </fieldset>

        <form
          onSubmit={handleSignup}
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
                <option value="SA">السعودية</option>
                <option value="AE">الإمارات</option>
                <option value="KW">الكويت</option>
                <option value="QA">قطر</option>
                <option value="BH">البحرين</option>
                <option value="OM">عُمان</option>
                <option value="EG">مصر</option>
                <option value="JO">الأردن</option>
                <option value="OTHER">أخرى</option>
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
              البريد الإلكتروني للعمل
            </label>
            <Input
              type="email"
              name="email"
              placeholder="you@restaurant.com"
              value={formData.email}
              onChange={handleChange}
              disabled={loading || isPersonal}
              required={!isPersonal}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              كلمة المرور
            </label>
            <Input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              disabled={loading || isPersonal}
              required={!isPersonal}
            />
            <p className="text-xs text-slate-500">6 أحرف على الأقل</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              تأكيد كلمة المرور
            </label>
            <Input
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading || isPersonal}
              required={!isPersonal}
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
              أُقرّ بأنني ممثّل مفوّض عن نشاط تجاري، وأن استخدامي للخدمة هو
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
            {loading ? "جارٍ إنشاء الحساب..." : "إنشاء حساب النشاط التجاري"}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-slate-500">أو سجّل باستخدام</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogleSignup}
          disabled={
            loading ||
            isPersonal ||
            !formData.acceptedBusinessTerms ||
            !formData.businessName.trim()
          }
          size="lg"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          جوجل
        </Button>

        <p className="mt-6 text-center text-sm text-slate-600">
          لديك حساب بالفعل؟{" "}
          <Link
            href="/login"
            className="font-medium text-[#1e3a8a] hover:text-[#172554]"
          >
            تسجيل الدخول
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
