"use client";

/**
 * Unified conversations inbox for the dashboard.
 *
 * Tabs (left column):
 *   - Open       — last_inbound_at within 24h
 *   - Expired    — last_inbound_at older than 24h (WhatsApp session closed)
 *   - Mine       — assigned to the current team member
 *   - Unassigned — handler_mode = 'unassigned'
 *
 * Detail panel (right column):
 *   - Message thread.
 *   - If handler_mode === 'unassigned': two Arabic claim buttons calling
 *     /api/dashboard/inbox/claim with mode='human' or mode='bot'.
 *   - Otherwise: banner with current assignee + mode.
 *
 * Realtime: subscribes to conversations + messages filtered by restaurant.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAuth } from "@/lib/supabase/use-realtime-auth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Filter = "open" | "expired" | "mine" | "unassigned";

type Row = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  status: string;
  last_message_at: string;
  last_inbound_at: string | null;
  handler_mode: "unassigned" | "human" | "bot";
  assigned_to: string | null;
  assignee_name: string | null;
  preview: string | null;
  preview_role: "customer" | "agent" | "system" | null;
  is_expired: boolean;
};

type MessageRow = {
  id: string;
  role: "customer" | "agent" | "system";
  content: string;
  message_type: string;
  created_at: string;
};

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "open", label: "مفتوحة (24س)" },
  { key: "expired", label: "منتهية" },
  { key: "mine", label: "ملفاتي" },
  { key: "unassigned", label: "غير مستلمة" },
];

function modeBadge(mode: Row["handler_mode"]) {
  if (mode === "unassigned") return { text: "غير مستلمة", variant: "destructive" as const };
  if (mode === "human") return { text: "استلام يدوي", variant: "default" as const };
  return { text: "بوت بتوكيل", variant: "secondary" as const };
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMin = (Date.now() - d.getTime()) / 60_000;
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `${Math.floor(diffMin)} د`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} س`;
  return d.toLocaleDateString();
}

export function ConversationsInboxShell({
  restaurantId,
  currentMemberId,
}: {
  restaurantId: string;
  currentMemberId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ready: realtimeReady } = useRealtimeAuth(supabase);
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [claiming, setClaiming] = useState<"human" | "bot" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const selected = rows.find((r) => r.id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/dashboard/inbox/conversations?${params.toString()}`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load");
      const next = (body.conversations as Row[]) ?? [];
      setRows(next);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "تعذّر تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    void load();
    // Reload whenever filter/q changes.
  }, [load]);

  // Auto-select first row once loaded.
  useEffect(() => {
    if (!selectedId && rows.length > 0) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  // Hold a stable ref to `load` so the realtime effect below doesn't
  // tear down the websocket subscription on every keystroke / filter change.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Realtime — reload list on any conversation change in this tenant.
  useEffect(() => {
    if (!realtimeReady) return;
    const ch = supabase
      .channel(`inbox-conversations:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void loadRef.current();
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn("[inbox-conversations] channel error", status, err);
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, restaurantId, realtimeReady]);

  // Load messages when a conversation is selected; subscribe to new ones.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, role, content, message_type, created_at")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled) setMessages((data as MessageRow[]) ?? []);
    })();

    if (!realtimeReady) {
      return () => {
        cancelled = true;
      };
    }

    const ch = supabase
      .channel(`inbox-msgs:${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as MessageRow]);
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn("[inbox-msgs] channel error", status, err);
      });
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [supabase, selectedId, realtimeReady]);

  const onClaim = useCallback(
    async (mode: "human" | "bot") => {
      if (!selected) return;
      setClaiming(mode);
      try {
        const res = await fetch("/api/dashboard/inbox/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: selected.id, mode }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Claim failed");
        setToast(
          mode === "human"
            ? "تم الاستلام — يمكنك الرد الآن"
            : "تم التوكيل للبوت"
        );
        // Optimistic update so the right pane reflects the new handler_mode
        // immediately — no waiting for the refetch round trip.
        const claimedId = selected.id;
        setRows((prev) =>
          prev.map((r) =>
            r.id === claimedId
              ? {
                  ...r,
                  handler_mode: mode,
                  assigned_to: currentMemberId ?? r.assigned_to,
                }
              : r
          )
        );
        // Switch to a tab where the claimed conversation will stay visible,
        // so the user sees clear confirmation instead of the row vanishing
        // from the `unassigned` list.
        if (filter === "unassigned") {
          setFilter(mode === "human" ? "mine" : "open");
        }
        await load();
      } catch (err) {
        setToast(err instanceof Error ? err.message : "تعذّر الاستلام");
      } finally {
        setClaiming(null);
      }
    },
    [selected, load, filter, currentMemberId]
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]" dir="rtl">
      {/* Left — list */}
      <aside className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === f.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو الرقم"
          />
        </div>
        <ul className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <li className="p-6 text-center text-sm text-slate-500">جارٍ التحميل…</li>
          ) : rows.length === 0 ? (
            <li className="p-6 text-center text-sm text-slate-500">لا توجد محادثات</li>
          ) : (
            rows.map((r) => {
              const mb = modeBadge(r.handler_mode);
              const active = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full border-b border-slate-100 p-3 text-right transition ${
                      active ? "bg-slate-50" : "hover:bg-slate-50/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {r.customer_name || r.customer_phone}
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {formatTime(r.last_message_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={mb.variant}>{mb.text}</Badge>
                      {r.is_expired && <Badge variant="outline">منتهية</Badge>}
                      {r.assignee_name && (
                        <span className="truncate text-[11px] text-slate-500">
                          {r.assignee_name}
                        </span>
                      )}
                    </div>
                    {r.preview && (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                        {r.preview_role === "agent" && (
                          <span className="ml-1 font-medium text-emerald-600">
                            {r.handler_mode === "bot" ? "البوت:" : "أنت:"}
                          </span>
                        )}
                        {r.preview_role === "system" && (
                          <span className="ml-1 font-medium text-slate-400">النظام:</span>
                        )}
                        {r.preview}
                      </p>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Right — detail */}
      <section className="flex flex-col rounded-2xl border border-slate-200 bg-white">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
            اختر محادثة من القائمة
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
              <div>
                <div className="text-base font-semibold text-slate-900">
                  {selected.customer_name || selected.customer_phone}
                </div>
                <div className="text-xs text-slate-500">{selected.customer_phone}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={modeBadge(selected.handler_mode).variant}>
                  {modeBadge(selected.handler_mode).text}
                </Badge>
                {selected.is_expired && <Badge variant="outline">خارج نافذة 24س</Badge>}
                {selected.assignee_name && (
                  <span className="text-xs text-slate-600">{selected.assignee_name}</span>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-2">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`flex ${m.role === "customer" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.role === "customer"
                          ? "bg-slate-100 text-slate-900"
                          : m.role === "system"
                          ? "bg-amber-50 text-amber-900"
                          : "bg-emerald-600 text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className="mt-1 text-[10px] opacity-70">{formatTime(m.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <footer className="border-t border-slate-100 p-4">
              {selected.handler_mode === "unassigned" ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1"
                    disabled={claiming !== null}
                    onClick={() => onClaim("human")}
                  >
                    {claiming === "human" ? "جارٍ…" : "استلام ورد العميل"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={claiming !== null}
                    onClick={() => onClaim("bot")}
                  >
                    {claiming === "bot" ? "جارٍ…" : "استلام وتوكيل البوت"}
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  {selected.handler_mode === "human"
                    ? `مستلمة من ${selected.assignee_name ?? "موظف"} — الرد يدوي`
                    : `موكلة للبوت عبر ${selected.assignee_name ?? "موظف"}`}
                  {selected.assigned_to === currentMemberId && selected.handler_mode === "human" && (
                    <span className="ms-2 text-emerald-700">— أنتِ المسؤولة</span>
                  )}
                </div>
              )}
            </footer>
          </>
        )}
      </section>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
          onAnimationEnd={() => setToast(null)}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
