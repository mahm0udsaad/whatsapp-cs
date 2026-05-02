"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { findTemplateExample } from "@/lib/template-examples";

const SELECTED_PHONES_STORAGE_KEY = "whatsapp-cs:campaign-prefill-phones";

interface ApprovedTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  body_template: string | null;
  header_type: string | null;
  header_text: string | null;
  footer_text: string | null;
  buttons: Array<Record<string, unknown>> | null;
  variables: string[] | null;
  approval_status: string;
}

interface Draft {
  campaignName: string;
  templateName: string;
  bodyTemplate: string;
  headerType: "none" | "text" | "image";
  headerText: string;
  footerText: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  variables: string[];
  buttons: Array<{
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";
    title: string;
    url?: string;
    phone?: string;
    code?: string;
    id?: string;
  }>;
  imagePrompt?: string;
  /** When set, skip template creation — just create campaign with this id. */
  reuseTemplateId?: string;
}

export default function NewCampaignEditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const exampleSlug = params.get("example");
  const fromTemplateId = params.get("from");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [phones, setPhones] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap the draft from the example or the existing template.
  useEffect(() => {
    if (exampleSlug) {
      const ex = findTemplateExample(exampleSlug);
      if (!ex) {
        setBootstrapError("المثال غير موجود");
        return;
      }
      setDraft({
        campaignName: `${ex.title} — ${new Date().toLocaleDateString("ar")}`,
        templateName: `${ex.slug}-${Date.now().toString(36).slice(-6)}`,
        bodyTemplate: ex.preview.body_template,
        headerType: ex.preview.header_type,
        headerText: ex.preview.header_text ?? "",
        footerText: ex.preview.footer_text ?? "",
        language: ex.language,
        category: ex.category,
        variables: ex.variables,
        buttons: ex.preview.buttons ?? [],
        imagePrompt: ex.preview.image_prompt,
      });
      return;
    }

    if (fromTemplateId) {
      fetch(`/api/marketing/templates`)
        .then((r) => r.json())
        .then((data) => {
          const t = (data.templates as ApprovedTemplate[] | undefined)?.find(
            (x) => x.id === fromTemplateId
          );
          if (!t) {
            setBootstrapError("القالب غير موجود");
            return;
          }
          setDraft({
            campaignName: `${t.name} — ${new Date().toLocaleDateString("ar")}`,
            templateName: t.name,
            bodyTemplate: t.body_template ?? "",
            headerType: (t.header_type as "none" | "text" | "image") ?? "none",
            headerText: t.header_text ?? "",
            footerText: t.footer_text ?? "",
            language: t.language ?? "ar",
            category:
              (t.category as Draft["category"]) ?? "MARKETING",
            variables: t.variables ?? [],
            buttons: (t.buttons as Draft["buttons"]) ?? [],
            reuseTemplateId: t.id,
          });
        })
        .catch(() => setBootstrapError("تعذر تحميل القالب"));
      return;
    }

    setBootstrapError("اختر مثالاً أو قالباً معتمداً أولاً");
  }, [exampleSlug, fromTemplateId]);

  // Pull selected phones (set by customers list).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(SELECTED_PHONES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
        setPhones(parsed as string[]);
      }
    } catch {
      // ignore
    }
  }, []);

  const reusing = !!draft?.reuseTemplateId;

  const canSubmit = useMemo(
    () => draft && draft.campaignName.trim() && draft.bodyTemplate.trim(),
    [draft]
  );

  const submit = async () => {
    if (!draft) return;
    setSubmitting(true);
    setError(null);

    try {
      let templateId = draft.reuseTemplateId;

      if (!templateId) {
        // Create a new template.
        const tplRes = await fetch("/api/marketing/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.templateName.trim(),
            body_template: draft.bodyTemplate,
            header_type: draft.headerType,
            header_text: draft.headerText || null,
            footer_text: draft.footerText || null,
            buttons: draft.buttons,
            variables: draft.variables,
            language: draft.language,
            category: draft.category,
          }),
        });
        const tplJson = await tplRes.json().catch(() => ({}));
        if (!tplRes.ok) throw new Error(tplJson.error || "تعذر إنشاء القالب");
        templateId = tplJson.template?.id;
        if (!templateId) throw new Error("لم يتم إرجاع معرف القالب");

        // Submit for approval immediately.
        await fetch(`/api/marketing/templates/${templateId}/submit`, {
          method: "POST",
        }).catch(() => {});
      }

      // Create the campaign (status will be `draft` because the template might
      // still be pending approval — sending requires `approved`).
      const campRes = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.campaignName.trim(),
          template_id: templateId,
        }),
      });
      const campJson = await campRes.json().catch(() => ({}));
      if (!campRes.ok) throw new Error(campJson.error || "تعذر إنشاء الحملة");

      const campaignId = campJson.campaign?.id;

      // If we have prefilled phones, attach them as recipients via a
      // multipart upload using a constructed CSV blob — the existing
      // /api/marketing/recipients route accepts files. We synthesize a small
      // CSV in memory.
      if (campaignId && phones.length > 0) {
        const csv =
          "phone_number\n" +
          phones.map((p) => p.replace(/[\r\n,]/g, "")).join("\n");
        const fd = new FormData();
        fd.append(
          "file",
          new Blob([csv], { type: "text/csv" }),
          "selected-customers.csv"
        );
        fd.append("campaign_id", campaignId);
        await fetch("/api/marketing/recipients", {
          method: "POST",
          body: fd,
        }).catch(() => {});
      }

      sessionStorage.removeItem(SELECTED_PHONES_STORAGE_KEY);
      router.push("/dashboard/marketing/campaigns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير معروف");
    } finally {
      setSubmitting(false);
    }
  };

  if (bootstrapError) {
    return (
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {bootstrapError}
        </div>
        <div className="mx-auto mt-3 max-w-md text-center">
          <Link
            href="/dashboard/marketing/campaigns/new"
            className="text-sm font-medium text-emerald-700"
          >
            عودة لاختيار قالب
          </Link>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex-1 p-6 text-center text-slate-500">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/marketing/campaigns/new"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            بيانات الحملة
          </h1>
          <p className="text-sm text-slate-500">
            {reusing
              ? "حملة مبنية على قالب معتمد جاهز للإرسال."
              : "حملة جديدة. سيتم إرسال القالب للاعتماد بعد الحفظ."}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-5 p-5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                اسم الحملة
              </label>
              <Input
                value={draft.campaignName}
                onChange={(e) =>
                  setDraft({ ...draft, campaignName: e.target.value })
                }
                className="rounded-xl"
              />
            </div>

            {!reusing && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  اسم القالب (للاستخدام الداخلي)
                </label>
                <Input
                  value={draft.templateName}
                  onChange={(e) =>
                    setDraft({ ...draft, templateName: e.target.value })
                  }
                  className="rounded-xl font-mono text-sm"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                نص الرسالة
              </label>
              <textarea
                value={draft.bodyTemplate}
                onChange={(e) =>
                  setDraft({ ...draft, bodyTemplate: e.target.value })
                }
                className="min-h-32 w-full rounded-xl border border-slate-200 p-3 text-sm leading-7"
                disabled={reusing}
              />
              {draft.variables.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  المتغيرات:{" "}
                  {draft.variables
                    .map((v, i) => `{{${i + 1}}}=${v}`)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  نوع الرأس
                </label>
                <select
                  value={draft.headerType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      headerType: e.target.value as Draft["headerType"],
                    })
                  }
                  disabled={reusing}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="none">بدون</option>
                  <option value="text">نص</option>
                  <option value="image">صورة</option>
                </select>
              </div>
              {draft.headerType === "text" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    نص الرأس
                  </label>
                  <Input
                    value={draft.headerText}
                    onChange={(e) =>
                      setDraft({ ...draft, headerText: e.target.value })
                    }
                    disabled={reusing}
                    className="rounded-xl"
                  />
                </div>
              )}
              {draft.headerType === "image" && draft.imagePrompt && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    اقتراح للصورة
                  </label>
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {draft.imagePrompt}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                التذييل (اختياري)
              </label>
              <Input
                value={draft.footerText}
                onChange={(e) =>
                  setDraft({ ...draft, footerText: e.target.value })
                }
                disabled={reusing}
                className="rounded-xl"
              />
            </div>

            <Button
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {reusing ? "إنشاء الحملة" : "حفظ القالب وإنشاء الحملة"}
              <ArrowRight size={14} />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-950">معاينة</h3>
              <Badge variant="secondary" className="rounded-full">
                {draft.category}
              </Badge>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-800">
              {draft.headerType === "text" && draft.headerText ? (
                <div className="mb-2 text-xs font-bold text-slate-700">
                  {draft.headerText}
                </div>
              ) : null}
              {draft.headerType === "image" ? (
                <div className="mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  صورة في الرأس
                </div>
              ) : null}
              <p className="whitespace-pre-line">{draft.bodyTemplate}</p>
              {draft.footerText ? (
                <p className="mt-2 text-xs text-slate-500">{draft.footerText}</p>
              ) : null}
              {draft.buttons.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.buttons.map((b, i) => (
                    <span
                      key={`${b.type}-${i}`}
                      className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-medium text-emerald-800"
                    >
                      {b.title}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <p>
                <strong>قائمة الاستلام:</strong>{" "}
                {phones.length > 0
                  ? `${phones.length} عميل محدد مسبقاً`
                  : "ستضاف لاحقاً من شاشة الحملة (CSV أو من قائمة العملاء)."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
