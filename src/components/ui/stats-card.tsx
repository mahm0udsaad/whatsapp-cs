import React from "react";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  footnote?: string;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  tone?: "emerald" | "sky" | "amber" | "rose";
  className?: string;
}

export function StatsCard({
  title,
  value,
  icon,
  description,
  footnote,
  trend,
  tone = "emerald",
  className,
}: StatsCardProps) {
  const tones = {
    emerald: {
      glow:
        "from-emerald-500/10 via-emerald-300/6 to-transparent",
      icon:
        "border-emerald-200 bg-emerald-500 text-white shadow-emerald-500/30",
    },
    sky: {
      glow:
        "from-sky-500/10 via-sky-300/6 to-transparent",
      icon:
        "border-sky-200 bg-sky-500 text-white shadow-sky-500/30",
    },
    amber: {
      glow:
        "from-amber-500/10 via-amber-300/6 to-transparent",
      icon:
        "border-amber-200 bg-amber-500 text-white shadow-amber-500/30",
    },
    rose: {
      glow:
        "from-rose-500/10 via-rose-300/6 to-transparent",
      icon:
        "border-rose-200 bg-rose-500 text-white shadow-rose-500/30",
    },
  }[tone];

  return (
    <Card className={cn("relative overflow-hidden bg-white", className)}>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-100",
          tones.glow
        )}
      />
      <CardContent className="relative p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              {title}
            </p>
            <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
              {value}
            </p>
            {description ? (
              <p className="mt-3 max-w-[24ch] text-sm leading-6 text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
          {icon ? (
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-lg",
                tones.icon
              )}
            >
              {icon}
            </div>
          ) : null}
        </div>

        {trend || footnote ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            {trend ? (
              <p
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 font-medium",
                  trend.direction === "up"
                    ? "bg-emerald-500/12 text-emerald-700"
                    : "bg-rose-500/12 text-rose-700"
                )}
              >
                {trend.direction === "up" ? "↑" : "↓"} {Math.abs(trend.value)}%
              </p>
            ) : null}
            {footnote ? (
              <p className="text-slate-500">{footnote}</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
