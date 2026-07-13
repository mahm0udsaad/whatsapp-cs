"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  Inbox,
  Loader2,
  MessageCircleMore,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAuth } from "@/lib/supabase/use-realtime-auth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Filter = "open" | "expired" | "mine" | "unassigned" | "all";

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
  { key: "all", label: "الكل" },
];

function modeBadge(mode: Row["handler_mode"]) {
  if (mode === "unassigned") return { text: "غير مستلمة", variant: "destructive" as const };
  if (mode === "human") return { text: "استلام يدوي", variant: "default" as const };
  return { text: "بوت", variant: "secondary" as const };
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter");
  const initialQuery = searchParams.get("q") ?? "";
  const [filter, setFilter] = useState<Filter>(
    initialFilter === "expired" ||
      initialFilter === "mine" ||
      initialFilter === "unassigned" ||
      initialFilter === "all"
      ? initialFilter
      : "open"
  );
  const [q, setQ] = useState(initialQuery);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [claiming, setClaiming] = useState<"human" | "bot" | null>(null);
  const [handingOff, setHandingOff] = useState<"bot" | "human" | "unassigned" | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selected = rows.find((r) => r.id === selectedId) || null;
  const isMyConversation =
    selected?.handler_mode === "human" && selected?.assigned_to === currentMemberId;

  // Auto-scroll to bottom when messages change or conversation switches.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

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
      setRows((body.conversations as Row[]) ?? []);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "تعذّر تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedId((current) => {
      if (rows.length === 0) return null;
      if (current && rows.some((row) => row.id === current)) return current;
      return rows[0].id;
    });
  }, [rows]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", filter);
    if (q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [filter, pathname, q, router, searchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Realtime — reload list on any conversation change.
  useEffect(() => {
    if (!realtimeReady) return;
    const ch = supabase
      .channel(`inbox-conversations:${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `restaurant_id=eq.${restaurantId}` },
        () => { void loadRef.current(); }
      )
      .subscribe((status, err) => {
        if (err) console.warn("[inbox-conversations] channel error", status, err);
      });
    return () => { void supabase.removeChannel(ch); };
  }, [supabase, restaurantId, realtimeReady]);

  // Load messages + subscribe when a conversation is selected.
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
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

    if (!realtimeReady) return () => { cancelled = true; };

    const ch = supabase
      .channel(`inbox-msgs:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => { setMessages((prev) => [...prev, payload.new as MessageRow]); }
      )
      .subscribe((status, err) => {
        if (err) console.warn("[inbox-msgs] channel error", status, err);
      });
    return () => { cancelled = true; void supabase.removeChannel(ch); };
  }, [supabase, selectedId, realtimeReady]);

  // Claim an unassigned conversation.
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
        setToast(mode === "human" ? "تم الاستلام — يمكنك الرد الآن" : "تم التوكيل للبوت");
        const claimedId = selected.id;
        setRows((prev) =>
          prev.map((r) =>
            r.id === claimedId
              ? { ...r, handler_mode: mode, assigned_to: currentMemberId ?? r.assigned_to }
              : r
          )
        );
        if (filter === "unassigned") setFilter(mode === "human" ? "mine" : "open");
        await load();
      } catch (err) {
        setToast(err instanceof Error ? err.message : "تعذّر الاستلام");
      } finally {
        setClaiming(null);
      }
    },
    [selected, load, filter, currentMemberId]
  );

  // Handoff an already-claimed conversation (stop bot / hand to bot / release).
  const onHandoff = useCallback(
    async (mode: "bot" | "human" | "unassigned") => {
      if (!selected) return;
      setHandingOff(mode);
      try {
        const res = await fetch(`/api/dashboard/inbox/conversations/${selected.id}/handoff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Handoff failed");
        const labels: Record<string, string> = {
          bot: "تم التوكيل للبوت",
          human: "تم الاستلام — يمكنك الرد الآن",
          unassigned: "تم الإفراج عن المحادثة",
        };
        setToast(labels[mode]);
        setRows((prev) =>
          prev.map((r) =>
            r.id === selected.id
              ? {
                  ...r,
                  handler_mode: mode,
                  assigned_to: mode === "human" ? (currentMemberId ?? r.assigned_to) : mode === "unassigned" ? null : r.assigned_to,
                }
              : r
          )
        );
        await load();
      } catch (err) {
        setToast(err instanceof Error ? err.message : "تعذّر تغيير الوضع");
      } finally {
        setHandingOff(null);
      }
    },
    [selected, load, currentMemberId]
  );

  // Send a reply.
  const onSend = useCallback(async () => {
    if (!selected || !replyText.trim() || sending) return;
    const text = replyText.trim();
    setSending(true);
    setReplyText("");
    try {
      const res = await fetch(`/api/dashboard/inbox/conversations/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Send failed");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "تعذّر إرسال الرسالة");
      setReplyText(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [selected, replyText, sending]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void onSend();
      }
    },
    [onSend]
  );

  return (
    <div className="grid min-h-[680px] grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]" dir="rtl">
      {/* Left — conversation list */}
      <aside className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-white shadow-[0_16px_38px_-32px_rgba(17,29,87,0.45)]">
        <div className="border-b border-[var(--line)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--foreground)]">قائمة المحادثات</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{rows.length} محادثة في العرض الحالي</p>
            </div>
            {loading ? <Loader2 className="size-4 animate-spin text-[var(--brand)]" /> : null}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[var(--subtle)]" />
            <label htmlFor="inbox-search" className="sr-only">بحث بالاسم أو الرقم</label>
            <Input
              id="inbox-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث بالاسم أو الرقم"
              name="conversation_search"
              autoComplete="off"
              className="pe-9"
            />
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`shrink-0 rounded-[var(--radius-full)] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.key
                    ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                    : "border-[var(--line)] bg-white text-[var(--muted)] hover:bg-[var(--brand-soft)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="max-h-[680px] overflow-y-auto">
          {loading ? (
            <li className="p-8 text-center text-sm text-[var(--muted)]">جارٍ تحميل المحادثات…</li>
          ) : rows.length === 0 ? (
            <li className="p-10 text-center">
              <Inbox className="mx-auto size-6 text-[var(--subtle)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">لا توجد محادثات</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">جرّب تغيير الفلتر أو عبارة البحث.</p>
            </li>
          ) : (
            rows.map((r) => {
              const mb = modeBadge(r.handler_mode);
              const active = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    aria-pressed={active}
                    className={`relative w-full border-b border-[var(--line)] p-4 text-right transition-colors ${
                      active ? "bg-[var(--brand-soft)]" : "hover:bg-[#f8f9fd]"
                    }`}
                  >
                    {active ? <span className="absolute inset-y-0 start-0 w-1 bg-[var(--brand)]" /> : null}
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-white text-sm font-bold text-[var(--brand)] shadow-sm">
                        {(r.customer_name || r.customer_phone || "ع").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold text-[var(--foreground)]">{r.customer_name || r.customer_phone}</p>
                          <span className="shrink-0 text-[10px] font-medium text-[var(--muted)]">{formatTime(r.last_message_at)}</span>
                        </div>
                        {r.preview ? (
                          <p className="mt-1 line-clamp-1 text-xs leading-5 text-[var(--muted)]">
                            {r.preview_role === "agent" ? <span className="me-1 font-semibold text-[var(--brand)]">{r.handler_mode === "bot" ? "البوت:" : "أنت:"}</span> : null}
                            {r.preview_role === "system" ? <span className="me-1 font-semibold">النظام:</span> : null}
                            {r.preview}
                          </p>
                        ) : null}
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          <Badge variant={mb.variant} className="px-2 py-0.5 text-[10px]">{mb.text}</Badge>
                          {r.is_expired ? <Badge variant="outline" className="px-2 py-0.5 text-[10px]">منتهية</Badge> : null}
                          {r.assignee_name ? <span className="truncate text-[10px] text-[var(--muted)]">{r.assignee_name}</span> : null}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Right — detail panel */}
      <section className="flex min-h-[680px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-white shadow-[0_16px_38px_-32px_rgba(17,29,87,0.45)] lg:max-h-[760px]">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-soft)] text-[var(--brand)]">
              <MessageCircleMore size={24} />
            </div>
            <p className="mt-4 text-sm font-bold text-[var(--foreground)]">اختر محادثة للبدء</p>
            <p className="mt-1 text-sm text-[var(--muted)]">ستظهر الرسائل وإجراءات الاستلام هنا.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white p-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-soft)] font-bold text-[var(--brand)]">
                  {(selected.customer_name || selected.customer_phone || "ع").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-[var(--foreground)]">{selected.customer_name || selected.customer_phone}</h2>
                  <p className="text-xs text-[var(--muted)]" dir="ltr">{selected.customer_phone}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={modeBadge(selected.handler_mode).variant}>
                  {modeBadge(selected.handler_mode).text}
                </Badge>
                {selected.is_expired && <Badge variant="outline">خارج نافذة 24س</Badge>}
                {selected.assignee_name && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]"><UserRound size={12} />{selected.assignee_name}</span>
                )}
              </div>
            </header>

            {/* Message thread */}
            <div className="flex-1 overflow-y-auto bg-[#f8f9fc] p-4 sm:p-6">
              <ul className="space-y-3">
                {messages.length === 0 && (
                  <li className="mt-8 text-center text-sm text-[var(--muted)]">لا توجد رسائل بعد</li>
                )}
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`flex ${m.role === "customer" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[84%] rounded-[var(--radius-lg)] px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[72%] ${
                        m.role === "customer"
                          ? "rounded-se-[4px] border border-[var(--line)] bg-white text-[var(--foreground)]"
                          : m.role === "system"
                          ? "border border-amber-200 bg-amber-50 text-amber-900"
                          : "rounded-ss-[4px] bg-[var(--brand)] text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className="mt-1 text-[10px] opacity-70">{formatTime(m.created_at)}</p>
                    </div>
                  </li>
                ))}
                <div ref={messagesEndRef} />
              </ul>
            </div>

            {/* Footer — actions */}
            <footer className="shrink-0 space-y-3 border-t border-[var(--line)] bg-white p-4 sm:px-5">
              {/* Unassigned: claim buttons */}
              {selected.handler_mode === "unassigned" && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1"
                    disabled={claiming !== null}
                    onClick={() => onClaim("human")}
                  >
                    <UserRound />
                    {claiming === "human" ? "جارٍ…" : "استلام ورد العميل"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={claiming !== null}
                    onClick={() => onClaim("bot")}
                  >
                    <Bot />
                    {claiming === "bot" ? "جارٍ…" : "استلام وتوكيل البوت"}
                  </Button>
                </div>
              )}

              {/* Bot mode: stop bot button */}
              {selected.handler_mode === "bot" && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1"
                    disabled={handingOff !== null}
                    onClick={() => onHandoff("human")}
                  >
                    <UserRound />
                    {handingOff === "human" ? "جارٍ…" : "إيقاف البوت والرد بنفسي"}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={handingOff !== null}
                    onClick={() => onHandoff("unassigned")}
                  >
                    {handingOff === "unassigned" ? "جارٍ…" : "إرجاع للقائمة"}
                  </Button>
                </div>
              )}

              {/* Human mode: reply composer (if this is my conversation) */}
              {selected.handler_mode === "human" && isMyConversation && (
                <>
                  <div className="flex items-end gap-2 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[#f8f9fc] p-2 focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[#20339a]/10">
                    <textarea
                      ref={textareaRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder="اكتب ردك هنا…"
                      rows={2}
                      disabled={sending}
                      className="min-h-12 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--subtle)] focus:outline-none disabled:opacity-60"
                    />
                    <Button
                      onClick={() => void onSend()}
                      disabled={sending || !replyText.trim()}
                      size="icon"
                      className="shrink-0 rounded-[var(--radius-md)]"
                      aria-label="إرسال الرد"
                    >
                      {sending ? <Loader2 className="animate-spin" /> : <Send />}
                    </Button>
                  </div>
                  <p className="px-1 text-[10px] text-[var(--muted)]">Enter للإرسال · Shift + Enter لسطر جديد</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={handingOff !== null}
                      onClick={() => onHandoff("bot")}
                    >
                      <Bot />
                      {handingOff === "bot" ? "جارٍ…" : "تسليم للبوت"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs text-[var(--muted)]"
                      disabled={handingOff !== null}
                      onClick={() => onHandoff("unassigned")}
                    >
                      {handingOff === "unassigned" ? "جارٍ…" : "إرجاع للقائمة"}
                    </Button>
                  </div>
                </>
              )}

              {/* Human mode: read-only info if assigned to someone else */}
              {selected.handler_mode === "human" && !isMyConversation && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--muted)]">
                    مستلمة من {selected.assignee_name ?? "موظف"} — الرد يدوي
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={handingOff !== null}
                    onClick={() => onHandoff("human")}
                  >
                    {handingOff === "human" ? "جارٍ…" : "استلام مني"}
                  </Button>
                </div>
              )}
            </footer>
          </>
        )}
      </section>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--foreground)] px-4 py-2 text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
