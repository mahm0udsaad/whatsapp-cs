"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ApprovedTemplate {
  id: string;
  name: string;
  body_template: string | null;
  language: string;
  category: string;
}

interface ParsedRecipient {
  phone_number: string;
  name?: string;
}

const STEPS = [
  { label: "Campaign", icon: FileText },
  { label: "Recipients", icon: Users },
  { label: "Schedule", icon: Calendar },
  { label: "Confirm", icon: Check },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTemplate = searchParams.get("template");

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Campaign info
  const [campaignName, setCampaignName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    preselectedTemplate || ""
  );
  const [templates, setTemplates] = useState<ApprovedTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Step 2: Recipients
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsedRecipients, setParsedRecipients] = useState<ParsedRecipient[]>(
    []
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Schedule
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  // Load approved templates
  useEffect(() => {
    fetch("/api/marketing/templates?status=approved")
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data.templates || data || []);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/marketing/recipients", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to parse file");
      }

      const data = await res.json();
      setParsedRecipients(data.recipients || []);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to parse file"
      );
      setParsedRecipients([]);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return campaignName.trim() && selectedTemplateId;
      case 1:
        return parsedRecipients.length > 0;
      case 2:
        return scheduleType === "now" || (scheduledDate && scheduledTime);
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);

    try {
      let scheduled_at: string | null = null;
      if (scheduleType === "later" && scheduledDate && scheduledTime) {
        scheduled_at = new Date(
          `${scheduledDate}T${scheduledTime}`
        ).toISOString();
      }

      // Create campaign
      const campaignRes = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          template_id: selectedTemplateId,
          scheduled_at,
          recipients: parsedRecipients,
        }),
      });

      if (!campaignRes.ok) {
        const data = await campaignRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create campaign");
      }

      router.push("/dashboard/marketing/campaigns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/dashboard/marketing/campaigns"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            Create Campaign
          </h1>
          <p className="text-sm text-slate-500">
            Set up and launch a WhatsApp marketing campaign
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isComplete = i < step;

            return (
              <div key={s.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                      isActive && "bg-emerald-600 text-white",
                      isComplete && "bg-emerald-100 text-emerald-700",
                      !isActive && !isComplete && "bg-slate-100 text-slate-400"
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Icon size={18} />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isActive
                        ? "text-emerald-700"
                        : isComplete
                        ? "text-emerald-600"
                        : "text-slate-400"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-2 mb-5 h-0.5 w-12 sm:w-20 rounded-full",
                      i < step ? "bg-emerald-400" : "bg-slate-200"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Step content */}
      <div className="max-w-2xl mx-auto">
        {/* Step 1: Campaign name + template */}
        {step === 0 && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <label className="text-sm font-semibold text-slate-900 mb-2 block">
                  Campaign Name
                </label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Summer Special Offer"
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-900 mb-2 block">
                  Select Template
                </label>
                {loadingTemplates ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                    <Loader2 size={14} className="animate-spin" />
                    Loading templates...
                  </div>
                ) : templates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center">
                    <p className="text-sm text-slate-600">
                      No approved templates available.
                    </p>
                    <Link
                      href="/dashboard/marketing/templates/new"
                      className="mt-2 inline-flex text-sm font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      Create a template first
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplateId(t.id)}
                        className={cn(
                          "w-full rounded-xl border p-4 text-start transition-all",
                          selectedTemplateId === t.id
                            ? "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-400/30"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">
                            {t.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                              {t.language.toUpperCase()}
                            </Badge>
                            <Badge className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] text-emerald-700">
                              {t.category}
                            </Badge>
                          </div>
                        </div>
                        {t.body_template && (
                          <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                            {t.body_template}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Upload recipients */}
        {step === 1 && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <label className="text-sm font-semibold text-slate-900 mb-2 block">
                  Upload Recipient List
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className={cn(
                    "rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
                    file
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/30"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Upload
                    size={28}
                    className={cn(
                      "mx-auto mb-3",
                      file ? "text-emerald-500" : "text-slate-400"
                    )}
                  />
                  {file ? (
                    <>
                      <p className="text-sm font-semibold text-emerald-700">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-emerald-600">
                        Click to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-700">
                        Click to upload or drag and drop
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        CSV or XLSX file with phone numbers
                      </p>
                    </>
                  )}
                </div>
              </div>

              {uploading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" />
                  Parsing file...
                </div>
              )}

              {uploadError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-700">{uploadError}</p>
                </div>
              )}

              {parsedRecipients.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {parsedRecipients.length.toLocaleString()} recipients
                      parsed
                    </p>
                    <Badge className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs text-emerald-700">
                      Ready
                    </Badge>
                  </div>

                  {/* Preview table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-4 py-2.5 text-start text-xs font-semibold text-slate-500">
                            Phone
                          </th>
                          <th className="px-4 py-2.5 text-start text-xs font-semibold text-slate-500">
                            Name
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRecipients.slice(0, 5).map((r, i) => (
                          <tr
                            key={i}
                            className="border-t border-slate-100"
                          >
                            <td className="px-4 py-2.5 text-slate-900 font-mono text-xs">
                              {r.phone_number}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {r.name || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedRecipients.length > 5 && (
                      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-center text-xs text-slate-500">
                        and {parsedRecipients.length - 5} more...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-sky-50 border border-sky-200 p-4">
                <p className="text-sm font-medium text-sky-900 mb-1">
                  File format
                </p>
                <p className="text-xs text-sky-800">
                  Your file should have a &quot;phone&quot; or
                  &quot;phone_number&quot; column (required) and an optional
                  &quot;name&quot; column. Headers are required.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Schedule */}
        {step === 2 && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <label className="text-sm font-semibold text-slate-900 mb-4 block">
                  When to send
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setScheduleType("now")}
                    className={cn(
                      "rounded-xl border p-4 text-center transition-all",
                      scheduleType === "now"
                        ? "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-400/30"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="text-2xl mb-1">&#9889;</div>
                    <p className="text-sm font-semibold text-slate-900">
                      Send Now
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Start sending immediately
                    </p>
                  </button>
                  <button
                    onClick={() => setScheduleType("later")}
                    className={cn(
                      "rounded-xl border p-4 text-center transition-all",
                      scheduleType === "later"
                        ? "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-400/30"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="text-2xl mb-1">&#128197;</div>
                    <p className="text-sm font-semibold text-slate-900">
                      Schedule
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pick a date and time
                    </p>
                  </button>
                </div>
              </div>

              {scheduleType === "later" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Date
                    </label>
                    <Input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Time
                    </label>
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Confirmation */}
        {step === 3 && (
          <Card>
            <CardContent className="p-6 space-y-5">
              <h3 className="text-lg font-semibold text-slate-950">
                Campaign Summary
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-500">Campaign Name</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {campaignName}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-500">Template</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {selectedTemplate?.name || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-500">Recipients</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {parsedRecipients.length.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-500">Schedule</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {scheduleType === "now"
                      ? "Send immediately"
                      : `${scheduledDate} at ${scheduledTime}`}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <p className="text-sm text-amber-800">
                  This will send a WhatsApp message to{" "}
                  <strong>{parsedRecipients.length.toLocaleString()}</strong>{" "}
                  recipients using the &quot;{selectedTemplate?.name}&quot;
                  template.{" "}
                  {scheduleType === "now"
                    ? "Messages will start sending immediately."
                    : `Messages will be sent on ${scheduledDate} at ${scheduledTime}.`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="gap-2 rounded-full"
          >
            <ArrowLeft size={16} />
            Back
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="gap-2 rounded-full"
            >
              Next
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="gap-2 rounded-full"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              {saving ? "Creating..." : "Create Campaign"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
