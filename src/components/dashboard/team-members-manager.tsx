"use client";

/**
 * Owner-only manager for `team_members` (Supabase-auth-backed staff).
 *
 * Distinct from `<TeamManager>` which manages the legacy `restaurant_members`
 * username/password table. THIS surface is for staff who use the inbox claim
 * flow + the mobile agent app + the shifts schedule + push notifications.
 *
 * The owner picks the email and password directly. The auth user is created
 * with `email_confirm: true` (server-side) so the staff member can log in
 * immediately — no email round-trip.
 */

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pencil,
  PowerOff,
  Power,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string | null;
  role: "agent" | "admin";
  is_active: boolean;
  is_available: boolean;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialMembers: TeamMember[];
}

interface Toast {
  id: number;
  text: string;
  tone: "success" | "error";
}

const ROLE_LABEL: Record<TeamMember["role"], string> = {
  admin: "مديرة",
  agent: "موظفة",
};

export function TeamMembersManager({ initialMembers }: Props) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [showForm, setShowForm] = useState(initialMembers.length === 0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"agent" | "admin">("agent");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    full_name: string;
    role: "agent" | "admin";
  }>({ full_name: "", role: "agent" });

  function pushToast(text: string, tone: Toast["tone"] = "success") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setCreateError("اكملي كل الحقول. كلمة المرور 8 أحرف على الأقل.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/dashboard/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          role,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(body.error ?? "تعذر الإنشاء");
        return;
      }
      setMembers((prev) => [body.member as TeamMember, ...prev]);
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("agent");
      pushToast("تمت إضافة الموظفة ✅");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "تعذر الاتصال بالخادم"
      );
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Partial<TeamMember>, label: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/dashboard/team-members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast(data.error ?? "تعذر التحديث", "error");
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...(data.member as TeamMember) } : m))
      );
      pushToast(label);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(m: TeamMember) {
    setEditingId(m.id);
    setEditDraft({ full_name: m.full_name ?? "", role: m.role });
  }

  async function saveEdit(id: string) {
    await patch(
      id,
      { full_name: editDraft.full_name.trim(), role: editDraft.role },
      "تم الحفظ"
    );
    setEditingId(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardDescription>إدارة الفريق</CardDescription>
            <CardTitle>موظفات الردود (الإنبوكس + التطبيق)</CardTitle>
            <p className="mt-2 max-w-prose text-sm text-slate-600">
              هؤلاء هن الموظفات اللي يقدرن يستلمن المحادثات من تطبيق الجوال
              ومن صفحة الإنبوكس، ويظهرن في جدول الدوامات. أنشئي لكل موظفة
              بريد وكلمة مرور — بتسجل دخول مباشرة بدون ايميل تأكيد.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
            aria-controls="team-members-create-form"
          >
            {showForm ? (
              <>
                <ChevronUp size={14} aria-hidden="true" />
                إخفاء النموذج
              </>
            ) : (
              <>
                <UserPlus size={14} aria-hidden="true" />
                إضافة موظفة
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {showForm ? (
          <form
            id="team-members-create-form"
            onSubmit={handleCreate}
            className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2"
          >
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-slate-700">
                الاسم الكامل
              </span>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثلاً: روز"
                disabled={creating}
                autoComplete="name"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                البريد الإلكتروني
              </span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rose@example.com"
                disabled={creating}
                autoComplete="email"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                كلمة المرور (8 أحرف على الأقل)
              </span>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={creating}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">الدور</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "agent" | "admin")}
                disabled={creating}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="agent">موظفة (تستلم محادثات)</option>
                <option value="admin">مديرة (كل الصلاحيات)</option>
              </select>
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
              <p
                role="alert"
                aria-live="assertive"
                className={cn(
                  "text-xs text-rose-700",
                  !createError && "sr-only"
                )}
              >
                {createError || ""}
              </p>
              <Button type="submit" disabled={creating}>
                {creating ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
              </Button>
            </div>
          </form>
        ) : null}

        {/* Members list */}
        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
            لم تضيفي أي موظفة بعد. اضغطي «إضافة موظفة» لتبدئي.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {members.map((m) => {
              const isEditing = editingId === m.id;
              const busy = busyId === m.id;
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-3 px-4 py-3",
                    !m.is_active && "opacity-60"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          value={editDraft.full_name}
                          aria-label="الاسم الكامل"
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              full_name: e.target.value,
                            }))
                          }
                        />
                        <select
                          value={editDraft.role}
                          aria-label="الدور"
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              role: e.target.value as "agent" | "admin",
                            }))
                          }
                          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option value="agent">موظفة</option>
                          <option value="admin">مديرة</option>
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {m.full_name || "—"}
                          </p>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                              m.role === "admin"
                                ? "bg-violet-100 text-violet-800"
                                : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {m.role === "admin" ? (
                              <ShieldCheck size={11} aria-hidden="true" />
                            ) : null}
                            {ROLE_LABEL[m.role]}
                          </span>
                          {m.is_active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                              <CheckCircle2 size={11} aria-hidden="true" />
                              نشطة
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                              معطّلة
                            </span>
                          )}
                          {m.is_active && !m.is_available ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              غير متاحة الآن
                            </span>
                          ) : null}
                        </div>
                        {m.email ? (
                          <p
                            className="mt-1 text-xs text-slate-500"
                            translate="no"
                            dir="ltr"
                          >
                            {m.email}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(m.id)}
                          disabled={busy}
                        >
                          {busy ? "جارٍ الحفظ…" : "حفظ"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                        >
                          إلغاء
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(m)}
                          disabled={busy}
                          aria-label={`تعديل ${m.full_name ?? ""}`}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          تعديل
                        </Button>
                        {m.is_active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patch(m.id, { is_active: false }, "تم تعطيل الحساب")
                            }
                            disabled={busy}
                          >
                            <PowerOff size={13} aria-hidden="true" />
                            تعطيل
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patch(m.id, { is_active: true }, "تم تفعيل الحساب")
                            }
                            disabled={busy}
                          >
                            <Power size={13} aria-hidden="true" />
                            تفعيل
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

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
      </CardContent>
    </Card>
  );
}
