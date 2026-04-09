"use client";

import { useState } from "react";
import { ImageIcon, Loader2, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageGeneratorProps {
  prompt: string;
  onImageGenerated: (url: string) => void;
  className?: string;
}

export function ImageGenerator({
  prompt,
  onImageGenerated,
  className,
}: ImageGeneratorProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const generateImage = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/marketing/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate image");
      }

      const data = await res.json();
      setImageUrl(data.imageUrl);
    } catch {
      setError("Image generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (imageUrl) {
      setAccepted(true);
      onImageGenerated(imageUrl);
    }
  };

  return (
    <div
      className={cn(
        "rounded-[24px] border border-slate-200/70 bg-white/70 p-5",
        className
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600">
          <ImageIcon size={16} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-950">
            AI Image Generation
          </h4>
          <p className="text-xs text-slate-500">
            Create a header image for your template
          </p>
        </div>
      </div>

      {/* Prompt display */}
      <div className="mb-4 rounded-xl bg-slate-50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
          Prompt
        </p>
        <p className="text-sm text-slate-700">{prompt}</p>
      </div>

      {/* Image preview */}
      {imageUrl && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
          <img
            src={imageUrl}
            alt="Generated template header"
            className="w-full object-cover"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!imageUrl && !isGenerating && (
          <Button onClick={generateImage} className="gap-2">
            <ImageIcon size={14} />
            Generate Image
          </Button>
        )}

        {isGenerating && (
          <Button disabled className="gap-2">
            <Loader2 size={14} className="animate-spin" />
            Generating...
          </Button>
        )}

        {imageUrl && !accepted && (
          <>
            <Button onClick={handleAccept} className="gap-2">
              <Check size={14} />
              Use This Image
            </Button>
            <Button
              variant="outline"
              onClick={generateImage}
              disabled={isGenerating}
              className="gap-2"
            >
              <RefreshCw size={14} />
              Regenerate
            </Button>
          </>
        )}

        {accepted && (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Check size={14} />
            Image accepted
          </div>
        )}
      </div>
    </div>
  );
}
