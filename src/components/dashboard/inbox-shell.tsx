"use client";

/**
 * Web Inbox – unclaimed escalation queue + per-conversation inspector anchor.
 *
 * Tabs:
 *   1. Unclaimed   – type='escalation' AND assigned_to IS NULL AND status='pending'
 *   2. My claims   – assigned_to = current team_member id, status='pending'
 *   3. All (7d)    – type='escalation' last 7 days (admin/owner view)
 *
 * Realtime:
 *   - Subscribes to postgres_changes on public.orders filtered by restaurant_id.
 *   - On INSERT/UPDATE/DELETE, re-reconciles all three lists from local state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  HandMetal,
  Mail,
  ShieldAlert,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  restaurant_id: string;
  conversation_id: string;
  customer_phone: string;
  customer_name: string | null;
  type: string;
  details: string;
  status: string;
  escalation_reason?: string | null;
  priority?: "normal" | "urgent" | null;
  assigned_to?: string | null;
  ai_draft_reply?: string | null;
  ai_draft_generated_at?: string | null;
  claimed_at?: string | null;
  hanan_escalated_at?: string | null;
  replied_at?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; full_name: string | null } | null;
};

interface InboxShellProps {
  restaurantId: string;
  currentMemberId: string | null;
  currentMemberRole: string | null;
  initialUnclaimed: OrderRow[];
  initialMine: OrderRow[];
  initialAll: OrderRow[];
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length <= 4) return phone;
  return `••• ${digits.slice(-4)}`;
}

function timeSince(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} س`;
  const d = Math.floor(h / 24);
  return `${d} ي`;
}

function reasonStyle(reason?: string | null): {
  label: string;
  className: string;
  icon: typeof AlertTriangle;
} {
  switch (reason) {
    case "knowledge_gap":
      return {
        label: "ثغرة معرفية",
        className: "bg-amber-100 text-amber-800 border-amber-200",
        icon: AlertTriangle,
      };
    case "sensitive":
      return {
        label: "موقف حساس",
        className: "bg-rose-100 text-rose-800 border-rose-200",
        icon: ShieldAlert,
      };
    case "customer_asked_human":
      return {
        label: "العميل طلب موظف",
        className: "bg-blue-100 text-blue-800 border-blue-200",
        icon: HandMetal,
      };
    default:
      return {
        label: reason || "تصعيد",
        className: "bg-slate-100 text-slate-700 border-slate-200",
        icon: Mail,
      };
  }
}

export function InboxShell({
  restaurantId,
  currentMemberId,
  initialUnclaimed,
  initialMine,
  initialAll,
}: InboxShellProps) {
  const router = useRouter();
  const [unclaimed, setUnclaimed] = useState<OrderRow[]>(initialUnclaimed);
  const [mine, setMine] = useState<OrderRow[]>(initialMine);
  const [all, setAll] = useState<OrderRow[]>(initialAll);
  const [toast, setToast] = useState<{ text: string; variant: "info" | "warn" } | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof OrderRow>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Realtime: orders for this tenant → reconcile all three lists.
  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [uRes, mRes, aRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("type", "escalation")
          .is("assigned_to", null)
          .eq("status", "pending")
          .order("priority", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(100),
        currentMemberId
          ? supabase
              .from("orders")
              .select("*")
              .eq("restaurant_id", restaurantId)
              .eq("assigned_to", currentMemberId)
              .in("status", ["pending"])
              .order("created_at", { ascending: true })
              .limit(100)
          : Promise.resolve({ data: [] as OrderRow[] }),
        supabase
          .from("orders")
          .select("*, assignee:team_members!orders_assigned_to_fkey(id, full_name)")
          .eq("restaurant_id", restaurantId)
          .eq("type", "escalation")
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      setUnclaimed((uRes.data || []) as OrderRow[]);
      setMine((mRes.data || []) as OrderRow[]);
      setAll((aRes.data || []) as OrderRow[]);
    }

    const channel = supabase
      .channel(`inbox-orders:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, currentMemberId]);

  const showToast = useCallback((text: string, variant: "info" | "warn" = "info") => {
    setToast({ text, variant });
    const tid = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(tid);
  }, []);

  async function handleClaim(orderId: string) {
    setClaiming(orderId);
    // Optimistically remove from unclaimed.
    const prev = unclaimed;
    setUnclaimed((list) => list.filter((o) => o.id !== orderId));
    try {
      const res = await fetch(`/api/orders/${orderId}/claim`, { method: "POST" });
      if (res.status === 409) {
        showToast("تم استلامها من موظفة أخرى", "warn");
        return;
      }
      if (!res.ok) {
        setUnclaimed(prev); // rollback
        const body = await res.json().catch(() => ({}));
        showToast(`تعذر الاستلام: ${body?.error || res.status}`, "warn");
        return;
      }
      router.push(`/dashboard/inbox/${orderId}`);
    } catch (err) {
      setUnclaimed(prev);
      showToast(
        `تعذر الاستلام: ${err instanceof Error ? err.message : "خطأ غير معروف"}`,
        "warn"
      );
    } finally {
      setClaiming(null);
    }
  }

  const sortedAll = useMemo(() => {
    const list = [...all];
    list.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string | number | null;
      const bv = (b[sortKey] ?? "") as string | number | null;
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      return sortDir === "asc" ? 1 : -1;
    });
    return list;
  }, [all, sortKey, sortDir]);

  function toggleSort(key: keyof OrderRow) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div>
      <div
        aria-live="polite"
        aria-atomic="true"
        role={toast?.variant === "warn" ? "alert" : "status"}
        className="pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto w-fit"
      >
        {toast ? (
          <div
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium shadow-xl",
              toast.variant === "warn"
                ? "bg-amber-600 text-white"
                : "bg-slate-900 text-white"
            )}
          >
            {toast.text}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="unclaimed" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="unclaimed" className="gap-2">
            قائمة غير المستلم
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
              {unclaimed.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="mine" className="gap-2">
            استلاماتي
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
              {mine.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="all">كل التصعيدات (7 أيام)</TabsTrigger>
        </TabsList>

        <TabsContent value="unclaimed">
          {unclaimed.length === 0 ? (
            <EmptyState
              title="لا يوجد تصعيدات بانتظار الاستلام"
              subtitle="سيظهر هنا أي طلب عميل يحتاج تدخل بشري فورًا."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {unclaimed.map((order) => (
                <UnclaimedRow
                  key={order.id}
                  order={order}
                  claiming={claiming === order.id}
                  draftExpanded={expandedDraft === order.id}
                  onToggleDraft={() =>
                    setExpandedDraft((cur) => (cur === order.id ? null : order.id))
                  }
                  onClaim={() => handleClaim(order.id)}
                  onCopy={(text) => {
                    void navigator.clipboard.writeText(text).then(
                      () => showToast("تم نسخ المسودة"),
                      () => showToast("تعذّر النسخ", "warn")
                    );
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine">
          {!currentMemberId ? (
            <EmptyState
              title="أنت لست عضوًا في فريق هذا المتجر"
              subtitle="لا يمكن استلام المحادثات دون حساب موظف نشط."
            />
          ) : mine.length === 0 ? (
            <EmptyState
              title="لا يوجد محادثات باسمك حاليًا"
              subtitle="اذهبي لقسم «قائمة غير المستلم» لاستلام أول محادثة."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {mine.map((order) => (
                <MyClaimRow key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {sortedAll.length === 0 ? (
            <EmptyState
              title="لا يوجد تصعيدات في آخر 7 أيام"
              subtitle="سجل التصعيدات يظهر هنا لتتمكني من الرجوع إليه."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <Th sortKey="customer_name" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>العميل</Th>
                      <Th sortKey={"escalation_reason" as keyof OrderRow} activeKey={sortKey} dir={sortDir} onSort={toggleSort}>
                        السبب
                      </Th>
                      <Th sortKey={"priority" as keyof OrderRow} activeKey={sortKey} dir={sortDir} onSort={toggleSort}>
                        الأولوية
                      </Th>
                      <Th sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>الحالة</Th>
                      <Th>المسؤول</Th>
                      <Th sortKey="created_at" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>أُنشئ</Th>
                      <Th sortKey={"replied_at" as keyof OrderRow} activeKey={sortKey} dir={sortDir} onSort={toggleSort}>أُغلق</Th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAll.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {order.customer_name || maskPhone(order.customer_phone)}
                        </td>
                        <td className="px-3 py-2">
                          <ReasonBadge reason={order.escalation_reason} />
                        </td>
                        <td className="px-3 py-2">
                          {order.priority === "urgent" ? (
                            <Badge className="bg-rose-600 text-white">عاجل</Badge>
                          ) : (
                            <Badge variant="secondary">عادي</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{order.status}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {order.assignee?.full_name || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500 [font-variant-numeric:tabular-nums]">
                          {new Date(order.created_at).toLocaleString("ar", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-3 py-2 text-slate-500 [font-variant-numeric:tabular-nums]">
                          {order.replied_at
                            ? new Date(order.replied_at).toLocaleString("ar", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/dashboard/inbox/${order.id}`}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                          >
                            فتح <ArrowUpRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Th({
  children,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  sortKey?: keyof OrderRow;
  activeKey?: keyof OrderRow;
  dir?: "asc" | "desc";
  onSort?: (k: keyof OrderRow) => void;
}) {
  const sortable = sortKey !== undefined && onSort !== undefined;
  const isActive = sortable && activeKey === sortKey;
  const ariaSort: "ascending" | "descending" | "none" | undefined = sortable
    ? isActive
      ? dir === "asc"
        ? "ascending"
        : "descending"
      : "none"
    : undefined;
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600"
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="inline-flex items-center gap-1 select-none hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        >
          {children}
          {isActive ? (
            <span aria-hidden="true" className="text-slate-400">
              {dir === "asc" ? "↑" : "↓"}
            </span>
          ) : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function ReasonBadge({ reason }: { reason?: string | null }) {
  const s = reasonStyle(reason);
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        s.className
      )}
    >
      <Icon size={12} />
      {s.label}
    </span>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <Mail size={28} className="text-slate-400" aria-hidden="true" />
        <p className="text-base font-semibold text-slate-800">{title}</p>
        <p className="max-w-md text-sm text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function UnclaimedRow({
  order,
  claiming,
  draftExpanded,
  onToggleDraft,
  onClaim,
  onCopy,
}: {
  order: OrderRow;
  claiming: boolean;
  draftExpanded: boolean;
  onToggleDraft: () => void;
  onClaim: () => void;
  onCopy: (text: string) => void;
}) {
  const preview = (order.details || "").slice(0, 80);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <User size={16} className="text-slate-500" aria-hidden="true" />
              <span className="font-semibold text-slate-900">
                {order.customer_name || maskPhone(order.customer_phone)}
              </span>
              <ReasonBadge reason={order.escalation_reason} />
              {order.priority === "urgent" ? (
                <Badge className="bg-rose-600 text-white">عاجل</Badge>
              ) : null}
              {order.hanan_escalated_at ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                  <ArrowUpRight size={12} />
                  تم تنبيه حنان
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                <Clock size={12} />
                {timeSince(order.created_at)}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-700">
              {preview}
              {order.details && order.details.length > 80 ? "…" : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button
              onClick={onClaim}
              disabled={claiming}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {claiming ? "جارٍ الاستلام…" : "استلام المحادثة"}
            </Button>
          </div>
        </div>

        {order.ai_draft_reply ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60">
            <button
              type="button"
              onClick={onToggleDraft}
              aria-expanded={draftExpanded}
              aria-controls={`ai-draft-${order.id}`}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <span className="inline-flex items-center gap-2">
                {draftExpanded ? (
                  <ChevronUp size={14} aria-hidden="true" />
                ) : (
                  <ChevronDown size={14} aria-hidden="true" />
                )}
                معاينة مسودة المساعد الذكي
              </span>
              <span className="text-xs text-slate-500">
                {order.ai_draft_generated_at
                  ? `أُنشئت قبل ${timeSince(order.ai_draft_generated_at)}`
                  : ""}
              </span>
            </button>
            {draftExpanded ? (
              <div id={`ai-draft-${order.id}`} className="border-t border-slate-200 bg-white p-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p
                    className="whitespace-pre-wrap text-sm text-slate-800"
                    dir={/[\u0600-\u06FF]/.test(order.ai_draft_reply) ? "rtl" : "ltr"}
                  >
                    {order.ai_draft_reply}
                  </p>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCopy(order.ai_draft_reply!)}
                  >
                    <Copy size={14} />
                    نسخ
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MyClaimRow({ order }: { order: OrderRow }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <User size={16} className="text-slate-500" aria-hidden="true" />
            <span className="font-semibold text-slate-900">
              {order.customer_name || maskPhone(order.customer_phone)}
            </span>
            <ReasonBadge reason={order.escalation_reason} />
            {order.priority === "urgent" ? (
              <Badge className="bg-rose-600 text-white">عاجل</Badge>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              <Check size={12} />
              مستلمة
              {order.claimed_at ? ` منذ ${timeSince(order.claimed_at)}` : ""}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-slate-700">
            {(order.details || "").slice(0, 140)}
            {order.details && order.details.length > 140 ? "…" : ""}
          </p>
        </div>
        <Link
          href={`/dashboard/inbox/${order.id}`}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          متابعة المحادثة
          <ArrowUpRight size={14} />
        </Link>
      </CardContent>
    </Card>
  );
}
