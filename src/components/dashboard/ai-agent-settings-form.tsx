"use client";

import { useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Eye,
  Languages,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildCustomerServiceTemplate } from "@/lib/customer-service";
import type { AiAgent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AIAgentSettingsFormProps {
  aiAgent: AiAgent;
  businessName: string;
}

const personalities = [
  { value: "friendly", label: "ودود", desc: "دافئ وقريب من العميل", sample: "أهلاً بك، يسعدني مساعدتك." },
  { value: "professional", label: "احترافي", desc: "رسمي ودقيق للأعمال", sample: "مرحباً، كيف يمكنني مساعدتك؟" },
  { value: "creative", label: "إبداعي", desc: "مرح وأكثر تعبيراً", sample: "خلينا نوصل للإجابة المناسبة بسرعة." },
  { value: "strict", label: "مباشر", desc: "مختصر وفعال وواضح", sample: "اكتب سؤالك وسأساعدك مباشرة." },
];

function previewReply(personality: string) {
  if (personality === "friendly") return "أهلاً بك 🌟 يسعدني مساعدتك. ساعات العمل من 9 صباحاً حتى 10 مساءً.";
  if (personality === "professional") return "مرحباً. ساعات العمل من 9 صباحاً حتى 10 مساءً. هل يمكنني مساعدتك بشيء آخر؟";
  if (personality === "creative") return "أكيد! نحن معك يومياً من 9 صباحاً إلى 10 مساءً ✨";
  return "ساعات العمل: يومياً من 9 صباحاً إلى 10 مساءً.";
}

export function AIAgentSettingsForm({ aiAgent, businessName }: AIAgentSettingsFormProps) {
  const initialData = {
    name: aiAgent.name,
    personality: aiAgent.personality,
    systemInstructions: aiAgent.system_instructions,
    languagePreference: aiAgent.language_preference,
    offTopicResponse: aiAgent.off_topic_response,
  };
  const [savedFormData, setSavedFormData] = useState(initialData);
  const [formData, setFormData] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const hasChanges = JSON.stringify(formData) !== JSON.stringify(savedFormData);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch("/api/dashboard/ai-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
      setSavedFormData(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ إعدادات المساعد.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--line)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-[var(--brand)]"><Bot size={19} /></div>
              <div>
                <CardTitle>هوية المساعد ونبرة الرد</CardTitle>
                <CardDescription className="mt-1">اختاري كيف يعرّف المساعد نفسه وكيف يبدو صوته أمام العملاء.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <label htmlFor="agent-name" className="text-sm font-semibold text-[var(--foreground)]">اسم المساعد</label>
              <Input id="agent-name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} placeholder="مثال: نوره" />
              <p className="text-xs text-[var(--muted)]">يظهر هذا الاسم داخل فريقك وفي بعض رسائل التعريف.</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--foreground)]">أسلوب الشخصية</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {personalities.map((personality) => {
                  const selected = formData.personality === personality.value;
                  return (
                    <button
                      key={personality.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setFormData({ ...formData, personality: personality.value })}
                      className={cn(
                        "relative cursor-pointer rounded-[var(--radius-md)] border p-4 text-right transition-colors",
                        selected ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] bg-white hover:border-[#20339a]/35 hover:bg-[#f8f9fd]"
                      )}
                    >
                      {selected ? <span className="absolute end-3 top-3 flex h-5 w-5 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand)] text-white"><Check size={12} /></span> : null}
                      <p className="pe-7 text-sm font-bold text-[var(--foreground)]">{personality.label}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{personality.desc}</p>
                      <p className="mt-3 border-t border-[var(--line)] pt-3 text-xs leading-5 text-[var(--brand-strong)]">“{personality.sample}”</p>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--line)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-[var(--brand)]"><Sparkles size={19} /></div>
                <div>
                  <CardTitle>طريقة العمل والحدود</CardTitle>
                  <CardDescription className="mt-1">التعليمات الأساسية التي يعود إليها المساعد قبل كل رد.</CardDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFormData({ ...formData, systemInstructions: buildCustomerServiceTemplate(businessName, formData.languagePreference === "ar" ? "ar" : "en") })}
              >
                <Sparkles /> استخدام قالب جاهز
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="system-instructions" className="text-sm font-semibold text-[var(--foreground)]">تعليمات النظام</label>
                <span className="text-xs text-[var(--muted)]">{formData.systemInstructions.length.toLocaleString("ar")} حرف</span>
              </div>
              <Textarea id="system-instructions" rows={10} value={formData.systemInstructions} onChange={(event) => setFormData({ ...formData, systemInstructions: event.target.value })} className="leading-7" />
              <p className="text-xs leading-5 text-[var(--muted)]">اكتبي قواعد واضحة: ما الذي يجيب عنه، متى يصعّد للموظف، وما الذي يجب ألا يخمّنه.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><Languages size={15} /> اللغة المفضلة</label>
                <Select value={formData.languagePreference} onValueChange={(value) => setFormData({ ...formData, languagePreference: value as "ar" | "en" | "auto" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">اكتشاف لغة العميل تلقائياً</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">الإنجليزية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="off-topic" className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><ShieldAlert size={15} /> رد خارج النطاق</label>
                <Textarea id="off-topic" rows={3} value={formData.offTopicResponse} onChange={(event) => setFormData({ ...formData, offTopicResponse: event.target.value })} placeholder="الرد عندما يكون السؤال خارج نشاطك" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[var(--line)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardDescription>اختبار النبرة</CardDescription>
                <CardTitle className="mt-1 flex items-center gap-2"><Eye size={18} /> معاينة مباشرة</CardTitle>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> نشط</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[#f6f7fb]">
              <div className="flex items-center gap-3 bg-[var(--brand)] px-4 py-3 text-white">
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-full)] bg-white/15"><Bot size={17} /></div>
                <div>
                  <p className="text-sm font-bold">{formData.name || "المساعد"}</p>
                  <p className="text-[10px] text-white/75">متصل الآن</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="ms-auto max-w-[85%] rounded-[var(--radius-md)] rounded-se-[4px] bg-white px-3 py-2.5 text-xs leading-5 text-[var(--foreground)] shadow-sm">ما هي ساعات العمل؟</div>
                <div className="max-w-[92%] rounded-[var(--radius-md)] rounded-ss-[4px] bg-[var(--brand)] px-3 py-2.5 text-xs leading-5 text-white shadow-sm">{previewReply(formData.personality)}</div>
              </div>
            </div>

            {error ? <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
            {saved ? <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="size-4" />تم حفظ الإعدادات.</div> : null}

            <div className="dashboard-surface-muted rounded-[var(--radius-md)] p-3 text-xs text-[var(--muted)]">
              <div className="flex items-center justify-between gap-3"><span>الشخصية</span><strong className="text-[var(--foreground)]">{personalities.find((item) => item.value === formData.personality)?.label ?? formData.personality}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3"><span>اللغة</span><strong className="text-[var(--foreground)]">{formData.languagePreference === "auto" ? "تلقائية" : formData.languagePreference === "ar" ? "العربية" : "الإنجليزية"}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3"><span>آخر تحديث</span><strong className="text-[var(--foreground)]">{new Date(aiAgent.updated_at).toLocaleDateString("ar")}</strong></div>
            </div>

            <Button className="w-full" size="lg" onClick={handleSave} disabled={isSaving || !hasChanges || !formData.name.trim()}>
              {isSaving ? <Loader2 className="animate-spin" /> : hasChanges ? <Sparkles /> : <CheckCircle2 />}
              {isSaving ? "جارٍ الحفظ..." : hasChanges ? "حفظ التغييرات" : "الإعدادات محفوظة"}
            </Button>
            {hasChanges ? <p className="text-center text-xs font-medium text-amber-700">لديك تغييرات غير محفوظة</p> : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
