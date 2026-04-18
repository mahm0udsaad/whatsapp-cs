"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Check, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { RestaurantWebsiteCrawlResponse } from "@/lib/types";

type Step = 1 | 2 | 3 | 4;

interface OnboardingData {
  restaurantName: string;
  displayName: string;
  country: string;
  currency: string;
  websiteUrl: string;
  agentName: string;
  personality: string;
  language: string;
  agentInstructions: string;
  menuUrl: string;
  logoUrl: string;
  telephone: string;
  openingHours: string;
  servesCuisine: string;
  botPhoneNumber: string;
}

const STEPS = [
  { number: 1, title: "بيانات المتجر" },
  { number: 2, title: "المساعد الذكي" },
  { number: 3, title: "ملف واتساب" },
  { number: 4, title: "مصدر القائمة" },
];

const DEFAULT_AGENT_INSTRUCTIONS =
  "أنت مساعد واتساب الخاص بالمتجر. أجب فقط عن الأسئلة المتعلقة بالمتجر، واكتب بإيجاز وبأسلوب ودود.";

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [websiteImporting, setWebsiteImporting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [websiteImportMessage, setWebsiteImportMessage] = useState("");
  const [websiteImportSummary, setWebsiteImportSummary] = useState<string[]>([]);
  const [data, setData] = useState<OnboardingData>({
    restaurantName: "",
    displayName: "",
    country: "SA",
    currency: "SAR",
    websiteUrl: "",
    agentName: "مساعد المتجر",
    personality: "friendly",
    language: "auto",
    agentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
    menuUrl: "",
    logoUrl: "",
    telephone: "",
    openingHours: "",
    servesCuisine: "",
    botPhoneNumber: "",
  });

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return data.restaurantName.trim() !== "";
      case 2:
        return (
          data.agentName.trim() !== "" && data.agentInstructions.trim() !== ""
        );
      case 3:
        // botPhoneNumber is optional — users can complete it later from the dashboard.
        return data.displayName.trim() !== "";
      case 4:
        return true;
      default:
        return false;
    }
  };

  const submitOnboarding = async () => {
    setLoading(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "تعذر إنهاء الإعداد.");
        return;
      }

      if (result.assignedPhoneNumber) {
        setStatusMessage(
          `اكتمل الإعداد. رقم واتساب الخاص بك هو ${result.assignedPhoneNumber}.`
        );
      } else {
        setStatusMessage(
          "تم تجهيز المتجر والمساعد. تعيين رقم واتساب بانتظار توفر رقم أو اكتمال تسجيل المرسل."
        );
      }

      router.push("/dashboard");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر إنهاء الإعداد."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 4) {
      await submitOnboarding();
      return;
    }

    setCurrentStep((currentStep + 1) as Step);
  };

  const handleWebsiteImport = async () => {
    if (!data.websiteUrl.trim()) {
      setError("أضف رابط موقع المتجر أولاً.");
      return;
    }

    setWebsiteImporting(true);
    setError("");
    setStatusMessage("");
    setWebsiteImportMessage("");
    setWebsiteImportSummary([]);

    try {
      const response = await fetch("/api/onboarding/crawl-website", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: data.websiteUrl }),
      });

      const result = (await response.json()) as
        | RestaurantWebsiteCrawlResponse
        | { error?: string };

      if (!response.ok) {
        const crawlError =
          "error" in result ? result.error : undefined;
        setError(crawlError || "تعذر قراءة الموقع.");
        return;
      }

      if (!("prefill" in result)) {
        setError("أرجع فحص الموقع استجابة غير صالحة.");
        return;
      }

      const prefill = result.prefill;
      setData((current) => {
        const nextRestaurantName =
          prefill.restaurantName || current.restaurantName;

        return {
          ...current,
          restaurantName: nextRestaurantName,
          displayName: prefill.displayName || nextRestaurantName || current.displayName,
          country: prefill.country || current.country,
          currency: prefill.currency || current.currency,
          websiteUrl: prefill.websiteUrl || current.websiteUrl,
          menuUrl: prefill.menuUrl || current.menuUrl,
          logoUrl: prefill.logoUrl || current.logoUrl,
          telephone: prefill.telephone || current.telephone,
          openingHours: prefill.openingHours || current.openingHours,
          servesCuisine: prefill.businessCategory || current.servesCuisine,
          language:
            prefill.language && current.language === "auto"
              ? prefill.language
              : current.language,
          agentName:
            current.agentName === "مساعد المتجر" && nextRestaurantName
              ? `مساعد ${nextRestaurantName}`
              : current.agentName,
          agentInstructions:
            current.agentInstructions === DEFAULT_AGENT_INSTRUCTIONS &&
            prefill.agentInstructions
              ? prefill.agentInstructions
              : current.agentInstructions,
        };
      });

      const importedCount = result.importedFields.length;
      setWebsiteImportMessage(
        importedCount > 0
          ? `تم استيراد ${importedCount} حقل من الموقع.`
          : "لم نتمكن من قراءة بيانات كافية من هذا الموقع. يمكنك إدخال الحقول يدوياً."
      );
      setWebsiteImportSummary(result.summary);
    } catch (crawlError) {
      setError(
        crawlError instanceof Error
          ? crawlError.message
          : "تعذر قراءة الموقع."
      );
    } finally {
      setWebsiteImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 space-y-6">
          <BrandLockup
            className="items-start text-right"
            imageClassName="w-32 self-start"
            titleClassName="text-3xl"
            subtitle="انقل هوية متجرك نفسها من الإعداد إلى المساعد المباشر."
          />
          <div>
            <h1 className="mb-2 text-3xl font-bold text-[#172554]">
              إطلاق مساعد واتساب
            </h1>
            <p className="text-slate-600">
              يجهز هذا الإعداد مساحة عمل المتجر والمساعد الذكي والسجلات المطلوبة لتفعيل مرسل واتساب.
            </p>
          </div>
        </div>

        <div className="mb-8 flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold transition-all",
                    currentStep >= step.number
                      ? "bg-[#1e3a8a] text-white"
                      : "bg-slate-200 text-slate-600"
                  )}
                >
                  {currentStep > step.number ? <Check size={24} /> : step.number}
                </div>
                <span className="mt-2 hidden text-center text-xs font-medium sm:block">
                  {step.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-1 w-8",
                    currentStep > step.number
                      ? "bg-[#facc15]"
                      : "bg-slate-200"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <Card className="border border-white/40 bg-white/88 shadow-[0_28px_80px_-40px_rgba(23,37,84,0.45)] backdrop-blur">
          <CardHeader>
            <CardTitle className="text-[#172554]">{STEPS[currentStep - 1].title}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-3 text-sm text-[#1e3a8a]">
                {statusMessage}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    اسم المتجر
                  </label>
                  <Input
                    placeholder="مثال: متجر الاختبار"
                    value={data.restaurantName}
                    onChange={(event) =>
                      setData({ ...data, restaurantName: event.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                    الدولة
                    </label>
                    <Select
                      value={data.country}
                      onValueChange={(value) =>
                        setData({ ...data, country: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                      <SelectItem value="EG">مصر</SelectItem>
                      <SelectItem value="SA">السعودية</SelectItem>
                      <SelectItem value="AE">الإمارات</SelectItem>
                      <SelectItem value="KW">الكويت</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                    العملة
                    </label>
                    <Select
                      value={data.currency}
                      onValueChange={(value) =>
                        setData({ ...data, currency: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EGP">EGP</SelectItem>
                        <SelectItem value="SAR">SAR</SelectItem>
                        <SelectItem value="AED">AED</SelectItem>
                        <SelectItem value="KWD">KWD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    رابط الموقع
                  </label>
                  <div className="flex flex-col gap-3 md:flex-row">
                    <Input
                      type="url"
                      placeholder="https://restaurant.com"
                      value={data.websiteUrl}
                      onChange={(event) =>
                        setData({ ...data, websiteUrl: event.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleWebsiteImport}
                      disabled={websiteImporting || !data.websiteUrl.trim()}
                      className="gap-2 md:w-auto"
                    >
                      <RefreshCw
                        size={16}
                        className={websiteImporting ? "animate-spin" : ""}
                      />
                      {websiteImporting ? "جارٍ قراءة الموقع..." : "استيراد بيانات الموقع"}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600">
                    يستورد الاسم والشعار ورابط القائمة والدولة والعملة ورقم التواصل وساعات العمل من الموقع العام. أي رقم يتم اكتشافه يُحفظ كرقم تواصل للمتجر، بينما رقم واتساب الخاص بالمساعد يتم تعيينه بشكل منفصل.
                  </p>
                </div>

                {websiteImportMessage ? (
                  <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
                    <div className="flex items-start gap-3">
                      {data.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={data.logoUrl}
                          alt="الشعار المكتشف"
                          className="h-10 w-10 shrink-0 rounded-md border border-[#bfdbfe] bg-white object-contain p-0.5"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Sparkles className="mt-0.5 shrink-0 text-[#1e3a8a]" size={18} />
                      )}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-[#172554]">
                          {websiteImportMessage}
                        </p>
                        {websiteImportSummary.length ? (
                          <div className="space-y-1">
                            {websiteImportSummary.map((item) => (
                              <p
                                key={item}
                                className="text-sm text-[#1e3a8a]"
                              >
                                {item}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-[#fcd34d] bg-[#fef9c3] p-4">
                  <h4 className="mb-2 text-sm font-semibold text-[#713f12]">
                    خيار إعداد أسرع
                  </h4>
                  <p className="text-sm text-[#854d0e]">
                    الإدخال اليدوي متاح دائماً. استيراد الموقع يملأ الخطوات التالية مسبقاً لتراجعها وتعدلها قبل التفعيل.
                  </p>
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    اسم المساعد الذكي
                  </label>
                  <Input
                    placeholder="مثال: مساعد المتجر"
                    value={data.agentName}
                    onChange={(event) =>
                      setData({ ...data, agentName: event.target.value })
                    }
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700">
                    أسلوب الشخصية
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        value: "friendly",
                        label: "ودود",
                        desc: "دافئ ومرحب",
                      },
                      {
                        value: "professional",
                        label: "احترافي",
                        desc: "واضح ودقيق",
                      },
                      {
                        value: "creative",
                        label: "إبداعي",
                        desc: "ردود أكثر تعبيراً",
                      },
                      {
                        value: "strict",
                        label: "مباشر",
                        desc: "مختصر وفعال",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setData({ ...data, personality: option.value })
                        }
                        className={cn(
                          "rounded-lg border-2 p-3 text-right transition-all",
                          data.personality === option.value
                            ? "border-[#2563eb] bg-[#eff6ff]"
                            : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-slate-600">
                          {option.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    اللغة المفضلة
                  </label>
                  <Select
                    value={data.language}
                    onValueChange={(value) =>
                      setData({ ...data, language: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">اكتشاف تلقائي</SelectItem>
                      <SelectItem value="en">الإنجليزية</SelectItem>
                      <SelectItem value="ar">العربية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    تعليمات المساعد
                  </label>
                  <Textarea
                    rows={6}
                    value={data.agentInstructions}
                    onChange={(event) =>
                      setData({
                        ...data,
                        agentInstructions: event.target.value,
                      })
                    }
                    placeholder="اكتب كيف يجب أن يرد المساعد على العملاء."
                  />
                </div>
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    اسم الظهور في واتساب
                  </label>
                  <Input
                    placeholder="اسم النشاط الذي يراه العملاء في واتساب"
                    value={data.displayName}
                    onChange={(event) =>
                      setData({ ...data, displayName: event.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    رقم هاتف المساعد
                  </label>
                  <Input
                    type="tel"
                    placeholder="+966XXXXXXXXX"
                    value={data.botPhoneNumber}
                    onChange={(event) =>
                      setData({ ...data, botPhoneNumber: event.target.value })
                    }
                  />
                  <p className="text-xs text-slate-600">
                    أدخل رقم الهاتف بالصيغة الدولية مثل +966542228723. سيتم تسجيل هذا الرقم في Twilio وتوجيه الرسائل منه إلى المساعد.
                  </p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1">
                  <h4 className="text-sm font-semibold text-amber-900">
                    مهم قبل المتابعة
                  </h4>
                  <p className="text-sm text-amber-800">
                    يجب ألا يكون لهذا الرقم <span className="font-semibold">حساب واتساب نشط</span>. إذا كان الرقم مرتبطاً بحساب واتساب، احذفه من الجهاز قبل المتابعة.
                  </p>
                  <p className="text-sm text-amber-700">
                    لإزالة واتساب من الرقم: افتح واتساب ثم الإعدادات ثم الحساب ثم حذف حسابي، أو احذف التطبيق واطلب حذف الحساب عبر موقع واتساب.
                  </p>
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    رابط القائمة الرقمية
                  </label>
                  <Input
                    type="url"
                    placeholder="https://restaurant.com/menu"
                    value={data.menuUrl}
                    onChange={(event) =>
                      setData({ ...data, menuUrl: event.target.value })
                    }
                  />
                  <p className="text-xs text-slate-600">
                    اختياري. سنحفظه الآن ويمكن قراءته لاحقاً.
                  </p>
                </div>

                <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
                  <h4 className="mb-2 text-sm font-semibold text-[#172554]">
                    جاهز للتفعيل
                  </h4>
                  <p className="text-sm text-[#1e3a8a]">
                    إنهاء هذه الخطوة ينشئ سجلات المتجر وقاعدة المعرفة الأولية وإعداد المساعد الذكي النشط.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-slate-200 pt-6">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 1 || loading}
              >
                <ChevronLeft size={18} />
                السابق
              </Button>

              <div className="text-sm text-slate-600">
                الخطوة {currentStep} من {STEPS.length}
              </div>

              <Button onClick={handleNext} disabled={!isStepValid() || loading}>
                {currentStep === 4 ? (
                  <>
                    {loading ? "جارٍ التفعيل..." : "إنهاء الإعداد"}
                    <Check size={18} />
                  </>
                ) : (
                  <>
                    التالي
                    <ChevronRight size={18} />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
