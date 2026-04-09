import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  Megaphone,
  Plus,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { StatsCard } from "@/components/ui/stats-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(value: string | null) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return dateFormatter.format(d);
}

const statusBadge: Record<string, { className: string; label: string }> = {
  draft: { className: "bg-slate-200/70 text-slate-700", label: "Draft" },
  scheduled: { className: "bg-sky-500/12 text-sky-700", label: "Scheduled" },
  processing: { className: "bg-amber-500/12 text-amber-700", label: "Processing" },
  sending: { className: "bg-amber-500/12 text-amber-700", label: "Sending" },
  completed: { className: "bg-emerald-500/12 text-emerald-700", label: "Completed" },
  failed: { className: "bg-red-500/12 text-red-700", label: "Failed" },
  cancelled: { className: "bg-slate-200/70 text-slate-600", label: "Cancelled" },
};

export default async function MarketingHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const [
    templatesResult,
    approvedTemplatesResult,
    campaignsResult,
    activeCampaignsResult,
    recipientsResult,
    recentCampaignsResult,
  ] = await Promise.all([
    adminSupabaseClient
      .from("marketing_templates")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("marketing_templates")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("approval_status", "approved"),
    adminSupabaseClient
      .from("marketing_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("marketing_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .in("status", ["scheduled", "sending", "processing"]),
    adminSupabaseClient
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .in(
        "campaign_id",
        (
          await adminSupabaseClient
            .from("marketing_campaigns")
            .select("id")
            .eq("restaurant_id", restaurant.id)
        ).data?.map((c) => c.id) || []
      ),
    adminSupabaseClient
      .from("marketing_campaigns")
      .select("id, name, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, failed_count, created_at, template_id")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const totalTemplates = templatesResult.count || 0;
  const approvedTemplates = approvedTemplatesResult.count || 0;
  const totalCampaigns = campaignsResult.count || 0;
  const activeCampaigns = activeCampaignsResult.count || 0;
  const totalRecipients = recipientsResult.count || 0;
  const recentCampaigns = recentCampaignsResult.data || [];

  // Get template names for recent campaigns
  const templateIds = recentCampaigns
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

  const quickActions = [
    {
      label: "Create Template with AI",
      description: "Let AI build a WhatsApp-approved template for you.",
      href: "/dashboard/marketing/templates/new",
      icon: Sparkles,
    },
    {
      label: "Launch New Campaign",
      description: "Send templates to your audience list.",
      href: "/dashboard/marketing/campaigns/new",
      icon: Send,
    },
    {
      label: "Manage Templates",
      description: "View, edit, and submit templates for approval.",
      href: "/dashboard/marketing/templates",
      icon: FileText,
    },
    {
      label: "Campaign Calendar",
      description: "See scheduled and past campaigns on a calendar.",
      href: "/dashboard/marketing/calendar",
      icon: CalendarDays,
    },
  ];

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Hero card */}
      <Card className="relative overflow-hidden border-0 bg-[#10221a] text-white shadow-[0_40px_120px_-56px_rgba(5,10,8,0.85)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,196,140,0.28),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_34%)]" />
        <CardContent className="relative p-7 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-50">
              Marketing hub
            </Badge>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_280px] lg:items-end">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-white/48">
                WhatsApp Campaigns
              </p>
              <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
                Reach your customers with targeted campaigns.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/68">
                Create AI-powered templates, manage campaigns, and track delivery
                performance across your audience. Everything in one place for{" "}
                {restaurant.name}.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard/marketing/templates/new"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                >
                  <Sparkles size={16} />
                  Build Template with AI
                </Link>
                <Link
                  href="/dashboard/marketing/campaigns/new"
                  className="rounded-full border border-white/10 bg-white/8 px-5 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/14"
                >
                  New Campaign
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/16 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                Quick stats
              </p>
              <div className="mt-5 space-y-4">
                <div className="flex items-end justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-sm text-white/62">Templates</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
                      {totalTemplates}
                    </p>
                  </div>
                  <span className="text-xs text-white/45">
                    {approvedTemplates} approved
                  </span>
                </div>
                <div className="flex items-end justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-sm text-white/62">Campaigns</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
                      {totalCampaigns}
                    </p>
                  </div>
                  <span className="text-xs text-white/45">
                    {activeCampaigns} active
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-sm text-white/62">Recipients</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
                      {totalRecipients.toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs text-white/45">
                    total contacts
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Templates"
          value={totalTemplates}
          icon={<FileText size={22} />}
          description="WhatsApp message templates created."
          footnote={`${approvedTemplates} approved and ready`}
          tone="emerald"
        />
        <StatsCard
          title="Approved Templates"
          value={approvedTemplates}
          icon={<Sparkles size={22} />}
          description="Templates approved for sending."
          footnote="Available for campaigns"
          tone="sky"
        />
        <StatsCard
          title="Active Campaigns"
          value={activeCampaigns}
          icon={<Megaphone size={22} />}
          description="Campaigns currently scheduled or sending."
          footnote={`${totalCampaigns} total campaigns`}
          tone="amber"
        />
        <StatsCard
          title="Total Recipients"
          value={totalRecipients.toLocaleString()}
          icon={<Users size={22} />}
          description="Contact records across all campaigns."
          footnote="Unique phone numbers"
          tone="rose"
        />
      </div>

      {/* Recent campaigns + Quick actions */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)] xl:items-start">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardDescription>Campaign activity</CardDescription>
              <CardTitle>Recent campaigns</CardTitle>
            </div>
            <Link
              href="/dashboard/marketing/campaigns"
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-800"
            >
              View all
              <ArrowRight size={16} />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentCampaigns.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center">
                <Megaphone
                  size={28}
                  className="mx-auto mb-3 text-slate-400"
                />
                <p className="text-sm font-medium text-slate-700">
                  No campaigns yet
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Create your first campaign to start reaching customers.
                </p>
                <Link
                  href="/dashboard/marketing/campaigns/new"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  <Plus size={14} />
                  New Campaign
                </Link>
              </div>
            ) : (
              recentCampaigns.map((campaign) => {
                const badge = statusBadge[campaign.status] || statusBadge.draft;
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
                  <div
                    key={campaign.id}
                    className="rounded-[24px] border border-slate-200/75 bg-white/70 p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-950">
                            {campaign.name}
                          </h3>
                          <Badge
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-medium",
                              badge.className
                            )}
                          >
                            {badge.label}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Template: {templateName}
                        </p>

                        {/* Progress bar */}
                        {campaign.total_recipients > 0 &&
                          campaign.status !== "draft" && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                <span>
                                  {campaign.sent_count}/{campaign.total_recipients}{" "}
                                  sent
                                </span>
                                <span>{progress}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                        {/* Delivery stats */}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          {campaign.delivered_count > 0 && (
                            <span>Delivered: {campaign.delivered_count}</span>
                          )}
                          {campaign.read_count > 0 && (
                            <span>Read: {campaign.read_count}</span>
                          )}
                          {campaign.failed_count > 0 && (
                            <span className="text-red-600">
                              Failed: {campaign.failed_count}
                            </span>
                          )}
                          <span>
                            {campaign.scheduled_at
                              ? `Scheduled: ${formatDate(campaign.scheduled_at)}`
                              : `Created: ${formatDate(campaign.created_at)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Quick actions</CardDescription>
            <CardTitle>Get started</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-start gap-3 rounded-[24px] border border-slate-200/70 bg-white/70 p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/70"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">
                      {action.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="mt-1 text-slate-400 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
