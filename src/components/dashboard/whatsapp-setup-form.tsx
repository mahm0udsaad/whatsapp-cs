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
        "This will delete the current sender from Twilio so you can start over. Continue?"
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
        setError(result.error || "Failed to delete the sender.");
        return;
      }
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Network error while deleting the sender."
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
        setError(result.error || "Failed to sync status.");
        return;
      }
      if (result.onboardingStatus === "active") {
        setSuccessMessage("Status synced — your sender is now active!");
        router.refresh();
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        setSuccessMessage(
          `Twilio status: ${result.twilioStatus}. Not active yet — try again in a moment.`
        );
        router.refresh();
      }
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : "Network error while syncing."
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
      setError("Please enter the verification code you received via SMS.");
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
        setError(result.error || "Verification failed.");
        return;
      }

      setSuccessMessage(
        result.onboardingStatus === "active"
          ? "WhatsApp sender verified and active!"
          : "Code submitted. Waiting for Twilio to confirm activation."
      );
      router.refresh();
      if (result.onboardingStatus === "active") {
        setTimeout(() => router.push("/dashboard"), 1500);
      }
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Network error while verifying."
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
      setError("Please enter your WhatsApp business phone number.");
      return;
    }

    if (!acknowledged) {
      setError(
        "Please confirm you have removed WhatsApp from this number before continuing."
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
        setError(result.error || "Registration failed.");
        return;
      }

      setSuccessMessage(
        result.setupStatus === "active"
          ? "WhatsApp sender registered and active."
          : `Registration submitted to Twilio (status: ${result.senderStatus || "pending"}). We'll mark it active once verification completes.`
      );
      router.refresh();
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Network error while registering the number."
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
                Delete WhatsApp from this number first
              </CardTitle>
              <CardDescription className="mt-1 text-amber-900/80">
                This step is required by Twilio and Meta before a number can be
                registered as a WhatsApp Business sender.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-amber-900">
          <p>
            The phone number you enter below must <strong>not</strong> be active
            on any WhatsApp account when you submit. If it is, the registration
            will fail.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Open WhatsApp (or WhatsApp Business) on the device using this
              number.
            </li>
            <li>
              Go to <em>Settings → Account → Delete my account</em> and
              completely remove the account.
            </li>
            <li>
              Wait a minute, then submit this form. Twilio will request a
              verification code from Meta and bring the sender online.
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
              <CardTitle>Register your WhatsApp sender</CardTitle>
              <CardDescription>
                We&apos;ll register <strong>{businessName}</strong> as the
                business profile with Twilio&apos;s Senders API.
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
                Current status: {existingStatus}
              </div>
              <p className="mt-1 text-xs opacity-80">
                Sender SID: <code>{existingSenderSid}</code>
              </p>
              {existingError ? (
                <p className="mt-2 text-xs text-rose-700">
                  Last error: {existingError}
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
                        Checking…
                      </>
                    ) : (
                      <>
                        <RefreshCw size={14} className="mr-2" />
                        Sync status from Twilio
                      </>
                    )}
                  </Button>
                  <p className="mt-1 text-xs text-slate-500">
                    Already verified in the Twilio Console? Click to pull the
                    latest status.
                  </p>
                </div>
              ) : null}
              {isPendingVerification ? (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                  <p className="text-sm leading-5 text-slate-700">
                    Twilio sent a verification code to this number via{" "}
                    <strong>SMS</strong>. Enter it below to activate your
                    WhatsApp sender.
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
                          Verifying…
                        </>
                      ) : (
                        "Submit code"
                      )}
                    </Button>
                  </form>
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-xs text-slate-500">
                      Didn&apos;t receive a code or entered the wrong number?
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
                          Deleting…
                        </>
                      ) : (
                        "Delete this sender and start over"
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
              {isStuckPending ? (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <p className="text-xs leading-5 text-slate-700">
                    If verification has been pending for more than a few
                    minutes, Meta likely rejected the number (most often
                    because WhatsApp is still installed on it). Twilio reports
                    this in the debugger as a 410 &ldquo;Phone Number In
                    Use&rdquo; error and the sender cannot be retried — it
                    must be deleted and recreated after WhatsApp is fully
                    removed from the device.
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
                        Deleting…
                      </>
                    ) : (
                      "Delete this sender and start over"
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
                  WhatsApp business phone number
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
                  Use the international format with the country code. Example:
                  +201234567890
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
                  I confirm WhatsApp (and WhatsApp Business) has been deleted from
                  this phone number and I&apos;m ready for Twilio to register it.
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
                    Registering with Twilio…
                  </>
                ) : (
                  "Register WhatsApp sender"
                )}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
