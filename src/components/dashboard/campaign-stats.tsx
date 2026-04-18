"use client";

import { cn } from "@/lib/utils";

interface CampaignStatsProps {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  className?: string;
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className="text-xs font-semibold text-slate-900">
          {value.toLocaleString("ar")} ({pct.toLocaleString("ar")}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CampaignStats({
  total,
  sent,
  delivered,
  read,
  failed,
  className,
}: CampaignStatsProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <ProgressBar
        label="تم الإرسال"
        value={sent}
        total={total}
        color="bg-sky-500"
      />
      <ProgressBar
        label="تم التسليم"
        value={delivered}
        total={total}
        color="bg-emerald-500"
      />
      <ProgressBar
        label="تمت القراءة"
        value={read}
        total={total}
        color="bg-violet-500"
      />
      <ProgressBar
        label="فشلت"
        value={failed}
        total={total}
        color="bg-red-500"
      />
    </div>
  );
}
