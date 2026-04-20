"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CustomerRow {
  id: string;
  phone_number: string;
  full_name: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  opted_out: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

const E164 = /^\+[1-9]\d{1,14}$/;
const SELECTED_PHONES_STORAGE_KEY = "whatsapp-cs:campaign-prefill-phones";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

interface Props {
  initialRows: CustomerRow[];
  initialTotal: number;
  pageSize: number;
}

export function CustomersTable({ initialRows, initialTotal, pageSize }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerRow[]>(initialRows);
  const [total, setTotal] = useState<number>(initialTotal);
  const [page, setPage] = useState<number>(1);
  const [q, setQ] = useState<string>("");
  const [debouncedQ, setDebouncedQ] = useState<string>("");
  const [optedOutFilter, setOptedOutFilter] = useState<"all" | "active" | "opted_out">("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [editTarget, setEditTarget] = useState<CustomerRow | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Debounce the search input.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 whenever filter inputs change.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, optedOutFilter]);

  const refetch = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedQ) params.set("q", debouncedQ);
        if (optedOutFilter === "active") params.set("opted_out", "false");
        if (optedOutFilter === "opted_out") params.set("opted_out", "true");
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        const res = await fetch(`/api/dashboard/customers?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          rows: CustomerRow[];
          total: number;
        };
        setRows(json.rows);
        setTotal(json.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل العملاء");
      } finally {
        setLoading(false);
      }
    },
    [debouncedQ, optedOutFilter, page, pageSize]
  );

  // Re-fetch on any input change.
  useEffect(() => {
    void refetch();
  }, [refetch]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allSelectedOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        rows.forEach((r) => next.delete(r.id));
      } else {
        rows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  const sendMessage = async (row: CustomerRow) => {
    setActionBusy(row.id);
    try {
      const res = await fetch("/api/dashboard/conversations/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: row.phone_number }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "تعذر فتح المحادثة");
      }
      const json = (await res.json()) as { id: string };
      router.push(`/dashboard/inbox/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر فتح المحادثة");
    } finally {
      setActionBusy(null);
    }
  };

  const toggleOptOut = async (row: CustomerRow) => {
    setActionBusy(row.id);
    try {
      const res = await fetch(`/api/dashboard/customers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opted_out: !row.opted_out }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "تعذر التحديث");
      }
      await refetch({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحديث");
    } finally {
      setActionBusy(null);
    }
  };

  const deleteRow = async (row: CustomerRow) => {
    if (
      !confirm(
        `حذف ${row.full_name ?? row.phone_number}؟ لا يمكن التراجع عن هذه العملية.`
      )
    )
      return;
    setActionBusy(row.id);
    try {
      const res = await fetch(`/api/dashboard/customers/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "تعذر الحذف");
      }
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await refetch({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      setActionBusy(null);
    }
  };

  const launchCampaignWithSelection = () => {
    const phones = selectedRows.map((r) => r.phone_number);
    if (phones.length === 0) return;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        SELECTED_PHONES_STORAGE_KEY,
        JSON.stringify(phones)
      );
    }
    router.push("/dashboard/marketing/campaigns/new");
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {/* Filters bar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم"
              className="rounded-xl pe-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="الكل"
              active={optedOutFilter === "all"}
              onClick={() => setOptedOutFilter("all")}
            />
            <FilterChip
              label="نشط"
              active={optedOutFilter === "active"}
              onClick={() => setOptedOutFilter("active")}
            />
            <FilterChip
              label="ملغى الاشتراك"
              active={optedOutFilter === "opted_out"}
              onClick={() => setOptedOutFilter("opted_out")}
            />
            <Button
              onClick={() => setCreateOpen(true)}
              className="gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus size={16} />
              إضافة عميل
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-sm text-emerald-900">
              تم اختيار <strong>{selected.size}</strong> عميل
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={launchCampaignWithSelection}
                className="gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700"
              >
                <Send size={14} />
                إنشاء حملة لهم
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelected(new Set())}
                className="gap-2 rounded-full"
              >
                <X size={14} />
                إلغاء التحديد
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    onChange={toggleSelectAllOnPage}
                    aria-label="اختيار الكل في هذه الصفحة"
                  />
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold text-slate-600">
                  الاسم
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold text-slate-600">
                  الرقم
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold text-slate-600">
                  المصدر
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold text-slate-600">
                  آخر تواصل
                </th>
                <th className="px-3 py-3 text-start text-xs font-semibold text-slate-600">
                  الحالة
                </th>
                <th className="px-3 py-3 text-end text-xs font-semibold text-slate-600">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    جارٍ التحميل...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    لا يوجد عملاء يطابقون البحث.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isSelected = selected.has(row.id);
                  const busy = actionBusy === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "transition-colors hover:bg-emerald-50/40",
                        isSelected && "bg-emerald-50/60"
                      )}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`اختيار ${row.full_name ?? row.phone_number}`}
                        />
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-slate-900">
                        {row.full_name || (
                          <span className="text-slate-400">بدون اسم</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700" dir="ltr">
                        {row.phone_number}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        <Badge variant="secondary" className="rounded-full">
                          {row.source}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        {formatDate(row.last_seen_at)}
                      </td>
                      <td className="px-3 py-3">
                        {row.opted_out ? (
                          <Badge variant="destructive" className="rounded-full">
                            ملغى الاشتراك
                          </Badge>
                        ) : (
                          <Badge className="rounded-full">نشط</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="إرسال رسالة"
                            onClick={() => sendMessage(row)}
                            disabled={busy}
                          >
                            {busy ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <MessageSquare size={14} />
                            )}
                          </IconButton>
                          <IconButton
                            title="تعديل"
                            onClick={() => setEditTarget(row)}
                            disabled={busy}
                          >
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton
                            title={
                              row.opted_out ? "إعادة الاشتراك" : "إلغاء الاشتراك"
                            }
                            onClick={() => toggleOptOut(row)}
                            disabled={busy}
                          >
                            {row.opted_out ? (
                              <UserPlus size={14} />
                            ) : (
                              <UserMinus size={14} />
                            )}
                          </IconButton>
                          <IconButton
                            title="حذف"
                            onClick={() => deleteRow(row)}
                            disabled={busy}
                            danger
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div>
            صفحة {page} من {totalPages} · إجمالي {total.toLocaleString("ar")} عميل
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="gap-1 rounded-full"
            >
              <ChevronRight size={14} />
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="gap-1 rounded-full"
            >
              التالي
              <ChevronLeft size={14} />
            </Button>
          </div>
        </div>
      </CardContent>

      {createOpen && (
        <CustomerFormDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            await refetch({ silent: true });
          }}
        />
      )}
      {editTarget && (
        <CustomerFormDialog
          mode="edit"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await refetch({ silent: true });
          }}
        />
      )}
    </Card>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      )}
    >
      {label}
    </button>
  );
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-40",
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function CustomerFormDialog({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: CustomerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState(initial?.phone_number ?? "");
  const [name, setName] = useState(initial?.full_name ?? "");
  const [optedOut, setOptedOut] = useState<boolean>(initial?.opted_out ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (mode === "create" && !E164.test(phone.trim())) {
      setErr("الرقم يجب أن يكون بصيغة E.164، مثل +9665…");
      return;
    }
    setBusy(true);
    try {
      let res: Response;
      if (mode === "create") {
        res = await fetch("/api/dashboard/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone_number: phone.trim(),
            full_name: name.trim() || null,
          }),
        });
      } else {
        res = await fetch(`/api/dashboard/customers/${initial!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: name.trim() || null,
            opted_out: optedOut,
          }),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "فشل الحفظ");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">
            {mode === "create" ? "إضافة عميل" : "تعديل عميل"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X size={16} />
          </button>
        </div>

        {err && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              الرقم (E.164)
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              disabled={mode === "edit"}
              placeholder="+9665XXXXXXXX"
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              الاسم
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اختياري"
              className="rounded-xl"
            />
          </div>
          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={optedOut}
                onChange={(e) => setOptedOut(e.target.checked)}
              />
              ملغى الاشتراك من الحملات
            </label>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            حفظ
          </Button>
        </div>
      </div>
    </div>
  );
}
