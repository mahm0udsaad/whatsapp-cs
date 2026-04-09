"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TemplateBuilderChat } from "@/components/dashboard/template-builder-chat";
import { TemplatePreview } from "@/components/dashboard/template-preview";
import { ImageGenerator } from "@/components/dashboard/image-generator";
import type { AITemplateBuilderResponse, TemplateHeaderType } from "@/lib/types";

export default function NewTemplatePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"collecting" | "generating" | "complete">(
    "collecting"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template preview state
  const [templateData, setTemplateData] = useState<{
    name: string;
    body: string;
    headerType: TemplateHeaderType;
    headerText?: string;
    footerText?: string;
    buttons?: Array<{ type: string; title: string; url?: string; id?: string }>;
    variables: string[];
    language: string;
    category: string;
    imagePrompt?: string;
  } | null>(null);

  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);

  const handleTemplateUpdate = useCallback(
    (response: AITemplateBuilderResponse) => {
      if (response.template) {
        setTemplateData(response.template);
      }
    },
    []
  );

  const handleStatusChange = useCallback(
    (newStatus: "collecting" | "generating" | "complete") => {
      setStatus(newStatus);
    },
    []
  );

  const handleSave = async () => {
    if (!templateData) return;
    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name: templateData.name,
        body_template: templateData.body,
        header_type: templateData.headerType,
        header_text: templateData.headerText || null,
        footer_text: templateData.footerText || null,
        buttons: templateData.buttons || [],
        variables: templateData.variables || [],
        language: templateData.language,
        category: templateData.category,
        ai_generated: true,
      };

      if (headerImageUrl) {
        payload.header_image_url = headerImageUrl;
        payload.image_asset_url = headerImageUrl;
      }

      const res = await fetch("/api/marketing/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save template");
      }

      router.push("/dashboard/marketing/templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  // Use a fallback restaurant name - in production this would come from context
  const restaurantName = "your restaurant";

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/marketing/templates"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
              AI Template Builder
            </h1>
            <p className="text-sm text-slate-500">
              Chat with AI to create your perfect WhatsApp template
            </p>
          </div>
        </div>

        {status === "complete" && templateData && (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 rounded-full"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {saving ? "Saving..." : "Save Template"}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Split layout */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Chat panel */}
        <Card className="overflow-hidden lg:sticky lg:top-6">
          <div className="h-[calc(100vh-220px)] min-h-[500px]">
            <TemplateBuilderChat
              restaurantName={restaurantName}
              onTemplateUpdate={handleTemplateUpdate}
              onStatusChange={handleStatusChange}
            />
          </div>
        </Card>

        {/* Preview panel */}
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200/70 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-950">
                Template Preview
              </h3>
              <p className="text-xs text-slate-500">
                {templateData
                  ? "Live preview of your template"
                  : "Preview will appear as the AI builds your template"}
              </p>
            </div>
            <div className="p-6">
              <TemplatePreview
                headerType={templateData?.headerType || "none"}
                headerText={templateData?.headerText}
                headerImageUrl={headerImageUrl || undefined}
                body={templateData?.body}
                footerText={templateData?.footerText}
                buttons={templateData?.buttons}
                variables={templateData?.variables}
              />
            </div>
          </Card>

          {/* Image generator - show if template has imagePrompt */}
          {templateData?.imagePrompt && templateData.headerType === "image" && (
            <ImageGenerator
              prompt={templateData.imagePrompt}
              onImageGenerated={(url) => setHeaderImageUrl(url)}
            />
          )}

          {/* Template metadata */}
          {templateData && (
            <Card>
              <div className="p-5">
                <h4 className="text-sm font-semibold text-slate-950 mb-3">
                  Template Details
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                    <span className="text-xs text-slate-500">Name</span>
                    <span className="text-sm font-medium text-slate-900">
                      {templateData.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                    <span className="text-xs text-slate-500">Language</span>
                    <span className="text-sm font-medium text-slate-900">
                      {templateData.language.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                    <span className="text-xs text-slate-500">Category</span>
                    <span className="text-sm font-medium text-slate-900">
                      {templateData.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                    <span className="text-xs text-slate-500">Variables</span>
                    <span className="text-sm font-medium text-slate-900">
                      {templateData.variables?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                    <span className="text-xs text-slate-500">Header</span>
                    <span className="text-sm font-medium text-slate-900 capitalize">
                      {templateData.headerType}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
