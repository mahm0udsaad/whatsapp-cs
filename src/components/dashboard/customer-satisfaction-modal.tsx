"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CustomerSatisfactionAnalysis,
  SatisfactionAnalysisResponse,
} from "@/lib/customer-satisfaction-types";

interface CustomerSatisfactionModalProps {
  open: boolean;
  conversationId: string | null;
  customerName: string;
  onClose: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "لا توجد رسالة";
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function riskLabel(risk: CustomerSatisfactionAnalysis["risk_level"]) {
  if (risk === "high") return "مخاطر مرتفعة";
  if (risk === "medium") return "يحتاج متابعة";
  return "مستقر";
}

function sentimentLabel(
  sentiment: CustomerSatisfactionAnalysis["sentiment"]
) {
  const labels = {
    positive: "إيجابي",
    neutral: "محايد",
    negative: "سلبي",
    mixed: "مختلط",
  };
  return labels[sentiment];
}

export function CustomerSatisfactionModal({
  open,
  conversationId,
  customerName,
  onClose,
}: CustomerSatisfactionModalProps) {
  const [response, setResponse] =
    useState<SatisfactionAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedForRef = useRef<string | null>(null);

  const runAnalysis = useCallback(
    async (force = false) => {
      if (!conversationId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetch(
          `/api/satisfaction/conversations/${conversationId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force }),
          }
        );
        const body = (await result.json().catch(() => ({}))) as
          | SatisfactionAnalysisResponse
          | { error?: string };
        if (!result.ok || !("analysis" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "تعذّر تحليل رضا العميل."
          );
        }
        setResponse(body);
      } catch (analysisError) {
        setError(
          analysisError instanceof Error
            ? analysisError.message
            : "تعذّر تحليل رضا العميل."
        );
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    if (!open || !conversationId) return;
    if (startedForRef.current === conversationId) return;
    startedForRef.current = conversationId;
    setResponse(null);
    void runAnalysis(false);
  }, [conversationId, open, runAnalysis]);

  useEffect(() => {
    if (!open) startedForRef.current = null;
  }, [open]);

  if (!open) return null;

  const analysis = response?.analysis ?? null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#111d57]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="satisfaction-modal-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] bg-white shadow-2xl sm:rounded-[var(--radius-lg)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-[var(--brand)]">
              <Sparkles size={19} />
            </div>
            <div className="min-w-0">
              <h2
                id="satisfaction-modal-title"
                className="truncate text-base font-bold text-[var(--foreground)]"
              >
                تحليل رضا {customerName}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                تحليل محادثة محفوظ ومدعوم بالأدلة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-[var(--radius-full)] text-[var(--muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-6">
          {loading && !analysis ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <Loader2 className="size-8 animate-spin text-[var(--brand)]" />
              <p className="mt-4 text-sm font-bold text-[var(--foreground)]">
                جارٍ تحليل المحادثة…
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                نراجع الرسائل والطلبات وبيانات الحجوزات المتاحة.
              </p>
            </div>
          ) : error && !analysis ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <AlertTriangle className="size-8 text-rose-600" />
              <p className="mt-4 text-sm font-bold text-[var(--foreground)]">
                لم يكتمل التحليل
              </p>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                {error}
              </p>
              <Button className="mt-5" onClick={() => void runAnalysis(false)}>
                المحاولة مرة أخرى
              </Button>
            </div>
          ) : analysis ? (
            <div className="space-y-5">
              {error ? (
                <div className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  تعذّرت إعادة التحليل، وما زالت النتيجة المحفوظة معروضة: {error}
                </div>
              ) : null}
              <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[#f8f9fc] p-4 sm:flex-row sm:items-center">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-black tabular-nums text-[var(--foreground)]">
                    {analysis.score}
                  </span>
                  <span className="pb-1 text-sm font-bold text-[var(--muted)]">
                    /100
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-[var(--radius-full)] px-3 py-1 text-xs font-bold ${
                        analysis.risk_level === "high"
                          ? "bg-rose-100 text-rose-800"
                          : analysis.risk_level === "medium"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {riskLabel(analysis.risk_level)}
                    </span>
                    <span className="rounded-[var(--radius-full)] border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--foreground)]">
                      الانطباع: {sentimentLabel(analysis.sentiment)}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      ثقة {analysis.confidence}%
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                    {analysis.summary}
                  </p>
                </div>
              </div>

              <div
                className={`rounded-[var(--radius-md)] border px-4 py-3 text-xs leading-6 ${
                  response?.cached
                    ? "border-blue-200 bg-blue-50 text-blue-900"
                    : analysis.analysis_mode === "reanalysis"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  <Clock3 size={15} />
                  {response?.cached
                    ? "نتيجة محفوظة — لا توجد بيانات جديدة منذ هذا التحليل"
                    : analysis.analysis_mode === "reanalysis"
                      ? "إعادة تحليل للبيانات الحالية — لا توجد رسائل واتساب جديدة"
                      : `تحليل جديد شمل ${analysis.new_message_count} رسالة جديدة`}
                </div>
                <p className="mt-1">
                  تم التحليل: {formatDate(analysis.created_at)} · آخر رسالة واتساب: {formatDate(analysis.latest_message_at)}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <AnalysisList
                  title="نقاط إيجابية"
                  items={analysis.strengths}
                  empty="لم تظهر إشارات إيجابية صريحة."
                  icon={<CheckCircle2 size={17} className="text-emerald-600" />}
                />
                <AnalysisList
                  title="مخاوف وملاحظات"
                  items={analysis.concerns}
                  empty="لا توجد مخاوف واضحة في البيانات الحالية."
                  icon={<AlertTriangle size={17} className="text-amber-600" />}
                />
                <AnalysisList
                  title="أسئلة دون إجابة"
                  items={analysis.unanswered_questions}
                  empty="لم يكتشف التحليل أسئلة معلقة."
                  icon={
                    <MessageCircleQuestion size={17} className="text-[var(--brand)]" />
                  }
                />
                <AnalysisList
                  title="الإجراء المقترح"
                  items={analysis.recommended_actions}
                  empty="لا يوجد إجراء عاجل مقترح."
                  icon={<Sparkles size={17} className="text-[var(--brand)]" />}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="رسائل العميل" value={analysis.metrics.customer_messages} />
                <Metric label="رسائل النشاط" value={analysis.metrics.business_messages} />
                <Metric
                  label="متوسط الاستجابة"
                  value={
                    analysis.metrics.median_response_minutes == null
                      ? "—"
                      : `${analysis.metrics.median_response_minutes} د`
                  }
                />
                <Metric label="مخالفات SLA" value={analysis.metrics.sla_breaches} />
              </div>
            </div>
          ) : null}
        </div>

        {analysis ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[#f8f9fc] px-5 py-4">
            <p className="text-xs text-[var(--muted)]">
              واتساب: {analysis.whatsapp_status} · نحجز: {analysis.nehgz_status}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                إغلاق
              </Button>
              <Button
                onClick={() => void runAnalysis(true)}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                إعادة التحليل
              </Button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function AnalysisList({
  title,
  items,
  empty,
  icon,
}: {
  title: string;
  items: string[];
  empty: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--line)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
        {icon}
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-6 text-[var(--muted)]">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-6 text-[var(--muted)]">{empty}</p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-white p-3 text-center">
      <p className="text-lg font-black tabular-nums text-[var(--foreground)]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-[var(--muted)]">{label}</p>
    </div>
  );
}
