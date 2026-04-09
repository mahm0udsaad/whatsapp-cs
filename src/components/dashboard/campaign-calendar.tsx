"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getClientLocale } from "@/lib/i18n";
import type { MarketingCampaign } from "@/lib/types";

interface CampaignCalendarProps {
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500",
  scheduled: "bg-sky-500",
  sending: "bg-amber-500",
  processing: "bg-amber-500",
  failed: "bg-red-500",
  draft: "bg-slate-400",
  cancelled: "bg-slate-300",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  scheduled: "Scheduled",
  sending: "Sending",
  processing: "Processing",
  failed: "Failed",
  draft: "Draft",
  cancelled: "Cancelled",
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const days: Array<{ date: Date; inMonth: boolean }> = [];

  // Fill previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, inMonth: false });
  }

  // Current month
  for (let d = 1; d <= totalDays; d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }

  // Fill next month
  const remaining = 42 - days.length; // 6 rows
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month + 1, d), inMonth: false });
  }

  return days;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CampaignCalendar({ className }: CampaignCalendarProps) {
  const locale = getClientLocale();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/marketing/campaigns")
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data.campaigns || data || []);
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  const campaignsByDate = useMemo(() => {
    const map: Record<string, MarketingCampaign[]> = {};
    for (const c of campaigns) {
      const dateStr = c.scheduled_at || c.created_at;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [campaigns]);

  const selectedCampaigns = selectedDate
    ? campaignsByDate[selectedDate] || []
    : [];

  const monthName = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month));

  const weekDays =
    locale === "ar"
      ? ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const goToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(dateKey(today));
  }, [today]);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const todayKey = dateKey(today);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft size={16} />
          </Button>
          <h2 className="min-w-[180px] text-center text-lg font-semibold text-slate-950">
            {monthName}
          </h2>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight size={16} />
          </Button>
        </div>
        <Button variant="outline" onClick={goToday} className="gap-2">
          <CalendarIcon size={14} />
          Today
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn("h-2.5 w-2.5 rounded-full", color)} />
            <span className="text-xs text-slate-600">{STATUS_LABELS[status]}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="rounded-[28px] border border-slate-200/70 bg-white/90 overflow-hidden">
        {/* Week headers */}
        <div className="grid grid-cols-7 border-b border-slate-200/70">
          {weekDays.map((day) => (
            <div
              key={day}
              className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {days.map(({ date, inMonth }, i) => {
            const key = dateKey(date);
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;
            const dayCampaigns = campaignsByDate[key] || [];

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                className={cn(
                  "relative min-h-[80px] border-b border-e border-slate-100 p-2 text-start transition-colors hover:bg-emerald-50/50",
                  !inMonth && "bg-slate-50/50 text-slate-300",
                  isSelected && "bg-emerald-50 ring-2 ring-inset ring-emerald-400",
                  isToday && !isSelected && "bg-emerald-50/30"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
                    isToday && "bg-emerald-600 font-semibold text-white",
                    !isToday && inMonth && "text-slate-900",
                    !inMonth && "text-slate-300"
                  )}
                >
                  {date.getDate()}
                </span>

                {dayCampaigns.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dayCampaigns.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          STATUS_COLORS[c.status] || "bg-slate-400"
                        )}
                        title={c.name}
                      />
                    ))}
                    {dayCampaigns.length > 3 && (
                      <span className="text-[9px] text-slate-400">
                        +{dayCampaigns.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-slate-950 mb-4">
              Campaigns for{" "}
              {new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(new Date(selectedDate + "T00:00:00"))}
            </h3>

            {selectedCampaigns.length === 0 ? (
              <p className="text-sm text-slate-500">
                No campaigns on this date.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedCampaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-[20px] border border-slate-200/70 bg-white/70 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-3 w-3 rounded-full",
                          STATUS_COLORS[c.status] || "bg-slate-400"
                        )}
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {c.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {c.total_recipients} recipients
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium",
                        c.status === "completed" &&
                          "bg-emerald-500/12 text-emerald-700",
                        c.status === "scheduled" &&
                          "bg-sky-500/12 text-sky-700",
                        (c.status === "sending" || c.status === "processing") &&
                          "bg-amber-500/12 text-amber-700",
                        c.status === "failed" &&
                          "bg-red-500/12 text-red-700",
                        c.status === "draft" &&
                          "bg-slate-200/70 text-slate-700"
                      )}
                    >
                      {STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading campaigns...</p>
        </div>
      )}
    </div>
  );
}
