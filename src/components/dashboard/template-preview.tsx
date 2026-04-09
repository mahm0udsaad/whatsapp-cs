"use client";

import { cn } from "@/lib/utils";

interface TemplatePreviewProps {
  headerType?: "none" | "text" | "image";
  headerText?: string;
  headerImageUrl?: string;
  body?: string;
  footerText?: string;
  buttons?: Array<{ type: string; title: string; url?: string; id?: string }>;
  variables?: string[];
  className?: string;
}

export function TemplatePreview({
  headerType = "none",
  headerText,
  headerImageUrl,
  body,
  footerText,
  buttons,
  variables,
  className,
}: TemplatePreviewProps) {
  function highlightVariables(text: string) {
    if (!text) return null;
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((part, i) => {
      if (/\{\{\d+\}\}/.test(part)) {
        const idx = parseInt(part.replace(/[{}]/g, ""), 10) - 1;
        const label = variables?.[idx] || part;
        return (
          <span
            key={i}
            className="inline-block rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700"
          >
            {label}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  const hasContent = body || headerType !== "none" || footerText;

  return (
    <div className={cn("flex items-center justify-center", className)}>
      {/* Phone mockup */}
      <div className="relative w-[320px] rounded-[40px] border-[3px] border-slate-800 bg-slate-900 p-2 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 start-1/2 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-900" />

        {/* Screen */}
        <div className="overflow-hidden rounded-[32px] bg-[#ece5dd]">
          {/* WhatsApp header bar */}
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 pt-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
              W
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">WhatsApp Preview</p>
              <p className="text-[10px] text-white/70">Template message</p>
            </div>
          </div>

          {/* Chat area */}
          <div className="min-h-[380px] space-y-2 p-3">
            {!hasContent ? (
              <div className="flex h-[340px] items-center justify-center">
                <p className="text-center text-sm text-slate-500">
                  Your template preview will appear here as you build it
                </p>
              </div>
            ) : (
              <div className="ms-0 me-8 max-w-[260px]">
                {/* Message bubble */}
                <div className="rounded-xl rounded-tl-sm bg-white p-3 shadow-sm">
                  {/* Header */}
                  {headerType === "image" && headerImageUrl && (
                    <div className="mb-2 overflow-hidden rounded-lg">
                      <img
                        src={headerImageUrl}
                        alt="Header"
                        className="h-32 w-full object-cover"
                      />
                    </div>
                  )}
                  {headerType === "image" && !headerImageUrl && (
                    <div className="mb-2 flex h-32 items-center justify-center rounded-lg bg-slate-100">
                      <p className="text-xs text-slate-400">Image placeholder</p>
                    </div>
                  )}
                  {headerType === "text" && headerText && (
                    <p className="mb-2 text-sm font-bold text-slate-900">
                      {headerText}
                    </p>
                  )}

                  {/* Body */}
                  {body && (
                    <p className="whitespace-pre-wrap text-[13px] leading-5 text-slate-800">
                      {highlightVariables(body)}
                    </p>
                  )}

                  {/* Footer */}
                  {footerText && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      {footerText}
                    </p>
                  )}

                  {/* Time */}
                  <p className="mt-1 text-end text-[10px] text-slate-400">
                    12:00 PM
                  </p>
                </div>

                {/* Buttons */}
                {buttons && buttons.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {buttons.map((btn, i) => (
                      <button
                        key={i}
                        className="flex w-full items-center justify-center rounded-lg bg-white py-2 text-xs font-medium text-[#075e54] shadow-sm"
                      >
                        {btn.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
