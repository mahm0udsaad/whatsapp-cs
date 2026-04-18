"use client";

import { useState } from "react";
import { Eye, MessageCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildCustomerServiceTemplate } from "@/lib/customer-service";
import { AiAgent } from "@/lib/types";

interface AIAgentSettingsFormProps {
  aiAgent: AiAgent;
  businessName: string;
}

const personalities = [
  {
    value: "friendly",
    label: "ودود",
    desc: "دافئ ومرحب وقريب من العميل",
    sample: "أهلاً بك، يسعدني مساعدتك.",
  },
  {
    value: "professional",
    label: "احترافي",
    desc: "رسمي ودقيق ومناسب للأعمال",
    sample: "مرحباً، كيف يمكنني مساعدتك؟",
  },
  {
    value: "creative",
    label: "إبداعي",
    desc: "مرح وجذاب وأكثر تعبيراً",
    sample: "خلينا نوصل للإجابة المناسبة بسرعة.",
  },
  {
    value: "strict",
    label: "مباشر",
    desc: "مختصر وفعال وواضح",
    sample: "اكتب سؤالك وسأساعدك مباشرة.",
  },
];

export function AIAgentSettingsForm({
  aiAgent,
  businessName,
}: AIAgentSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: aiAgent.name,
    personality: aiAgent.personality,
    systemInstructions: aiAgent.system_instructions,
    languagePreference: aiAgent.language_preference,
    offTopicResponse: aiAgent.off_topic_response,
  });

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch("/api/dashboard/ai-agent", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          personality: formData.personality,
          system_instructions: formData.systemInstructions,
          language_preference: formData.languagePreference,
          off_topic_response: formData.offTopicResponse,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "تعذر حفظ إعدادات المساعد.");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "تعذر حفظ إعدادات المساعد."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>بيانات المساعد</CardTitle>
            <CardDescription>
              الهوية الأساسية ونبرة الرد لخدمة العملاء الخاصة بالمتجر.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                اسم المساعد
              </label>
              <Input
                value={formData.name}
                onChange={(event) =>
                  setFormData({ ...formData, name: event.target.value })
                }
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                أسلوب الشخصية
              </label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {personalities.map((personality) => (
                  <button
                    key={personality.value}
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        personality: personality.value,
                      })
                    }
                    className={`rounded-lg border-2 p-4 text-right transition-all ${
                      formData.personality === personality.value
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="text-sm font-medium">{personality.label}</div>
                    <div className="mt-1 text-xs text-gray-600">
                      {personality.desc}
                    </div>
                    <div className="mt-2 text-xs italic text-gray-500">
                      &quot;{personality.sample}&quot;
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>تعليمات النظام</CardTitle>
            <CardDescription>
              هذه التعليمات تحدد طريقة رد المساعد على العملاء.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-sm text-emerald-900">
                استخدم قالب خدمة عملاء محايد يناسب أي نوع نشاط.
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData({
                    ...formData,
                    systemInstructions: buildCustomerServiceTemplate(
                      businessName,
                      formData.languagePreference === "ar" ? "ar" : "en"
                    ),
                  })
                }
              >
                استخدام قالب خدمة العملاء
              </Button>
            </div>

            <Textarea
              rows={8}
              value={formData.systemInstructions}
              onChange={(event) =>
                setFormData({
                  ...formData,
                  systemInstructions: event.target.value,
                })
              }
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                اللغة المفضلة
              </label>
              <select
                value={formData.languagePreference}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    languagePreference: event.target.value as "ar" | "en" | "auto",
                  })
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              >
                <option value="auto">اكتشاف تلقائي</option>
                <option value="en">الإنجليزية</option>
                <option value="ar">العربية</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                رد خارج النطاق
              </label>
              <Textarea
                rows={3}
                value={formData.offTopicResponse}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    offTopicResponse: event.target.value,
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye size={20} />
              معاينة مباشرة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {saved ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                تم حفظ الإعدادات.
              </div>
            ) : null}

            <div className="space-y-3 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 p-4">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-emerald-600" />
                <span className="text-sm font-medium text-emerald-900">
                  {formData.name}
                </span>
              </div>
              <div className="space-y-2">
                <div className="rounded bg-white p-2 text-xs text-emerald-700">
                  <p className="mb-1 font-medium">محادثة تجريبية:</p>
                  <p className="text-emerald-900">
                    العميل: ما هي ساعات العمل؟
                  </p>
                </div>
                <div className="ml-6 rounded border-l-2 border-emerald-600 bg-emerald-100 p-2 text-xs">
                  <p className="text-emerald-900">
                    {formData.personality === "friendly"
                      ? "يسعدنا مساعدتك في المنتجات والخدمات وساعات العمل وأسئلة الدعم."
                      : formData.personality === "professional"
                      ? "يمكنني المساعدة في التوفر والحجوزات ومعلومات النشاط."
                      : formData.personality === "creative"
                      ? "دعنا نصل للإجابة المناسبة بسرعة."
                      : "يمكنني الرد مباشرة على الأسئلة المتعلقة بالنشاط."}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <div>
                <span className="font-medium">الشخصية:</span>{" "}
                <Badge variant="default" className="ml-1">
                  {formData.personality}
                </Badge>
              </div>
              <div>
                <span className="font-medium">اللغة:</span>{" "}
                {formData.languagePreference}
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings size={20} />
              الحالة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">حالة المساعد</span>
              <Badge variant="default">نشط</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">
                آخر تحديث
              </span>
              <span className="font-medium text-gray-900">
                {new Date(aiAgent.updated_at).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
