"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, MessageSquare, Calendar, HelpCircle, Clock, User, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

interface OrdersListProps {
  orders: Order[];
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function StatusBadge({ status }: { status: Order["status"] }) {
  const map: Record<Order["status"], { label: string; class: string }> = {
    pending:   { label: "قيد الانتظار",   class: "bg-amber-100 text-amber-800" },
    confirmed: { label: "مؤكد", class: "bg-emerald-100 text-emerald-800" },
    rejected:  { label: "مرفوض",  class: "bg-red-100 text-red-700" },
    replied:   { label: "تم الرد",   class: "bg-sky-100 text-sky-800" },
  };
  const { label, class: cls } = map[status];
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {label}
    </span>
  );
}

function OrderCard({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [replyText, setReplyText] = useState("");
  const [localStatus, setLocalStatus] = useState(order.status);
  const [error, setError] = useState("");

  const isReservation = order.type === "reservation";
  const isActable = localStatus === "pending";

  async function respond(action: "confirm" | "reject" | "reply") {
    setError("");
    startTransition(async () => {
      const body: Record<string, string> = { action };
      if (note.trim()) body.admin_note = note.trim();
      if (replyText.trim()) body.admin_reply = replyText.trim();

      const res = await fetch(`/api/dashboard/orders/${order.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError("تعذر إرسال الرد. حاول مرة أخرى.");
        return;
      }

      setLocalStatus(action === "confirm" ? "confirmed" : action === "reject" ? "rejected" : "replied");
      setNote("");
      setReplyText("");
    });
  }

  return (
    <div className={cn(
      "rounded-[24px] border bg-white/80 p-5 shadow-sm transition-all",
      localStatus === "pending" ? "border-amber-200" : "border-slate-200/70"
    )}>
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
          isReservation ? "bg-emerald-500/12 text-emerald-700" : "bg-sky-500/12 text-sky-700"
        )}>
          {isReservation ? <Calendar size={18} /> : <HelpCircle size={18} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              {isReservation ? "طلب حجز" : "تصعيد"}
            </span>
            <StatusBadge status={localStatus} />
          </div>

          <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-500">
            {order.customer_name && (
              <span className="inline-flex items-center gap-1">
                <User size={11} /> {order.customer_name}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Phone size={11} /> {order.customer_phone}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> {formatDate(order.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 rounded-[16px] border border-slate-100 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
        {order.details}
      </div>

      {/* Admin note if already handled */}
      {order.admin_reply && localStatus !== "pending" && (
        <div className="mt-3 rounded-[16px] border border-emerald-100 bg-emerald-50/70 p-3 text-sm text-emerald-900">
          <span className="font-medium">تم الإرسال: </span>{order.admin_reply}
        </div>
      )}

      {/* Action panel — only for pending */}
      {isActable && (
        <div className="mt-4 space-y-3">
          {/* Optional custom reply / note */}
          <textarea
            value={isReservation ? note : replyText}
            onChange={(e) =>
              isReservation ? setNote(e.target.value) : setReplyText(e.target.value)
            }
            placeholder={
              isReservation
                ? "ملاحظة اختيارية تضاف مع التأكيد، مثل التاريخ والوقت..."
                : "الرد الذي تريد إرساله للعميل..."
            }
            rows={2}
            className="w-full rounded-[14px] border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {isReservation ? (
              <>
                <button
                  onClick={() => respond("confirm")}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} />
                  تأكيد الحجز
                </button>
                <button
                  onClick={() => respond("reject")}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  <XCircle size={15} />
                  رفض
                </button>
              </>
            ) : (
              <button
                onClick={() => respond("reply")}
                disabled={isPending || !replyText.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                <MessageSquare size={15} />
                إرسال الرد على واتساب
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrdersList({ orders }: OrdersListProps) {
  const pending = orders.filter((o) => o.status === "pending");
  const done    = orders.filter((o) => o.status !== "pending");

  if (orders.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center text-sm text-slate-500">
        لا توجد طلبات أو تصعيدات بعد. ستظهر هنا عندما يطلب العملاء حجزاً أو يسألون عن شيء لا يستطيع المساعد الإجابة عنه.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            تحتاج إجراء ({pending.length})
          </h2>
          {pending.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            تم التعامل معها ({done.length})
          </h2>
          {done.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </section>
      )}
    </div>
  );
}
