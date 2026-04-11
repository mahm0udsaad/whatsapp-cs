"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CampaignCalendar } from "@/components/dashboard/campaign-calendar";

export default function CalendarPage() {
  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/dashboard/marketing/campaigns"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
        >
          <ArrowRight size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            تقويم الحملات
          </h1>
          <p className="text-sm text-slate-500">
            راجع الحملات المجدولة والسابقة ضمن تقويم شهري
          </p>
        </div>
      </div>

      <CampaignCalendar />
    </div>
  );
}
