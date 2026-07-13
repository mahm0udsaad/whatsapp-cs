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
      surface: "bg-[#edf0ff]",
      icon:
        "border-[#20339a]/20 bg-[#20339a] text-white",
    },
    sky: {
      surface: "bg-sky-50",
      icon:
        "border-sky-200 bg-sky-500 text-white shadow-sky-500/30",
    },
    amber: {
      surface: "bg-[#fff8d9]",
      icon:
        "border-amber-200 bg-amber-500 text-white shadow-amber-500/30",
    },
    rose: {
      surface: "bg-rose-50",
      icon:
        "border-rose-200 bg-rose-500 text-white shadow-rose-500/30",
    },
  }[tone];

  return (
    <Card className={cn("relative overflow-hidden", tones.surface, className)}>
      <CardContent className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-600">
              {title}
            </p>
            <p className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950">
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
                    ? "bg-[#edf0ff] text-[#20339a]"
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
