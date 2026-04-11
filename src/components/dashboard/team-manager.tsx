"use client";

import { useState } from "react";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
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

  const handleResetPassword = async (member: Member) => {
    const newPassword = window.prompt(t("team.resetPrompt"));
    if (!newPassword) return;
    if (newPassword.length < 8) {
      window.alert(t("team.passwordHint"));
      return;
    }
    const res = await fetch(`/api/dashboard/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Failed to reset password");
    }
  };

  const handleRemove = async (member: Member) => {
    if (!window.confirm(t("team.removeConfirm"))) return;
    const res = await fetch(`/api/dashboard/team/${member.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Failed to remove member");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card>
        <CardHeader>
          <CardDescription>{t("team.createTitle")}</CardDescription>
          <CardTitle>{t("team.createDesc")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {t("team.username")}
              </label>
              <Input
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
              <label className="text-sm font-medium text-slate-700">
                {t("team.password")}
              </label>
              <Input
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
              <label className="text-sm font-medium text-slate-700">
                {t("team.fullName")}
              </label>
              <Input
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
                  onClick={() => handleResetPassword(member)}
                >
                  <KeyRound size={14} />
                  {t("team.resetPassword")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemove(member)}
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
  );
}
