import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Megaphone,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampaignStats } from "@/components/dashboard/campaign-stats";
import { cn } from "@/lib/utils";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import type { MarketingCampaign } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(value: string | null) {
  if (!value) return "N/A";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "N/A" : dateFormatter.format(d);
}

const statusBadge: Record<
  string,
  { className: string; label: string; icon: typeof CheckCircle2 }
> = {
  draft: { className: "bg-slate-200/70 text-slate-700", label: "Draft", icon: Clock },
  scheduled: { className: "bg-sky-500/12 text-sky-700", label: "Scheduled", icon: Clock },
  processing: { className: "bg-amber-500/12 text-amber-700", label: "Processing", icon: Loader2 },
  sending: { className: "bg-amber-500/12 text-amber-700", label: "Sending", icon: Send },
  completed: { className: "bg-emerald-500/12 text-emerald-700", label: "Completed", icon: CheckCircle2 },
  failed: { className: "bg-red-500/12 text-red-700", label: "Failed", icon: XCircle },
  cancelled: { className: "bg-slate-200/70 text-slate-600", label: "Cancelled", icon: XCircle },
};

export default async function CampaignsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const { data: campaigns } = await adminSupabaseClient
    .from("marketing_campaigns")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false });

  const allCampaigns = (campaigns || []) as MarketingCampaign[];

  // Get template names
  const templateIds = allCampaigns
    .map((c) => c.template_id)
    .filter(Boolean) as string[];
  let templateNames: Record<string, string> = {};
  if (templateIds.length > 0) {
    const { data: templates } = await adminSupabaseClient
      .from("marketing_templates")
      .select("id, name")
      .in("id", templateIds);
    if (templates) {
      templateNames = Object.fromEntries(templates.map((t) => [t.id, t.name]));
    }
  }

  const draftCount = allCampaigns.filter((c) => c.status === "draft").length;
  const scheduledCount = allCampaigns.filter((c) => c.status === "scheduled").length;
  const sendingCount = allCampaigns.filter((c) =>
    ["sending", "processing"].includes(c.status)
  ).length;
  const completedCount = allCampaigns.filter((c) => c.status === "completed").length;

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Campaign Manager
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Create, schedule, and track WhatsApp marketing campaigns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/marketing/calendar">
            <Button variant="outline" className="gap-2 rounded-full">
              <Clock size={16} />
              Calendar
            </Button>
          </Link>
          <Link href="/dashboard/marketing/campaigns/new">
            <Button className="gap-2 rounded-full">
              <Plus size={16} />
              New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Draft", count: draftCount, color: "text-slate-600" },
          { label: "Scheduled", count: scheduledCount, color: "text-sky-600" },
          { label: "Sending", count: sendingCount, color: "text-amber-600" },
          { label: "Completed", count: completedCount, color: "text-emerald-600" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[24px] border border-slate-200/70 bg-white/70 p-4 text-center"
          >
            <p className={cn("text-2xl font-semibold", stat.color)}>
              {stat.count}
            </p>
            <p className="text-xs font-medium text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Campaign list */}
      {allCampaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone size={40} className="mb-4 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-900">
              No campaigns yet
            </h3>
            <p className="mt-2 max-w-sm text-center text-sm text-slate-500">
              Create your first campaign to start reaching your customers with
              targeted WhatsApp messages.
            </p>
            <Link href="/dashboard/marketing/campaigns/new" className="mt-6">
              <Button className="gap-2 rounded-full">
                <Plus size={16} />
                Create Campaign
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allCampaigns.map((campaign) => {
            const badge = statusBadge[campaign.status] || statusBadge.draft;
            const BadgeIcon = badge.icon;
            const templateName = campaign.template_id
              ? templateNames[campaign.template_id] || "Unknown template"
              : "No template";
            const progress =
              campaign.total_recipients > 0
                ? Math.round(
                    (campaign.sent_count / campaign.total_recipients) * 100
                  )
                : 0;

            return (
              <Card key={campaign.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {/* Left: campaign info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">
                          {campaign.name}
                        </h3>
                        <Badge
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                            badge.className
                          )}
                        >
                          <BadgeIcon size={12} className="me-1" />
                          {badge.label}
                        </Badge>
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        Template: {templateName}
                      </p>

                      {/* Schedule info */}
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                        {campaign.scheduled_at && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock size={12} />
                            Scheduled: {formatDate(campaign.scheduled_at)}
                          </span>
                        )}
                        <span>
                          Created: {formatDate(campaign.created_at)}
                        </span>
                        <span>
                          {campaign.total_recipients.toLocaleString()} recipients
                        </span>
                      </div>

                      {/* Progress bar for non-draft */}
                      {campaign.total_recipients > 0 &&
                        campaign.status !== "draft" && (
                          <div className="mt-4 max-w-md">
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                              <span>
                                {campaign.sent_count.toLocaleString()}/
                                {campaign.total_recipients.toLocaleString()} sent
                              </span>
                              <span>{progress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  campaign.status === "failed"
                                    ? "bg-red-500"
                                    : "bg-emerald-500"
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                    </div>

                    {/* Right: stats + actions */}
                    <div className="flex flex-col items-end gap-3">
                      {/* Delivery stats for completed/sending */}
                      {(campaign.status === "completed" ||
                        campaign.status === "sending") &&
                        campaign.total_recipients > 0 && (
                          <div className="w-full min-w-[220px] lg:w-[240px]">
                            <CampaignStats
                              total={campaign.total_recipients}
                              sent={campaign.sent_count}
                              delivered={campaign.delivered_count}
                              read={campaign.read_count}
                              failed={campaign.failed_count}
                            />
                          </div>
                        )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {(campaign.status === "draft" ||
                          campaign.status === "scheduled") && (
                          <form
                            action={`/api/marketing/campaigns/${campaign.id}/send`}
                            method="POST"
                          >
                            <Button
                              type="submit"
                              size="sm"
                              className="gap-1.5 rounded-full text-xs"
                            >
                              <Send size={12} />
                              Send Now
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error message */}
                  {campaign.error_message && (
                    <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3">
                      <p className="text-xs text-red-700">
                        {campaign.error_message}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
