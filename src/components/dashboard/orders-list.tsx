"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Inbox,
  Loader2,
  MessageSquare,
  Phone,
  UserRound,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const map: Record<Order["status"], { label: string; className: string }> = {
    pending: {
      label: "يحتاج إجراء",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    confirmed: {
      label: "تم التأكيد",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    rejected: {
      label: "مرفوض",
      className: "border-red-200 bg-red-50 text-red-700",
    },
    replied: {
      label: "تم الرد",
      className: "border-sky-200 bg-sky-50 text-sky-800",
    },
  };
  const item = map[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-full)] border px-2.5 py-1 text-xs font-semibold",
        item.className
      )}
    >
      {item.label}
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

      setLocalStatus(
        action === "confirm"
          ? "confirmed"
          : action === "reject"
            ? "rejected"
            : "replied"
      );
      setNote("");
      setReplyText("");
    });
  }

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[0_14px_36px_-30px_rgba(17,29,87,0.45)]",
        isActable ? "border-amber-200" : "border-[var(--line)]"
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 start-0 w-1",
          isActable ? "bg-amber-500" : "bg-[var(--brand)]/25"
        )}
        aria-hidden="true"
      />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border",
              isReservation
                ? "border-[#20339a]/15 bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-amber-200 bg-amber-50 text-amber-800"
            )}
          >
            {isReservation ? <CalendarDays size={19} /> : <CircleHelp size={19} />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[var(--foreground)]">
                {isReservation ? "طلب حجز" : "تصعيد يحتاج متابعة"}
              </h3>
              <StatusBadge status={localStatus} />
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
              {order.customer_name ? (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound size={12} /> {order.customer_name}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Phone size={12} /> <span dir="ltr">{order.customer_phone}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={12} /> {formatDate(order.created_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="dashboard-surface-muted mt-5 flex-1 rounded-[var(--radius-md)] p-4">
          <p className="mb-1.5 text-xs font-bold text-[var(--brand)]">
            {isReservation ? "تفاصيل الحجز" : "سبب التصعيد"}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
            {order.details}
          </p>
        </div>

        {order.admin_reply && !isActable ? (
          <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">الرد المرسل: </span>
              {order.admin_reply}
            </p>
          </div>
        ) : null}

        {isActable ? (
          <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-4">
            <label className="sr-only" htmlFor={`order-reply-${order.id}`}>
              {isReservation ? "ملاحظة الحجز" : "الرد على العميل"}
            </label>
            <textarea
              id={`order-reply-${order.id}`}
              value={isReservation ? note : replyText}
              onChange={(event) =>
                isReservation
                  ? setNote(event.target.value)
                  : setReplyText(event.target.value)
              }
              placeholder={
                isReservation
                  ? "ملاحظة اختيارية، مثل التاريخ والوقت المؤكد..."
                  : "اكتب الرد الذي سيصل للعميل على واتساب..."
              }
              rows={3}
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--subtle)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[#20339a]/15"
            />

            {error ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-700">
                <AlertCircle size={13} /> {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              {isReservation ? (
                <>
                  <Button
                    onClick={() => respond("confirm")}
                    disabled={isPending}
                    className="flex-1"
                  >
                    {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    تأكيد الحجز
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => respond("reject")}
                    disabled={isPending}
                    className="flex-1 border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50"
                  >
                    <XCircle />
                    رفض
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => respond("reply")}
                  disabled={isPending || !replyText.trim()}
                  className="w-full"
                >
                  {isPending ? <Loader2 className="animate-spin" /> : <MessageSquare />}
                  إرسال الرد على واتساب
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function OrdersList({ orders }: OrdersListProps) {
  const pending = orders.filter((order) => order.status === "pending");
  const done = orders.filter((order) => order.status !== "pending");

  if (orders.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line)] bg-white p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-soft)] text-[var(--brand)]">
          <Inbox size={20} />
        </div>
        <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">
          لا توجد طلبات تحتاج متابعة
        </p>
        <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[var(--muted)]">
          ستظهر هنا الحجوزات والأسئلة التي تحتاج تدخلاً من الفريق.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {pending.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--foreground)]">
              تحتاج إجراء الآن
            </h2>
            <span className="inline-flex min-w-6 items-center justify-center rounded-[var(--radius-full)] bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {pending.length}
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {pending.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-t border-[var(--line)] pt-7">
            <h2 className="text-base font-bold text-[var(--foreground)]">
              تم التعامل معها
            </h2>
            <span className="text-xs font-medium text-[var(--muted)]">
              {done.length} طلب
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {done.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
