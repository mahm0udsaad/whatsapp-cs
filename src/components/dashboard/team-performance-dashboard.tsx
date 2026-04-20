"use client";

/**
 * Team Performance dashboard (web). Owner-only.
 *
 * Wraps the `/api/mobile/team/performance` endpoints (same contract on web
 * since the session cookie works for both surfaces). Features:
 *   - Period filter: today / this week / this month / last month / custom
 *   - Sortable table across agents
 *   - CSV export of the current view
 *   - Drill-down drawer: sparkline, heatmap, notes, goals
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface TeamPerformanceRow {
  team_member_id: string;
  full_name: string | null;
  role: "admin" | "agent";
  is_active: boolean;
  is_available: boolean;
  messages_sent: number;
  conversations_handled: number;
  active_now: number;
  first_response_p50_sec: number;
  first_response_p90_sec: number;
  reply_latency_p50_sec: number;
  takeovers_from_bot: number;
  reassigns_received: number;
  reassigns_given: number;
  sla_breaches: number;
  labels_applied: number;
  approx_hours_worked: number;
}

interface TeamPerformanceResponse {
  from: string;
  to: string;
  rows: TeamPerformanceRow[];
}

interface AgentDaily {
  day: string;
  messages: number;
  conversations: number;
  p50_reply_sec: number;
}

interface AgentHeat {
  weekday: number;
  hour: number;
  messages: number;
}

interface AgentDetail {
  from: string;
  to: string;
  daily: AgentDaily[];
  heatmap: AgentHeat[];
}

interface NoteRow {
  id: string;
  body: string;
  author_user_id: string | null;
  created_at: string;
}

interface GoalsRow {
  team_member_id: string;
  target_first_response_sec: number | null;
  target_messages_per_day: number | null;
  updated_at: string;
}

type PeriodKey = "today" | "week" | "month" | "last_month" | "custom";

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function rangeFor(key: PeriodKey, custom?: { from: string; to: string }) {
  const now = new Date();
  if (key === "today") {
    const from = startOfUtcDay(now);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString(), label: "اليوم" };
  }
  if (key === "week") {
    // Saturday start (weekStartsOn: 6 in mobile; UTC-approximated here).
    const d = new Date(now);
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const delta = (day - 6 + 7) % 7;
    const from = startOfUtcDay(new Date(d.getTime() - delta * 86400_000));
    const to = new Date(from.getTime() + 7 * 86400_000);
    return { from: from.toISOString(), to: to.toISOString(), label: "هذا الأسبوع" };
  }
  if (key === "month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from: from.toISOString(), to: to.toISOString(), label: "هذا الشهر" };
  }
  if (key === "last_month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: from.toISOString(), to: to.toISOString(), label: "الشهر الماضي" };
  }
  const from = custom?.from ?? "";
  const to = custom?.to ?? "";
  return {
    from: from ? new Date(from).toISOString() : "",
    to: to ? new Date(to).toISOString() : "",
    label: "مخصص",
  };
}

function formatSeconds(s: number | null | undefined): string {
  if (!s) return "—";
  if (s < 60) return `${s}ث`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}س ${rem}د` : `${h} س`;
}

type SortKey =
  | "full_name"
  | "messages_sent"
  | "conversations_handled"
  | "first_response_p50_sec"
  | "first_response_p90_sec"
  | "reply_latency_p50_sec"
  | "sla_breaches"
  | "takeovers_from_bot"
  | "labels_applied"
  | "approx_hours_worked";

export function TeamPerformanceDashboard() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const range = useMemo(() => {
    if (period === "custom") {
      return rangeFor("custom", { from: customFrom, to: customTo });
    }
    return rangeFor(period);
  }, [period, customFrom, customTo]);

  const [data, setData] = useState<TeamPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("messages_sent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<TeamPerformanceRow | null>(null);

  useEffect(() => {
    if (!range.from || !range.to) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({ from: range.from, to: range.to });
    fetch(`/api/mobile/team/performance?${q.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((j: TeamPerformanceResponse) => {
        if (!cancelled) setData(j);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "تعذّر التحميل");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an = Number(av ?? 0);
      const bn = Number(bv ?? 0);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          messages: acc.messages + r.messages_sent,
          conversations: acc.conversations + r.conversations_handled,
          breaches: acc.breaches + r.sla_breaches,
          hours: acc.hours + Number(r.approx_hours_worked ?? 0),
        }),
        { messages: 0, conversations: 0, breaches: 0, hours: 0 }
      ),
    [rows]
  );

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function downloadCsv() {
    const headers = [
      "team_member_id",
      "full_name",
      "role",
      "messages_sent",
      "conversations_handled",
      "active_now",
      "first_response_p50_sec",
      "first_response_p90_sec",
      "reply_latency_p50_sec",
      "takeovers_from_bot",
      "reassigns_received",
      "reassigns_given",
      "sla_breaches",
      "labels_applied",
      "approx_hours_worked",
    ];
    const rowsOut = sortedRows.map((r) =>
      headers
        .map((h) => {
          const v = (r as unknown as Record<string, unknown>)[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    );
    const csv = [headers.join(","), ...rowsOut].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fromDate = range.from.slice(0, 10);
    const toDate = range.to.slice(0, 10);
    a.download = `team-performance_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const periodChips: { key: PeriodKey; label: string }[] = [
    { key: "today", label: "اليوم" },
    { key: "week", label: "هذا الأسبوع" },
    { key: "month", label: "هذا الشهر" },
    { key: "last_month", label: "الشهر الماضي" },
    { key: "custom", label: "مخصص" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>أداء الفريق</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {periodChips.map((c) => (
              <button
                key={c.key}
                onClick={() => setPeriod(c.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  period === c.key
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {c.label}
              </button>
            ))}
            {period === "custom" ? (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-40"
                />
                <span className="text-gray-400">—</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-40"
                />
              </div>
            ) : null}
            <div className="ms-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCsv}
                disabled={rows.length === 0}
              >
                <Download className="h-4 w-4 me-1" /> CSV
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Summary label="إجمالي الرسائل" value={totals.messages} />
            <Summary label="محادثات مخدومة" value={totals.conversations} />
            <Summary
              label="تجاوز SLA"
              value={totals.breaches}
              tone={totals.breaches > 0 ? "warn" : undefined}
            />
            <Summary
              label="ساعات الفريق"
              value={`~${totals.hours.toFixed(1)}`}
            />
          </div>

          {err ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {err}
            </div>
          ) : null}

          <p className="text-xs text-gray-500">
            &quot;الرد المعتاد&quot; = الوقت الذي يستغرقه الرد في معظم المحادثات.{" "}
            &quot;أبطأ رد&quot; = في أسوأ ١٠٪ من الحالات.
          </p>

          {/* Table */}
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <Th label="الموظف" k="full_name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="رسائل" k="messages_sent" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="محادثات" k="conversations_handled" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="الرد المعتاد" k="first_response_p50_sec" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="أبطأ رد" k="first_response_p90_sec" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="سرعة الرد" k="reply_latency_p50_sec" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="تجاوز SLA" k="sla_breaches" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="من بوت" k="takeovers_from_bot" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="تسميات" k="labels_applied" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="ساعات" k="approx_hours_worked" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-gray-500">
                      جار التحميل...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-gray-500">
                      لا توجد بيانات في هذه الفترة.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr
                      key={r.team_member_id}
                      onClick={() => setSelected(r)}
                      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {r.is_available ? (
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-gray-300" />
                          )}
                          <span className="font-medium text-gray-900">
                            {r.full_name ?? "—"}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {r.role === "admin" ? "مدير" : "موظف"}
                          </Badge>
                          {!r.is_active ? (
                            <Badge variant="outline" className="text-[10px] text-gray-500">
                              غير نشط
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.messages_sent}</td>
                      <td className="px-3 py-2 tabular-nums">{r.conversations_handled}</td>
                      <td className="px-3 py-2 tabular-nums">{formatSeconds(r.first_response_p50_sec)}</td>
                      <td
                        className={`px-3 py-2 tabular-nums ${
                          r.first_response_p90_sec > 600 ? "text-amber-800" : ""
                        }`}
                      >
                        {formatSeconds(r.first_response_p90_sec)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatSeconds(r.reply_latency_p50_sec)}</td>
                      <td
                        className={`px-3 py-2 tabular-nums ${
                          r.sla_breaches > 0 ? "text-red-700" : ""
                        }`}
                      >
                        {r.sla_breaches}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.takeovers_from_bot}</td>
                      <td className="px-3 py-2 tabular-nums">{r.labels_applied}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.approx_hours_worked > 0
                          ? `~${Number(r.approx_hours_worked).toFixed(1)}`
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <AgentDetailDrawer
          row={selected}
          range={range}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        tone === "warn"
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div
        className={`text-lg font-bold tabular-nums ${
          tone === "warn" ? "text-amber-900" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Th({
  label,
  k,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  k: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = activeKey === k;
  return (
    <th className="px-3 py-2 text-start font-medium">
      <button
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Drill-down drawer
// ---------------------------------------------------------------------------

function AgentDetailDrawer({
  row,
  range,
  onClose,
}: {
  row: TeamPerformanceRow;
  range: { from: string; to: string; label: string };
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [goals, setGoals] = useState<GoalsRow | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [goalFrt, setGoalFrt] = useState("");
  const [goalMpd, setGoalMpd] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    const q = new URLSearchParams({ from: range.from, to: range.to });
    fetch(
      `/api/mobile/team/performance/${row.team_member_id}?${q.toString()}`
    )
      .then((r) => r.json())
      .then((j) => !cancelled && setDetail(j))
      .finally(() => !cancelled && setDetailLoading(false));

    fetch(`/api/mobile/team/members/${row.team_member_id}/notes`)
      .then((r) => r.json())
      .then((j) => !cancelled && setNotes(Array.isArray(j) ? j : []));

    fetch(`/api/mobile/team/members/${row.team_member_id}/goals`)
      .then((r) => r.json())
      .then((j: GoalsRow | null) => {
        if (cancelled) return;
        setGoals(j);
        setGoalFrt(
          j?.target_first_response_sec
            ? String(j.target_first_response_sec)
            : ""
        );
        setGoalMpd(
          j?.target_messages_per_day ? String(j.target_messages_per_day) : ""
        );
      });
    return () => {
      cancelled = true;
    };
  }, [row.team_member_id, range.from, range.to]);

  async function submitNote() {
    const body = noteDraft.trim();
    if (!body) return;
    const res = await fetch(
      `/api/mobile/team/members/${row.team_member_id}/notes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }
    );
    if (res.ok) {
      const n = (await res.json()) as NoteRow;
      setNotes((prev) => [n, ...prev]);
      setNoteDraft("");
    }
  }

  async function deleteNote(id: string) {
    if (!confirm("سيتم الحذف نهائياً. متابعة؟")) return;
    const res = await fetch(
      `/api/mobile/team/members/${row.team_member_id}/notes/${id}`,
      { method: "DELETE" }
    );
    if (res.ok) setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function saveGoals() {
    const res = await fetch(
      `/api/mobile/team/members/${row.team_member_id}/goals`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_first_response_sec: goalFrt ? Number(goalFrt) : null,
          target_messages_per_day: goalMpd ? Number(goalMpd) : null,
        }),
      }
    );
    if (res.ok) setGoals(await res.json());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {row.full_name ?? "موظف"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {range.label} · {row.role === "admin" ? "مدير" : "موظف"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* KPI grid */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Mini label="الرد الأول المعتاد" value={formatSeconds(row.first_response_p50_sec)} />
          <Mini
            label="أبطأ رد أول"
            value={formatSeconds(row.first_response_p90_sec)}
            tone={row.first_response_p90_sec > 600 ? "warn" : undefined}
          />
          <Mini label="سرعة الرد" value={formatSeconds(row.reply_latency_p50_sec)} />
          <Mini label="رسائل" value={row.messages_sent} />
          <Mini label="محادثات" value={row.conversations_handled} />
          <Mini label="نشطة الآن" value={row.active_now} />
          <Mini label="استلام من بوت" value={row.takeovers_from_bot} />
          <Mini label="أعيدت إليه" value={row.reassigns_received} />
          <Mini label="أعاد توزيعها" value={row.reassigns_given} />
          <Mini
            label="تجاوز SLA"
            value={row.sla_breaches}
            tone={row.sla_breaches > 0 ? "warn" : undefined}
          />
          <Mini label="تسميات" value={row.labels_applied} />
          <Mini
            label="ساعات"
            value={
              row.approx_hours_worked > 0
                ? `~${Number(row.approx_hours_worked).toFixed(1)}`
                : "—"
            }
          />
        </div>

        {/* Sparkline */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900">النشاط اليومي</h3>
          {detailLoading ? (
            <p className="mt-2 text-xs text-gray-500">جار التحميل...</p>
          ) : (
            <Sparkline daily={detail?.daily ?? []} />
          )}
        </section>

        {/* Heatmap */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900">ساعات النشاط</h3>
          {detailLoading ? (
            <p className="mt-2 text-xs text-gray-500">جار التحميل...</p>
          ) : (
            <Heatmap cells={detail?.heatmap ?? []} />
          )}
        </section>

        {/* Goals */}
        <section className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-semibold text-gray-900">الأهداف</h3>
          <p className="mt-1 text-[11px] text-gray-500">
            اتركي الحقل فارغاً لإلغاء الهدف.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">رد أولي (ثانية)</label>
              <Input
                type="number"
                value={goalFrt}
                onChange={(e) => setGoalFrt(e.target.value)}
                placeholder="180"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">رسائل/يوم</label>
              <Input
                type="number"
                value={goalMpd}
                onChange={(e) => setGoalMpd(e.target.value)}
                placeholder="50"
                className="mt-1"
              />
            </div>
          </div>
          <Button size="sm" onClick={saveGoals} className="mt-3">
            حفظ الأهداف
          </Button>
          {goals?.updated_at ? (
            <p className="mt-2 text-[10px] text-gray-400">
              آخر تحديث: {new Date(goals.updated_at).toLocaleString("ar-EG")}
            </p>
          ) : null}
        </section>

        {/* Notes */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900">ملاحظات المدير</h3>
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="اكتبي ملاحظة خاصة..."
              rows={3}
              maxLength={4000}
            />
            <Button
              size="sm"
              onClick={submitNote}
              disabled={noteDraft.trim().length === 0}
              className="mt-2"
            >
              إضافة ملاحظة
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {notes.length === 0 ? (
              <p className="text-xs text-gray-500">لا توجد ملاحظات بعد.</p>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between rounded-lg border border-gray-100 bg-white p-3"
                >
                  <div>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">
                      {n.body}
                    </p>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(n.created_at).toLocaleString("ar-EG")}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="ms-2 rounded p-1 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        tone === "warn"
          ? "border-amber-200 bg-amber-50"
          : "border-gray-100 bg-gray-50"
      }`}
    >
      <div
        className={`text-base font-bold tabular-nums ${
          tone === "warn" ? "text-amber-900" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}

function Sparkline({ daily }: { daily: AgentDaily[] }) {
  if (daily.length === 0)
    return <p className="mt-2 text-xs text-gray-500">لا يوجد نشاط.</p>;
  const max = Math.max(1, ...daily.map((d) => d.messages));
  return (
    <div className="mt-2 rounded-lg border border-gray-100 bg-white p-3">
      <div className="flex items-end gap-[3px]" style={{ height: 80 }}>
        {daily.map((d) => {
          const h = Math.max(2, (d.messages / max) * 72);
          return (
            <div key={d.day} className="flex-1" title={`${d.day}: ${d.messages}`}>
              <div
                style={{ height: h }}
                className="w-full rounded-[2px] bg-emerald-400"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
        <span>{daily[0].day}</span>
        <span>{daily[daily.length - 1].day}</span>
      </div>
    </div>
  );
}

function Heatmap({ cells }: { cells: AgentHeat[] }) {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const c of cells) {
    matrix[c.weekday][c.hour] = c.messages;
    if (c.messages > max) max = c.messages;
  }
  if (max === 0)
    return <p className="mt-2 text-xs text-gray-500">لا يوجد نشاط.</p>;
  const dayNames = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100 bg-white p-2">
      <div className="min-w-[560px]">
        {matrix.map((row, wd) => (
          <div key={wd} className="flex items-center">
            <div className="w-12 text-right text-[10px] text-gray-500">
              {dayNames[wd]}
            </div>
            <div className="flex">
              {row.map((n, h) => {
                const intensity = n / max;
                const opacity = intensity === 0 ? 0.04 : 0.1 + intensity * 0.9;
                return (
                  <div
                    key={h}
                    title={`${dayNames[wd]} ${h}:00 — ${n} رسالة`}
                    style={{
                      width: 16,
                      height: 16,
                      margin: 1,
                      borderRadius: 2,
                      backgroundColor: `rgba(0,168,132,${opacity})`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="mt-1 flex justify-between text-[10px] text-gray-400" style={{ paddingLeft: 48 }}>
          <span>0</span>
          <span>12</span>
          <span>23</span>
        </div>
      </div>
    </div>
  );
}
