"use client";

import { useState } from "react";
import { AlertTriangle, KeyRound, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientLocale, createTranslator } from "@/lib/i18n";

interface Member {
  id: string;
  username: string;
  full_name: string | null;
  last_login_at: string | null;
  created_at: string;
}

interface TeamManagerProps {
  initialMembers: Member[];
}

export function TeamManager({ initialMembers }: TeamManagerProps) {
  const t = createTranslator(getClientLocale());
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);

  const formatDate = (value: string | null) => {
    if (!value) return t("team.never");
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/dashboard/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          full_name: fullName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create member");
        return;
      }
      setMembers((prev) => [data.member, ...prev]);
      setUsername("");
      setPassword("");
      setFullName("");
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const closeDialogs = () => {
    setResetTarget(null);
    setRemoveTarget(null);
    setNewPassword("");
    setDialogError("");
    setDialogBusy(false);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 8) {
      setDialogError(t("team.passwordHint"));
      return;
    }
    setDialogBusy(true);
    setDialogError("");
    const res = await fetch(`/api/dashboard/team/${resetTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    setDialogBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDialogError(data.error || "Failed to reset password");
      return;
    }
    closeDialogs();
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setDialogBusy(true);
    setDialogError("");
    const res = await fetch(`/api/dashboard/team/${removeTarget.id}`, {
      method: "DELETE",
    });
    setDialogBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDialogError(data.error || "Failed to remove member");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
    closeDialogs();
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader>
            <CardDescription>{t("team.createTitle")}</CardDescription>
            <CardTitle>{t("team.createDesc")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="legacy-team-username" className="text-sm font-medium text-slate-700">
                  {t("team.username")}
                </label>
                <Input
                  id="legacy-team-username"
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="staff1"
                  autoComplete="off"
                  disabled={creating}
                  required
                />
                <p className="text-xs text-slate-500">{t("team.usernameHint")}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="legacy-team-password" className="text-sm font-medium text-slate-700">
                  {t("team.password")}
                </label>
                <Input
                  id="legacy-team-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={creating}
                  required
                />
                <p className="text-xs text-slate-500">{t("team.passwordHint")}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="legacy-team-full-name" className="text-sm font-medium text-slate-700">
                  {t("team.fullName")}
                </label>
                <Input
                  id="legacy-team-full-name"
                  name="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={creating}
                />
              </div>

              <Button type="submit" className="w-full" disabled={creating}>
                <UserPlus size={16} />
                {creating ? t("team.creating") : t("team.create")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>{t("team.listTitle")}</CardDescription>
            <CardTitle>{members.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {members.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                {t("team.empty")}
              </p>
            ) : null}

            {members.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200/75 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">
                    {member.full_name || member.username}
                  </p>
                  <p className="text-xs text-slate-500">@{member.username}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("team.created")}: {formatDate(member.created_at)} ·{" "}
                    {t("team.lastLogin")}: {formatDate(member.last_login_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setResetTarget(member);
                      setRemoveTarget(null);
                      setNewPassword("");
                      setDialogError("");
                    }}
                  >
                    <KeyRound size={14} />
                    {t("team.resetPassword")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRemoveTarget(member);
                      setResetTarget(null);
                      setDialogError("");
                    }}
                    className="border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    {t("team.remove")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {resetTarget || removeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl" dir="rtl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {resetTarget ? t("team.resetPassword") : t("team.remove")}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {resetTarget
                    ? `حددي كلمة مرور جديدة للحساب @${resetTarget.username}.`
                    : `سيتم حذف الحساب @${removeTarget?.username} نهائياً.`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialogs}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="إغلاق"
              >
                <X size={16} />
              </button>
            </div>

            {resetTarget ? (
              <div className="mt-4 space-y-2">
                <label htmlFor="legacy-team-reset-password" className="text-sm font-medium text-slate-700">
                  كلمة المرور الجديدة
                </label>
                <Input
                  id="legacy-team-reset-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="••••••••"
                  disabled={dialogBusy}
                />
                <p className="text-xs text-slate-500">{t("team.passwordHint")}</p>
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>{t("team.removeConfirm")}</p>
              </div>
            )}

            <p
              role="alert"
              aria-live="assertive"
              className={`mt-3 text-sm text-red-700 ${dialogError ? "" : "sr-only"}`}
            >
              {dialogError || ""}
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeDialogs} disabled={dialogBusy}>
                إلغاء
              </Button>
              <Button
                type="button"
                variant={removeTarget ? "destructive" : "default"}
                onClick={resetTarget ? handleResetPassword : handleRemove}
                disabled={dialogBusy}
              >
                {dialogBusy
                  ? "جارٍ التنفيذ…"
                  : resetTarget
                  ? t("team.resetPassword")
                  : t("team.remove")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
