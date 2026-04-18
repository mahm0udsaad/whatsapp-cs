"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Edit3,
  MessageSquarePlus,
  Save,
  Send,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ThreadSummary {
  id: string;
  title: string | null;
  status: string;
  last_message_at: string | null;
  created_at: string;
}

interface ChatMessage {
  id: string;
  role: "owner" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Instruction {
  id: string;
  version: number;
  title: string;
  body: string;
  tags: string[] | null;
  status: string;
  authored_via: string;
  source_thread_id: string | null;
  created_at: string;
}

interface AiManagerChatProps {
  initialThreads: ThreadSummary[];
  initialInstructions: Instruction[];
  businessName: string;
}

interface Toast {
  id: number;
  text: string;
  tone: "success" | "error";
}

const OWNER_COLOR =
  "bg-gradient-to-br from-emerald-500/95 to-emerald-600/95 text-white";
const ASSISTANT_COLOR = "bg-white text-slate-900 border border-slate-200";

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diffSec = Math.round((Date.now() - d) / 1000);
  if (diffSec < 60) return "قبل لحظات";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `قبل ${min} دقيقة`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `قبل ${hr} ساعة`;
  const day = Math.round(hr / 24);
  if (day < 30) return `قبل ${day} يوم`;
  return new Date(iso).toLocaleDateString("ar");
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ar", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AiManagerChat({
  initialThreads,
  initialInstructions,
  businessName,
}: AiManagerChatProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialThreads[0]?.id ?? null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [instructions, setInstructions] =
    useState<Instruction[]>(initialInstructions);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    body: string;
    tags: string;
  }>({ title: "", body: "", tags: "" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeCount = useMemo(
    () => instructions.filter((r) => r.status === "active").length,
    [instructions]
  );

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inst of instructions) {
      if (inst.status !== "active") continue;
      for (const tag of inst.tags ?? []) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    return map;
  }, [instructions]);

  const pushToast = useCallback(
    (text: string, tone: Toast["tone"] = "success") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, text, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3800);
    },
    []
  );

  // Load messages when thread changes
  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    fetch(`/api/dashboard/ai-manager/threads/${selectedThreadId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.messages)) {
          setMessages(data.messages as ChatMessage[]);
        } else {
          setMessages([]);
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId]);

  // Auto-scroll to bottom on message changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, messagesLoading]);

  const refreshInstructions = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/ai-manager/instructions");
      const data = await res.json();
      if (Array.isArray(data.instructions)) {
        setInstructions(data.instructions as Instruction[]);
      }
    } catch {
      // silent
    }
  }, []);

  const createThread = useCallback(async () => {
    const res = await fetch("/api/dashboard/ai-manager/threads", {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      pushToast(data.error ?? "تعذر إنشاء محادثة", "error");
      return;
    }
    const thread = data.thread as ThreadSummary;
    setThreads((prev) => [thread, ...prev]);
    setSelectedThreadId(thread.id);
    setMessages([]);
  }, [pushToast]);

  const sendMessage = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const content = composer.trim();
      if (!content || sending) return;

      let threadId = selectedThreadId;
      if (!threadId) {
        const res = await fetch("/api/dashboard/ai-manager/threads", {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          pushToast(data.error ?? "تعذر إنشاء محادثة", "error");
          return;
        }
        const thread = data.thread as ThreadSummary;
        setThreads((prev) => [thread, ...prev]);
        threadId = thread.id;
        setSelectedThreadId(thread.id);
      }

      setSending(true);
      // Optimistic owner bubble
      const optimistic: ChatMessage = {
        id: `tmp-${Date.now()}`,
        role: "owner",
        content,
        metadata: {},
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setComposer("");

      try {
        const res = await fetch(
          `/api/dashboard/ai-manager/threads/${threadId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          pushToast(data.error ?? "تعذر إرسال الرسالة", "error");
          // Roll back optimistic
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setComposer(content);
          return;
        }

        // Replace optimistic with real owner row + append assistant
        setMessages((prev) => {
          const withoutTmp = prev.filter((m) => m.id !== optimistic.id);
          const next = [...withoutTmp];
          if (data.ownerMessage) next.push(data.ownerMessage as ChatMessage);
          if (data.assistantMessage)
            next.push(data.assistantMessage as ChatMessage);
          return next;
        });

        // Bump thread ordering
        setThreads((prev) => {
          const updated = prev.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  last_message_at: new Date().toISOString(),
                  title:
                    t.title ??
                    (data.ownerMessage as { content?: string })?.content?.slice(
                      0,
                      40
                    ) ??
                    null,
                }
              : t
          );
          // Move to top
          updated.sort((a, b) => {
            const aT = a.last_message_at ?? a.created_at;
            const bT = b.last_message_at ?? b.created_at;
            return new Date(bT).getTime() - new Date(aT).getTime();
          });
          return updated;
        });

        // Toasts for emitted rules
        const emitted = Array.isArray(data.emittedInstructions)
          ? (data.emittedInstructions as Array<{
              id: string;
              version: number;
              title: string;
            }>)
          : [];
        if (emitted.length > 0) {
          for (const rule of emitted) {
            pushToast(`تمت إضافة قاعدة جديدة #${rule.version} ✅`);
          }
          refreshInstructions();
        }
      } catch {
        pushToast("عذراً، انقطع الاتصال", "error");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setComposer(content);
      } finally {
        setSending(false);
      }
    },
    [composer, sending, selectedThreadId, pushToast, refreshInstructions]
  );

  const startEdit = (rule: Instruction) => {
    setEditingId(rule.id);
    setEditDraft({
      title: rule.title,
      body: rule.body,
      tags: (rule.tags ?? []).join("، "),
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const payload = {
      title: editDraft.title.trim(),
      content_body: editDraft.body.trim(),
      tags: editDraft.tags
        .split(/[،,]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };
    const res = await fetch(
      `/api/dashboard/ai-manager/instructions/${editingId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      pushToast(data.error ?? "تعذر الحفظ", "error");
      return;
    }
    setInstructions((prev) =>
      prev.map((r) =>
        r.id === editingId ? ({ ...r, ...data.instruction } as Instruction) : r
      )
    );
    setEditingId(null);
    pushToast("تم حفظ التعديل ✅");
  };

  const archiveRule = async (ruleId: string) => {
    const res = await fetch(
      `/api/dashboard/ai-manager/instructions/${ruleId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      pushToast(data.error ?? "تعذر الأرشفة", "error");
      return;
    }
    setInstructions((prev) =>
      prev.map((r) =>
        r.id === ruleId ? ({ ...r, status: "archived" } as Instruction) : r
      )
    );
    pushToast("تمت أرشفة القاعدة");
  };

  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  return (
    <div className="relative">
      {/* Top banner: active instructions counter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-200/70 bg-emerald-50/60 px-5 py-3 text-sm text-emerald-900">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-emerald-600" aria-hidden="true" />
          <span className="font-semibold">
            التعليمات النشطة: {activeCount}
          </span>
          <span className="text-emerald-700/70">
            — تسري فوراً على كل المحادثات الجديدة لـ {businessName}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSheetOpen(true)}
        >
          عرض كل التعليمات
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* LEFT (chat pane) — on RTL this sits on the left, thread list on the right */}
        <div className="order-2 flex min-h-[640px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm lg:order-1">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {selectedThread?.title ??
                  (selectedThreadId ? "محادثة جديدة" : "ابدئي محادثة")}
              </p>
              {selectedThread?.last_message_at ? (
                <p className="text-xs text-slate-500">
                  آخر نشاط: {formatRelative(selectedThread.last_message_at)}
                </p>
              ) : null}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-5"
            style={{ maxHeight: "62vh" }}
          >
            {selectedThreadId === null ? (
              <EmptyState />
            ) : messagesLoading ? (
              <p className="text-center text-sm text-slate-400">
                يتم تحميل الرسائل…
              </p>
            ) : messages.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
              </ul>
            )}
          </div>

          <form
            onSubmit={sendMessage}
            className="border-t border-slate-100 bg-slate-50/60 px-4 py-3"
          >
            <label htmlFor="ai-manager-composer" className="sr-only">
              رسالة إلى مدرب الذكاء
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                id="ai-manager-composer"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="اكتبي للمساعد — مثلاً: لما يسأل عن أسعار، قولي…"
                rows={2}
                dir="rtl"
                disabled={sending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    sendMessage(e as unknown as FormEvent);
                  }
                }}
                className="flex-1"
              />
              <Button type="submit" disabled={sending || !composer.trim()}>
                <Send size={16} aria-hidden="true" />
                {sending ? "يرسل…" : "إرسال"}
              </Button>
            </div>
          </form>
        </div>

        {/* RIGHT (thread list) */}
        <aside className="order-1 flex flex-col gap-3 lg:order-2">
          <Button
            type="button"
            variant="default"
            onClick={createThread}
            className="justify-center"
          >
            <MessageSquarePlus size={16} aria-hidden="true" />
            محادثة جديدة +
          </Button>
          <div className="flex flex-col gap-2 overflow-y-auto rounded-3xl border border-slate-200 bg-white/85 p-2 shadow-sm">
            {threads.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-500">
                لا توجد محادثات بعد.
              </p>
            ) : (
              threads.map((t) => {
                const active = t.id === selectedThreadId;
                const title =
                  t.title ??
                  `محادثة جديدة — ${new Date(t.created_at).toLocaleDateString("ar")}`;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedThreadId(t.id)}
                    className={cn(
                      "rounded-2xl px-3 py-3 text-right transition-colors",
                      active
                        ? "bg-emerald-600 text-white shadow-md"
                        : "bg-white text-slate-800 hover:bg-slate-50 border border-slate-100"
                    )}
                  >
                    <p className="line-clamp-1 text-sm font-semibold">
                      {title}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        active ? "text-white/80" : "text-slate-500"
                      )}
                    >
                      {formatRelative(t.last_message_at ?? t.created_at)}
                      {t.status === "archived" ? " — مؤرشفة" : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* Side sheet: active instructions */}
      {sheetOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => {
            setSheetOpen(false);
            setEditingId(null);
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-manager-instructions-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setSheetOpen(false);
                setEditingId(null);
              }
            }}
            className="fixed inset-y-0 start-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl focus:outline-none"
            dir="rtl"
          >
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2
                  id="ai-manager-instructions-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  التعليمات ({instructions.length})
                </h2>
                <p className="text-xs text-slate-500">
                  النشطة: {activeCount} — المؤرشفة:{" "}
                  {instructions.filter((r) => r.status === "archived").length}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                onClick={() => {
                  setSheetOpen(false);
                  setEditingId(null);
                }}
                aria-label="إغلاق"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {tagCounts.size > 0 ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  {Array.from(tagCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([tag, count]) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 px-2 py-1"
                      >
                        <Tag size={12} aria-hidden="true" />
                        {tag}
                        <span className="text-[10px] text-slate-500">
                          نشطة ({count})
                        </span>
                      </Badge>
                    ))}
                </div>
              ) : null}
              <ul className="space-y-3">
                {instructions.map((rule) => {
                  const isEditing = editingId === rule.id;
                  return (
                    <li
                      key={rule.id}
                      className={cn(
                        "rounded-2xl border p-4 transition-colors",
                        rule.status === "active"
                          ? "border-emerald-200 bg-emerald-50/40"
                          : "border-slate-200 bg-slate-50/70 opacity-80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <Input
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  title: e.target.value,
                                }))
                              }
                              aria-label="عنوان التعليمة"
                              className="mb-2"
                            />
                          ) : (
                            <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                              #{rule.version} — {rule.title}
                            </p>
                          )}
                          {isEditing ? (
                            <Textarea
                              value={editDraft.body}
                              rows={4}
                              aria-label="نص التعليمة"
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  body: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                              {rule.body}
                            </p>
                          )}
                          {isEditing ? (
                            <Input
                              className="mt-2"
                              placeholder="وسوم مفصولة بفاصلة، مثل: حجز، أسعار…"
                              aria-label="وسوم التعليمة"
                              value={editDraft.tags}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  tags: e.target.value,
                                }))
                              }
                            />
                          ) : (rule.tags ?? []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(rule.tags ?? []).map((t) => (
                                <Badge
                                  key={t}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <p className="mt-2 text-[11px] text-slate-500">
                            {rule.authored_via === "ai_manager"
                              ? "صدرت من مدرب الذكاء"
                              : "أُضيفت يدوياً"}{" "}
                            — {new Date(rule.created_at).toLocaleString("ar")}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={saveEdit}
                              >
                                <Save size={14} aria-hidden="true" />
                                حفظ
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(null)}
                              >
                                إلغاء
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(rule)}
                              >
                                <Edit3 size={14} aria-hidden="true" />
                                تعديل
                              </Button>
                              {rule.status === "active" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => archiveRule(rule.id)}
                                >
                                  <Archive size={14} aria-hidden="true" />
                                  أرشفة
                                </Button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {instructions.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    لا توجد تعليمات بعد — ابدئي بتعليم المدرب.
                  </li>
                ) : null}
              </ul>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Toasts */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-6 end-6 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg",
              t.tone === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      <p className="text-base font-semibold text-slate-800">
        اكتبي أي قاعدة تبين موظفة الذكاء تتبعها —
      </p>
      <p className="mt-2 text-sm text-slate-600">
        مثلاً: &quot;إذا الزبونة طلبت حجز بعد الإفطار، قدّمي لها فترات المساء
        فقط.&quot;
      </p>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isOwner = msg.role === "owner";
  const emitted = Array.isArray(
    (msg.metadata as { emitted_instructions?: unknown } | null)
      ?.emitted_instructions
  )
    ? ((msg.metadata as { emitted_instructions: unknown[] })
        .emitted_instructions as Array<{
        id: string;
        version: number;
        title: string;
      }>)
    : [];
  const errorText = (msg.metadata as { error?: string } | null)?.error;

  return (
    <li className={cn("flex", isOwner ? "justify-start" : "justify-end")}>
      <div className="flex max-w-[80%] flex-col gap-1">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isOwner ? OWNER_COLOR : ASSISTANT_COLOR
          )}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        {emitted.length > 0 ? (
          <div
            className={cn(
              "flex flex-wrap gap-1 text-[11px]",
              isOwner ? "justify-start" : "justify-end"
            )}
          >
            {emitted.map((rule) => (
              <Badge key={rule.id} variant="default">
                تعليمة #{rule.version} — {rule.title.slice(0, 32)}
              </Badge>
            ))}
          </div>
        ) : null}
        {errorText ? (
          <p className="text-[10px] text-red-500" dir="ltr">
            {errorText}
          </p>
        ) : null}
        <p
          className={cn(
            "text-[10px] text-slate-400",
            isOwner ? "text-start" : "text-end"
          )}
        >
          {formatTime(msg.created_at)}
        </p>
      </div>
    </li>
  );
}
