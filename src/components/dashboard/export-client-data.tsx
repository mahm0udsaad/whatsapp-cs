"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  QrCode,
  Loader2,
  Smartphone,
  CheckCircle2,
  Download,
  Power,
  AlertTriangle,
  MessagesSquare,
  Mic,
  Users,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Status =
  | "idle"
  | "pending_qr"
  | "scanning"
  | "connected"
  | "syncing"
  | "ready"
  | "error"
  | "disconnected";

interface Progress {
  totalChats: number;
  chats: number;
  messages: number;
  mediaFiles: number;
  bytes: number;
}

const ACTIVE: Status[] = ["pending_qr", "scanning", "connected", "syncing"];

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportClientData() {
  const [exportId, setExportId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const statusRef = useRef<Status>("idle");
  statusRef.current = status;
  const idRef = useRef<string | null>(null);
  idRef.current = exportId;

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    setQrDataUrl(null);
    setProgress(null);
    setNumber(null);
    try {
      const res = await fetch("/api/dashboard/export/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل بدء التصدير");
      setExportId(data.exportId);
      setStatus(data.status || "pending_qr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل بدء التصدير");
      setStatus("error");
    } finally {
      setStarting(false);
    }
  }, []);

  // Poll: QR while scanning, then progress while syncing.
  useEffect(() => {
    if (!exportId) return;
    const tick = async () => {
      const id = idRef.current;
      const s = statusRef.current;
      if (!id || !ACTIVE.includes(s)) return;
      try {
        if (s === "pending_qr" || s === "scanning") {
          const res = await fetch(`/api/dashboard/export/${id}/qr`);
          const data = await res.json();
          if (res.ok) {
            if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
            if (data.status) setStatus(data.status);
          }
        } else {
          const res = await fetch(`/api/dashboard/export/${id}`);
          const data = await res.json();
          if (res.ok) {
            if (data.progress) setProgress(data.progress);
            if (data.number) setNumber(data.number);
            if (data.status) setStatus(data.status);
            if (data.status === "error") setError(data.error || "حدث خطأ أثناء السحب");
          }
        }
      } catch {
        /* transient — keep polling */
      }
    };
    const interval = setInterval(tick, 2000);
    void tick();
    return () => clearInterval(interval);
  }, [exportId]);

  const disconnect = useCallback(async () => {
    if (!exportId) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/dashboard/export/${exportId}/disconnect`, { method: "POST" });
    } finally {
      setDisconnecting(false);
      setExportId(null);
      setStatus("idle");
      setQrDataUrl(null);
      setProgress(null);
      setNumber(null);
    }
  }, [exportId]);

  const isActive = ACTIVE.includes(status);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="size-5 text-[#1e3a8a]" />
          تصدير محادثات العميل
        </CardTitle>
        <CardDescription>
          اربط رقم واتساب العميل عبر مسح رمز QR لسحب سجل المحادثات والوسائط
          والرسائل الصوتية، ثم اعتمد التصدير وافصل الاتصال.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Idle: the generate button */}
        {(status === "idle" || status === "disconnected") && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Button onClick={start} disabled={starting} size="lg">
              {starting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <QrCode className="size-4" />
              )}
              توليد رمز QR
            </Button>
            <p className="text-sm text-slate-500">
              اضغط لتوليد رمز مؤقت يمسحه العميل من تطبيق واتساب.
            </p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm">{error || "حدث خطأ غير متوقع."}</p>
            </div>
            <Button onClick={start} variant="outline" disabled={starting}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* QR shown while waiting for scan */}
        {(status === "pending_qr" || status === "scanning") && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="رمز QR لربط واتساب"
                  width={288}
                  height={288}
                  unoptimized
                  className="size-72"
                />
              ) : (
                <div className="flex size-72 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-slate-400" />
                </div>
              )}
            </div>
            {status === "scanning" ? (
              <p className="flex items-center gap-2 text-sm font-medium text-[#1e3a8a]">
                <Loader2 className="size-4 animate-spin" /> تم المسح، جارٍ المصادقة…
              </p>
            ) : (
              <ol className="max-w-sm space-y-1 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <Smartphone className="size-4" /> افتح واتساب على هاتف العميل
                </li>
                <li>› الإعدادات › الأجهزة المرتبطة › ربط جهاز</li>
                <li>› وجّه الكاميرا نحو هذا الرمز</li>
              </ol>
            )}
          </div>
        )}

        {/* Syncing progress */}
        {(status === "connected" || status === "syncing") && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#1e3a8a]">
              <Loader2 className="size-4 animate-spin" />
              {number ? `متصل كـ ${number} — ` : ""}جارٍ سحب المحادثات والوسائط…
            </div>
            <ProgressGrid progress={progress} />
            <p className="text-xs text-slate-400">
              قد يستغرق سحب الوسائط والرسائل الصوتية بضع دقائق حسب حجم السجل.
            </p>
          </div>
        )}

        {/* Ready: summary + approve/download/disconnect */}
        {status === "ready" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
              <CheckCircle2 className="size-5" />
              <span className="text-sm font-medium">
                اكتمل التصدير{number ? ` للرقم ${number}` : ""}.
              </span>
            </div>
            <ProgressGrid progress={progress} />
            <div className="flex flex-wrap gap-3">
              <a
                href={`/api/dashboard/export/${exportId}/download`}
                className={buttonVariants()}
              >
                <Download className="size-4" /> تنزيل الأرشيف (ZIP)
              </a>
              <Button
                onClick={disconnect}
                variant="destructive"
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Power className="size-4" />
                )}
                اعتماد وفصل الاتصال
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              بعد الاعتماد سيتم فصل الاتصال بواتساب العميل وحذف البيانات المؤقتة من
              الخادم.
            </p>
          </div>
        )}

        {/* Cancel affordance while active (not ready) */}
        {isActive && status !== "ready" && (
          <div className="border-t border-slate-100 pt-4">
            <Button
              onClick={disconnect}
              variant="ghost"
              size="sm"
              disabled={disconnecting}
            >
              إلغاء
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressGrid({ progress }: { progress: Progress | null }) {
  const p = progress || { totalChats: 0, chats: 0, messages: 0, mediaFiles: 0, bytes: 0 };
  const items = [
    {
      icon: MessagesSquare,
      label: "المحادثات",
      value: p.totalChats ? `${p.chats} / ${p.totalChats}` : String(p.chats),
    },
    { icon: Users, label: "الرسائل", value: p.messages.toLocaleString("en-US") },
    { icon: Mic, label: "الوسائط والصوتيات", value: p.mediaFiles.toLocaleString("en-US") },
    { icon: Download, label: "الحجم", value: mb(p.bytes) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center"
        >
          <it.icon className="mx-auto mb-1 size-4 text-slate-400" />
          <div className="text-lg font-bold text-slate-900">{it.value}</div>
          <div className="text-xs text-slate-500">{it.label}</div>
        </div>
      ))}
    </div>
  );
}
