"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WhatsAppSetupFormProps {
  businessName: string;
  initialPhoneNumber: string;
  existingStatus: string | null;
  existingError: string | null;
  existingSenderSid: string | null;
}

export function WhatsAppSetupForm({
  businessName,
  initialPhoneNumber,
  existingStatus,
  existingError,
  existingSenderSid,
}: WhatsAppSetupFormProps) {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isAlreadyActive = existingStatus === "active";
  const isPendingVerification =
    !!existingSenderSid && existingStatus === "pending_test";
  const isStuckPending =
    !!existingSenderSid &&
    !isAlreadyActive &&
    !isPendingVerification &&
    existingStatus !== null;

  // Auto-sync once on mount if we have a sender SID but the DB still shows
  // pending_test. Twilio may have flipped it to ONLINE since the last manual
  // sync, and the alert on the dashboard shouldn't require a button click.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (!existingSenderSid || isAlreadyActive) return;
    if (existingStatus !== "pending_test") return;
    autoSyncedRef.current = true;

    (async () => {
      try {
        const response = await fetch(
          "/api/dashboard/whatsapp/sync-sender-status",
          { method: "POST" }
        );
        if (!response.ok) return;
        const result = (await response.json()) as { onboardingStatus?: string };
        if (result.onboardingStatus === "active") {
          router.refresh();
        }
      } catch {
        // Silent — the manual button is still available.
      }
    })();
  }, [existingSenderSid, existingStatus, isAlreadyActive, router]);

  const handleDelete = async () => {
    if (
      !confirm(
        "سيتم حذف مرسل واتساب الحالي من Twilio حتى تبدأ من جديد. هل تريد المتابعة؟"
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/dashboard/whatsapp/register-sender", {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "تعذر حذف المرسل.");
        return;
      }
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "حدث خطأ في الشبكة أثناء حذف المرسل."
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleSync = async () => {
    setError(null);
    setSuccessMessage(null);
    setSyncing(true);
    try {
      const response = await fetch("/api/dashboard/whatsapp/sync-sender-status", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "تعذر مزامنة الحالة.");
        return;
      }
      if (result.onboardingStatus === "active") {
        setSuccessMessage("تمت مزامنة الحالة، والمرسل نشط الآن.");
        router.refresh();
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        setSuccessMessage(
          `حالة Twilio: ${result.twilioStatus}. لم يصبح نشطاً بعد. حاول مرة أخرى بعد قليل.`
        );
        router.refresh();
      }
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : "حدث خطأ في الشبكة أثناء المزامنة."
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!verificationCode.trim()) {
      setError("أدخل رمز التحقق الذي استلمته عبر الرسائل القصيرة.");
      return;
    }

    setVerifying(true);
    try {
      const response = await fetch("/api/dashboard/whatsapp/verify-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderSid: existingSenderSid,
          verificationCode: verificationCode.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "فشل التحقق.");
        return;
      }

      setSuccessMessage(
        result.onboardingStatus === "active"
          ? "تم التحقق من مرسل واتساب وأصبح نشطاً."
          : "تم إرسال الرمز. بانتظار تأكيد التفعيل من Twilio."
      );
      router.refresh();
      if (result.onboardingStatus === "active") {
        setTimeout(() => router.push("/dashboard"), 1500);
      }
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "حدث خطأ في الشبكة أثناء التحقق."
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const trimmed = phoneNumber.trim();
    if (!trimmed) {
      setError("أدخل رقم واتساب الخاص بالنشاط.");
      return;
    }

    if (!acknowledged) {
      setError(
        "أكد أنك حذفت واتساب من هذا الرقم قبل المتابعة."
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/dashboard/whatsapp/register-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: trimmed }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "فشل التسجيل.");
        return;
      }

      setSuccessMessage(
        result.setupStatus === "active"
          ? "تم تسجيل مرسل واتساب وأصبح نشطاً."
          : `تم إرسال التسجيل إلى Twilio (الحالة: ${result.senderStatus || "pending"}). سنجعله نشطاً بعد اكتمال التحقق.`
      );
      router.refresh();
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "حدث خطأ في الشبكة أثناء تسجيل الرقم."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-amber-300/70 bg-amber-50/70">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700">
              <AlertTriangle size={20} />
            </div>
            <div>
              <CardTitle className="text-amber-900">
                احذف واتساب من هذا الرقم أولاً
              </CardTitle>
              <CardDescription className="mt-1 text-amber-900/80">
                هذه الخطوة مطلوبة من Twilio وMeta قبل تسجيل الرقم كمرسل واتساب للأعمال.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-amber-900">
          <p>
            يجب ألا يكون رقم الهاتف الذي تدخله بالأسفل نشطاً على أي حساب واتساب عند الإرسال. إذا كان نشطاً، سيفشل التسجيل.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              افتح واتساب أو واتساب للأعمال على الجهاز الذي يستخدم هذا الرقم.
            </li>
            <li>
              اذهب إلى <em>الإعدادات ثم الحساب ثم حذف حسابي</em> واحذف الحساب بالكامل.
            </li>
            <li>
              انتظر دقيقة ثم أرسل هذا النموذج. سيطلب Twilio رمز تحقق من Meta ويفعل المرسل.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700">
              <Smartphone size={20} />
            </div>
            <div>
              <CardTitle>تسجيل مرسل واتساب</CardTitle>
              <CardDescription>
                سنسجل <strong>{businessName}</strong> كملف النشاط عبر واجهة مرسلي Twilio.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {existingSenderSid && existingStatus ? (
            <div
              className={`mb-5 rounded-2xl border p-4 text-sm leading-6 ${
                isAlreadyActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {isAlreadyActive ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Loader2 size={16} className="animate-spin" />
                )}
                الحالة الحالية: {existingStatus}
              </div>
              <p className="mt-1 text-xs opacity-80">
                معرف المرسل: <code>{existingSenderSid}</code>
              </p>
              {existingError ? (
                <p className="mt-2 text-xs text-rose-700">
                  آخر خطأ: {existingError}
                </p>
              ) : null}
              {!isAlreadyActive ? (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <>
                        <Loader2 size={14} className="mr-2 animate-spin" />
                        جارٍ الفحص...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={14} className="mr-2" />
                        مزامنة الحالة من Twilio
                      </>
                    )}
                  </Button>
                  <p className="mt-1 text-xs text-slate-500">
                    هل تم التحقق بالفعل في لوحة Twilio؟ اضغط لجلب أحدث حالة.
                  </p>
                </div>
              ) : null}
              {isPendingVerification ? (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                  <p className="text-sm leading-5 text-slate-700">
                    أرسل Twilio رمز تحقق إلى هذا الرقم عبر <strong>SMS</strong>. أدخله بالأسفل لتفعيل مرسل واتساب.
                  </p>
                  <form onSubmit={handleVerify} className="flex gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      disabled={verifying}
                      className="w-36"
                      dir="ltr"
                    />
                    <Button type="submit" disabled={verifying}>
                      {verifying ? (
                        <>
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          جارٍ التحقق...
                        </>
                      ) : (
                        "إرسال الرمز"
                      )}
                    </Button>
                  </form>
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-xs text-slate-500">
                      لم تستلم الرمز أو أدخلت رقماً خاطئاً؟
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDelete}
                      disabled={deleting || verifying}
                      className="mt-2 border-rose-300 text-rose-700 hover:bg-rose-50"
                    >
                      {deleting ? (
                        <>
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          جارٍ الحذف...
                        </>
                      ) : (
                        "حذف هذا المرسل والبدء من جديد"
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
              {isStuckPending ? (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <p className="text-xs leading-5 text-slate-700">
                    إذا ظل التحقق معلقاً لأكثر من بضع دقائق، فغالباً رفضت Meta الرقم لأن واتساب ما زال مثبتاً عليه. يظهر ذلك في Twilio كخطأ 410 Phone Number In Use، ولا يمكن إعادة محاولة المرسل نفسه. يجب حذفه وإنشاؤه من جديد بعد إزالة واتساب بالكامل من الجهاز.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDelete}
                    disabled={deleting || submitting}
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    {deleting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        جارٍ الحذف...
                      </>
                    ) : (
                      "حذف هذا المرسل والبدء من جديد"
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {successMessage}
            </div>
          ) : null}

          {!isPendingVerification && !isAlreadyActive ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  رقم واتساب الخاص بالنشاط
                </label>
                <Input
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="+201234567890"
                  disabled={submitting}
                  dir="ltr"
                />
                <p className="text-xs text-slate-500">
                  استخدم الصيغة الدولية مع رمز الدولة. مثال: +201234567890
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={submitting}
                />
                <span>
                  أؤكد حذف واتساب وواتساب للأعمال من هذا الرقم، وأنا جاهز لتسجيله عبر Twilio.
                </span>
              </label>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    جارٍ التسجيل عبر Twilio...
                  </>
                ) : (
                  "تسجيل مرسل واتساب"
                )}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
