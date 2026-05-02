"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATE_EXAMPLES, type TemplateExample } from "@/lib/template-examples";

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

type Tab = "curated" | "mine";

const SELECTED_PHONES_STORAGE_KEY = "whatsapp-cs:campaign-prefill-phones";

export default function NewCampaignPickerPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("curated");
  const [mine, setMine] = useState<ApprovedTemplate[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [prefillPhones, setPrefillPhones] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(SELECTED_PHONES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
        setPrefillPhones(parsed as string[]);
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    if (tab !== "mine") return;
    setLoadingMine(true);
    fetch("/api/marketing/templates")
      .then((r) => r.json())
      .then((data) => {
        const all = (data.templates as ApprovedTemplate[]) || [];
        setMine(all.filter((t) => t.approval_status === "approved"));
      })
      .catch(() => setMine([]))
      .finally(() => setLoadingMine(false));
  }, [tab]);

  const goToFillForm = (params: { example?: string; from?: string }) => {
    const search = new URLSearchParams();
    if (params.example) search.set("example", params.example);
    if (params.from) search.set("from", params.from);
    router.push(`/dashboard/marketing/campaigns/new/edit?${search.toString()}`);
  };

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/marketing/campaigns"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            اختر نوع القالب
          </h1>
          <p className="text-sm text-slate-500">
            ابدأ من مثال جاهز أو من قالب معتمد سابق ثم أكمل بياناتك في الخطوة التالية.
          </p>
        </div>
      </div>

      {prefillPhones ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div>
            تم اختيار <strong>{prefillPhones.length}</strong> عميل من قائمة العملاء —
            ستُستخدم كقائمة استلام لهذه الحملة.
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(SELECTED_PHONES_STORAGE_KEY);
              setPrefillPhones(null);
            }}
            className="text-xs font-semibold text-emerald-800 underline"
          >
            إلغاء
          </button>
        </div>
      ) : null}

      <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
        <TabPill
          active={tab === "curated"}
          onClick={() => setTab("curated")}
          label="جاهزة"
          icon={Sparkles}
        />
        <TabPill
          active={tab === "mine"}
          onClick={() => setTab("mine")}
          label="من قوالبك"
          icon={Copy}
        />
      </div>

      {tab === "curated" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_EXAMPLES.map((ex) => (
            <ExampleCard
              key={ex.slug}
              example={ex}
              onPick={() => goToFillForm({ example: ex.slug })}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loadingMine ? (
            <Card>
              <CardContent className="flex items-center justify-center p-10 text-slate-500">
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                جارٍ تحميل القوالب المعتمدة...
              </CardContent>
            </Card>
          ) : mine.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 p-6 text-center">
                <p className="text-sm text-slate-600">
                  لا توجد قوالب معتمدة بعد.
                </p>
                <Link
                  href="/dashboard/marketing/templates/new"
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  إنشاء قالب جديد
                </Link>
              </CardContent>
            </Card>
          ) : (
            mine.map((t) => (
              <ApprovedTemplateCard
                key={t.id}
                template={t}
                onPick={() => goToFillForm({ from: t.id })}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TabPill({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof Sparkles;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "text-slate-700 hover:bg-slate-100"
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function ExampleCard({
  example,
  onPick,
}: {
  example: TemplateExample;
  onPick: () => void;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-950">
              {example.title}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{example.description}</p>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {example.category}
          </Badge>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-7 text-slate-800">
          {example.preview.header_type === "image" ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <ImageIcon size={14} />
              صورة في رأس الرسالة
            </div>
          ) : example.preview.header_type === "text" &&
            example.preview.header_text ? (
            <div className="mb-2 text-xs font-bold text-slate-700">
              {example.preview.header_text}
            </div>
          ) : null}
          <p className="whitespace-pre-line">{example.preview.body_template}</p>
          {example.preview.footer_text ? (
            <p className="mt-2 text-xs text-slate-500">
              {example.preview.footer_text}
            </p>
          ) : null}
          {example.preview.buttons && example.preview.buttons.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {example.preview.buttons.map((b, i) => (
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

        <Button
          onClick={onPick}
          className="mt-auto gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          استخدم هذا المثال
          <ArrowLeft size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}

function ApprovedTemplateCard({
  template,
  onPick,
}: {
  template: ApprovedTemplate;
  onPick: () => void;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-950">
              {template.name}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {template.language.toUpperCase()} · {template.category}
            </p>
          </div>
          <Badge className="rounded-full">معتمد</Badge>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-7 text-slate-800">
          {template.header_type === "text" && template.header_text ? (
            <div className="mb-2 text-xs font-bold text-slate-700">
              {template.header_text}
            </div>
          ) : null}
          <p className="line-clamp-5 whitespace-pre-line">
            {template.body_template ?? "(بدون نص)"}
          </p>
          {template.footer_text ? (
            <p className="mt-2 text-xs text-slate-500">{template.footer_text}</p>
          ) : null}
        </div>

        <Button
          onClick={onPick}
          variant="outline"
          className="mt-auto gap-2 rounded-full"
        >
          أنشئ حملة من هذا القالب
          <ArrowRight size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}
