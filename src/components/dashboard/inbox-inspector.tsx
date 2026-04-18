"use client";

/**
 * Inbox Inspector – two-pane view for a single escalation.
 *
 * Left pane (60%): message thread + composer.
 * Right pane (40%): sticky sidebar with customer info, AI draft card,
 *                   agent-instructions summary, and "احجز في ركاز" action.
 *
 * Realtime:
 *   - Subscribes to postgres_changes on public.messages filtered by
 *     conversation_id so inbound customer messages stream in while the agent
 *     is still composing.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  Calendar,
  Check,
  ExternalLink,
  Eraser,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { InteractiveReply, Message } from "@/lib/types";
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
  rekaz_booking_url?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; full_name: string | null; user_id: string } | null;
};

type ConversationRow = {
  id: string;
  customer_phone: string;
  customer_name?: string | null;
  last_message_at: string;
};

type InstructionRow = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  version: number;
  created_at: string;
};

interface InspectorProps {
  order: OrderRow;
  conversation: ConversationRow | null;
  initialMessages: Message[];
  instructions: InstructionRow[];
  rekazBookingUrl: string;
  currentMemberId: string | null;
  currentMemberRole: string | null;
  isOwner: boolean;
  canSend: boolean;
}

export function InboxInspector({
  order,
  conversation,
  initialMessages,
  instructions,
  rekazBookingUrl,
  isOwner,
  canSend,
}: InspectorProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draftVisible, setDraftVisible] = useState<boolean>(
    Boolean(order.ai_draft_reply)
  );
  const [composerText, setComposerText] = useState("");
  const [copiedFromDraft, setCopiedFromDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Local object URL for image previews — revoke on unmount / swap.
  useEffect(() => {
    if (!pendingFile || !pendingFile.type.startsWith("image/")) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  // Realtime: messages in this conversation.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inspector-messages:${order.conversation_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${order.conversation_id}`,
        },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as Message;
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order.conversation_id]);

  // Auto-scroll thread on new messages.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    // Reset the input so selecting the same file twice re-triggers change.
    e.target.value = "";
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setSendErr("الملف أكبر من 20MB");
      return;
    }
    setSendErr(null);
    setPendingFile(f);
  }

  function removePendingFile() {
    setPendingFile(null);
  }

  async function handleSend() {
    const text = composerText.trim();
    if (!text && !pendingFile) return;
    if (!canSend) {
      setSendErr("غير مخوّلة بالإرسال — يجب استلام المحادثة أولًا.");
      return;
    }
    setSending(true);
    setSendErr(null);
    try {
      let attachment:
        | {
            storagePath: string;
            contentType: string;
            sizeBytes?: number;
            originalFilename?: string;
          }
        | undefined;
      if (pendingFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", pendingFile);
        const upRes = await fetch(`/api/dashboard/inbox/${order.id}/upload`, {
          method: "POST",
          body: fd,
        });
        if (!upRes.ok) {
          const body = await upRes.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${upRes.status}`);
        }
        const upBody = await upRes.json();
        attachment = {
          storagePath: upBody.storagePath,
          contentType: upBody.contentType,
          sizeBytes: upBody.sizeBytes,
          originalFilename: upBody.originalFilename || undefined,
        };
        setUploading(false);
      }

      const res = await fetch(`/api/dashboard/inbox/${order.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, attachment }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setComposerText("");
      setPendingFile(null);
      setCopiedFromDraft(false);
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : "تعذّر الإرسال");
    } finally {
      setUploading(false);
      setSending(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const escalationLabel = useMemo(() => {
    switch (order.escalation_reason) {
      case "knowledge_gap":
        return { label: "ثغرة معرفية", tone: "bg-amber-100 text-amber-800" };
      case "sensitive":
        return { label: "موقف حساس", tone: "bg-rose-100 text-rose-800" };
      case "customer_asked_human":
        return { label: "العميل طلب موظف", tone: "bg-blue-100 text-blue-800" };
      default:
        return { label: order.escalation_reason || "تصعيد", tone: "bg-slate-100 text-slate-800" };
    }
  }, [order.escalation_reason]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
      {/* LEFT: thread + composer */}
      <div className="lg:col-span-6">
        <Card className="flex h-[calc(100vh-11rem)] flex-col overflow-hidden">
          <CardHeader className="border-b py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {conversation?.customer_name ||
                    order.customer_name ||
                    order.customer_phone}
                </CardTitle>
                <p className="mt-1 text-xs text-slate-500">
                  {order.customer_phone} •{" "}
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px]", escalationLabel.tone)}>
                    {escalationLabel.label}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {order.status === "replied" ? (
                  <Badge className="bg-emerald-100 text-emerald-800">تم الرد</Badge>
                ) : null}
                {order.assignee?.full_name ? (
                  <Badge variant="secondary" className="gap-1">
                    <User size={12} /> {order.assignee.full_name}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>

          <div
            ref={threadRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="سجل المحادثة"
            className="flex-1 space-y-3 overflow-y-auto bg-[#0e1713]/[0.02] p-4"
          >
            {messages.length === 0 ? (
              <p className="mt-8 text-center text-sm text-slate-500">
                لا توجد رسائل في هذه المحادثة بعد.
              </p>
            ) : null}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} orderId={order.id} />
            ))}
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            {!canSend ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {order.assigned_to
                  ? "هذه المحادثة مستلمة من موظفة أخرى. يمكنك القراءة فقط."
                  : "استلمي المحادثة أولًا للتمكن من الرد."}
              </p>
            ) : null}
            {pendingFile ? (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                {pendingPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pendingPreviewUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <FileText size={28} className="text-slate-500" />
                )}
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-medium text-slate-800">
                    {pendingFile.name}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {formatFileSize(pendingFile.size)} · {pendingFile.type || "ملف"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removePendingFile}
                  disabled={sending}
                  className="rounded-full p-1 hover:bg-slate-200"
                  aria-label="إزالة المرفق"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ) : null}
            <label htmlFor={`composer-${order.id}`} className="sr-only">
              نص الرد
            </label>
            <Textarea
              id={`composer-${order.id}`}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder={pendingFile ? "تعليق (اختياري)…" : "اكتبي الرد…"}
              className="min-h-[92px]"
              dir="rtl"
              disabled={!canSend || sending}
            />
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/*,audio/*,application/pdf,video/*"
              onChange={onFileChange}
            />
            {copiedFromDraft ? (
              <p className="mt-1 text-[11px] text-slate-500">
                تم نسخ المسودة. عدّليها قبل الإرسال.
              </p>
            ) : null}
            <p
              role="alert"
              aria-live="assertive"
              className={cn("mt-1 text-xs text-rose-700", !sendErr && "sr-only")}
            >
              {sendErr ?? ""}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pickFile}
                  disabled={!canSend || sending}
                  aria-label="إرفاق ملف"
                >
                  <Paperclip size={14} aria-hidden="true" />
                </Button>
                <p className="text-xs text-slate-500">
                  سيتم إيقاف رد المساعد الذكي على هذه المحادثة.
                </p>
              </div>
              <Button
                onClick={handleSend}
                disabled={
                  !canSend ||
                  sending ||
                  (!composerText.trim() && !pendingFile)
                }
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {uploading ? "جارٍ الرفع…" : "جارٍ الإرسال…"}
                  </>
                ) : (
                  "إرسال عبر واتساب"
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* RIGHT: inspector */}
      <div className="lg:col-span-4">
        <div className="sticky top-4 flex flex-col gap-3">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User size={14} /> العميل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-sm">
              <p className="font-semibold text-slate-900">
                {conversation?.customer_name || order.customer_name || "بدون اسم"}
              </p>
              <p className="text-slate-700">{order.customer_phone}</p>
              <p className="text-xs text-slate-500">
                أُنشئ الطلب: {new Date(order.created_at).toLocaleString("ar")}
              </p>
              {order.claimed_at ? (
                <p className="text-xs text-emerald-700">
                  تم الاستلام: {new Date(order.claimed_at).toLocaleString("ar")}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {draftVisible && order.ai_draft_reply ? (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles size={14} className="text-emerald-700" />
                  مسودة المساعد الذكي
                </CardTitle>
                {order.ai_draft_generated_at ? (
                  <p className="text-[11px] text-slate-500">
                    {new Date(order.ai_draft_generated_at).toLocaleString("ar")}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-md border border-emerald-200 bg-white p-3">
                  <p
                    className="whitespace-pre-wrap text-sm text-slate-800"
                    dir={/[\u0600-\u06FF]/.test(order.ai_draft_reply) ? "rtl" : "ltr"}
                  >
                    {order.ai_draft_reply}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={!canSend}
                    onClick={() => {
                      setComposerText(order.ai_draft_reply || "");
                      setCopiedFromDraft(true);
                    }}
                  >
                    <Check size={14} />
                    استخدم هذه الصيغة
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDraftVisible(false)}
                  >
                    <Eraser size={14} />
                    تجاهل
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <BookMarked size={14} aria-hidden="true" />
                  تعليمات المساعد (الأحدث)
                </span>
                <button
                  type="button"
                  onClick={() => setShowInstructions((v) => !v)}
                  aria-expanded={showInstructions}
                  aria-controls={`instructions-panel-${order.id}`}
                  className="text-xs text-slate-600 hover:text-slate-900"
                >
                  {showInstructions ? "إخفاء" : "عرض"}
                </button>
              </CardTitle>
            </CardHeader>
            {showInstructions ? (
              <CardContent
                id={`instructions-panel-${order.id}`}
                className="space-y-3 pt-0"
              >
                {instructions.length === 0 ? (
                  <p className="text-sm text-slate-500">لا توجد تعليمات نشطة بعد.</p>
                ) : (
                  instructions.map((ins) => (
                    <div
                      key={ins.id}
                      className="rounded-md border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          {ins.title}
                        </p>
                        <span className="text-[10px] text-slate-500">
                          v{ins.version}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs text-slate-700">
                        {ins.body}
                      </p>
                      {ins.tags && ins.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {ins.tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 py-4">
              <a
                href={rekazBookingUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Calendar size={14} />
                احجز في ركاز
                <ExternalLink size={12} />
              </a>
              {isOwner ? (
                <p className="text-[11px] text-slate-500">
                  يفتح في تبويب جديد. بعد الحجز ارجعي هنا وأكملي الرد.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

type MediaSlot = {
  storage_path: string | null;
  content_type: string;
  size_bytes: number | null;
  twilio_url?: string;
  original_filename?: string | null;
  delivery_status?: string;
  caption?: string | null;
};

function MessageBubble({
  message,
  orderId,
}: {
  message: Message;
  orderId: string;
}) {
  const isCustomer = message.role === "customer";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] text-slate-600">
          {message.content}
        </div>
      </div>
    );
  }

  const bubbleColor = isCustomer
    ? "bg-white border border-slate-200 text-slate-900"
    : "bg-emerald-600 text-white";

  // Outbound interactive (list / quick-reply we sent).
  if (message.message_type === "interactive" && message.metadata) {
    const meta = message.metadata as { interactive?: InteractiveReply };
    const interactive = meta.interactive;
    if (interactive && interactive.type !== "text") {
      const isList = interactive.type === "list";
      const entries = isList
        ? interactive.items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
          }))
        : interactive.options.map((o) => ({
            id: o.id,
            title: o.title,
            description: undefined as string | undefined,
          }));
      return (
        <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
          <div
            className={cn(
              "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
              bubbleColor
            )}
            dir={/[\u0600-\u06FF]/.test(interactive.body) ? "rtl" : "ltr"}
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
              {isList ? `قائمة · ${interactive.button}` : "أزرار"}
            </p>
            <p className="whitespace-pre-wrap">{interactive.body}</p>
            <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[12px] opacity-90">
              {entries.map((e) => (
                <li key={e.id}>
                  {e.title}
                  {e.description ? ` — ${e.description}` : ""}
                </li>
              ))}
            </ul>
            <MetaFooter message={message} />
          </div>
        </div>
      );
    }
  }

  // Inbound interactive reply (customer tapped a button / list item).
  if (message.message_type === "interactive_reply" && message.metadata) {
    const meta = message.metadata as {
      tap?: { id: string; title: string | null };
    };
    const tap = meta.tap;
    if (tap) {
      return (
        <div className="flex justify-start">
          <div
            className={cn(
              "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
              bubbleColor
            )}
          >
            <p className="italic">
              → اختار العميل: <span className="not-italic font-medium">{tap.title || tap.id}</span>
            </p>
            <MetaFooter message={message} />
          </div>
        </div>
      );
    }
  }

  const mediaMessageTypes = new Set([
    "image",
    "audio",
    "voice",
    "video",
    "document",
    "file",
  ]);
  if (mediaMessageTypes.has(message.message_type) && message.metadata) {
    const meta = message.metadata as { media?: MediaSlot[] };
    const slots = meta.media || [];
    if (slots.length > 0) {
      return (
        <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
          <div
            className={cn(
              "max-w-[75%] space-y-2 rounded-2xl px-3 py-2 text-sm shadow-sm",
              bubbleColor
            )}
            dir={/[\u0600-\u06FF]/.test(message.content || "") ? "rtl" : "ltr"}
          >
            {slots.map((slot, idx) => (
              <MediaSlotView
                key={`${message.id}-m${idx}`}
                slot={slot}
                orderId={orderId}
                messageType={message.message_type}
              />
            ))}
            {message.content ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : null}
            <MetaFooter message={message} />
          </div>
        </div>
      );
    }
  }

  return (
    <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          bubbleColor
        )}
        dir={/[\u0600-\u06FF]/.test(message.content || "") ? "rtl" : "ltr"}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <MetaFooter message={message} />
      </div>
    </div>
  );
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes.toLocaleString("ar")} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

function MediaSlotView({
  slot,
  orderId,
  messageType,
}: {
  slot: MediaSlot;
  orderId: string;
  messageType: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slot.storage_path) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/inbox/${orderId}/media?path=${encodeURIComponent(
            slot.storage_path!
          )}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) setUrl(body.url);
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "تعذّر تحميل الملف");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slot.storage_path, orderId]);

  if (slot.delivery_status === "too_large") {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
        ملف كبير لم يتم تحميله. {formatBytes(slot.size_bytes || 0)}
      </div>
    );
  }

  if (!slot.storage_path) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-800">
        تعذّر تخزين الملف. {slot.content_type}
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-800">
        {err}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-black/5 px-2 py-1 text-xs">
        <Loader2 size={12} className="animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  if (messageType === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={slot.original_filename || "صورة"}
          width={640}
          height={256}
          loading="lazy"
          className="max-h-64 max-w-full rounded-lg object-contain"
        />
      </a>
    );
  }

  if (messageType === "voice" || messageType === "audio") {
    return (
      <div className="flex items-center gap-2">
        {messageType === "voice" ? (
          <Mic size={14} className="flex-shrink-0 opacity-70" />
        ) : null}
        <audio controls src={url} className="max-w-full" />
      </div>
    );
  }

  if (messageType === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={url}
        width={400}
        height={300}
        className="max-h-[300px] max-w-full rounded-lg"
      />
    );
  }

  // document / file
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-2 rounded-md border border-current/20 bg-black/5 px-2 py-1 text-xs"
    >
      <FileText size={14} />
      <span className="truncate max-w-[200px]">
        {slot.original_filename || slot.content_type || "ملف"}
      </span>
      {slot.size_bytes ? (
        <span className="opacity-70">{formatBytes(slot.size_bytes)}</span>
      ) : null}
      <ExternalLink size={12} />
    </a>
  );
}

function MetaFooter({ message }: { message: Message }) {
  const status = message.delivery_status || message.twilio_status;
  return (
    <p className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-70">
      <span>{new Date(message.created_at).toLocaleTimeString("ar")}</span>
      {status ? <span>{deliveryStatusLabel(status)}</span> : null}
    </p>
  );
}

function deliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "في قائمة الإرسال",
    sent: "مرسلة",
    delivered: "تم التسليم",
    read: "تمت القراءة",
    failed: "فشلت",
    undelivered: "لم يتم التسليم",
  };
  return labels[status] || status;
}
