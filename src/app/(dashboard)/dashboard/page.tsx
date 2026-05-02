import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  BookOpen,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import { StatsCard } from "@/components/ui/stats-card";
import { HomeRealtimeRefresh } from "@/components/dashboard/home-realtime-refresh";

export const dynamic = "force-dynamic";
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
import {
  getActiveAgentForRestaurant,
  getCurrentUser,
  getRestaurantForUserId,
} from "@/lib/tenant";
import { getLocale, createTranslator } from "@/lib/i18n";

function formatRelativeTimestamp(value: string | null, t: (k: string) => string) {
  if (!value) return t("dashboard.noActivity");
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return t("dashboard.unknownTime");
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return t("dashboard.justNow");
  if (diffMinutes < 60) return `${diffMinutes}${t("time.mAgo")}`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}${t("time.hAgo")}`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}${t("time.dAgo")}`;
}

function formatTimestamp(value: string | null, formatter: Intl.DateTimeFormat, t: (k: string) => string) {
  if (!value) return t("dashboard.noTimestamp");
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return t("dashboard.unknownTime");
  return formatter.format(timestamp);
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const aiAgent = await getActiveAgentForRestaurant(restaurant.id);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    conversationsResult,
    activeConversationsResult,
    restaurantConversationIdsResult,
    knowledgeBaseResult,
    recentConversationsResult,
    unclaimedEscalationsResult,
  ] = await Promise.all([
    adminSupabaseClient
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("status", "active"),
    adminSupabaseClient
      .from("conversations")
      .select("id")
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("knowledge_base")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("conversations")
      .select("id, customer_name, customer_phone, status, last_message_at")
      .eq("restaurant_id", restaurant.id)
      .order("last_message_at", { ascending: false })
      .limit(5),
    adminSupabaseClient
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("type", "escalation")
      .is("assigned_to", null)
      .eq("status", "pending"),
  ]);

  const recentConversations = recentConversationsResult.data || [];
  const restaurantConversationIds = (restaurantConversationIdsResult.data || []).map((item) => item.id);
  const recentConversationIds = recentConversations.map((item) => item.id);

  const [allTodayMessagesResult, recentMessagesResult] = await Promise.all([
    restaurantConversationIds.length
      ? adminSupabaseClient
          .from("messages")
          .select("id, conversation_id, role, content, created_at")
          .in("conversation_id", restaurantConversationIds)
          .gte("created_at", todayStart.toISOString())
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as Array<{ id: string; conversation_id: string; role: string; content: string; created_at: string }> }),
    recentConversationIds.length
      ? adminSupabaseClient
          .from("messages")
          .select("id, conversation_id, role, content, created_at")
          .in("conversation_id", recentConversationIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as Array<{ id: string; conversation_id: string; role: string; content: string; created_at: string }> }),
  ]);

  const allTodayMessages = allTodayMessagesResult.data || [];
  const recentMessages = recentMessagesResult.data || [];

  const latestMessageByConversation = new Map<string, { content: string; created_at: string; role: string }>();
  for (const message of recentMessages) {
    if (!latestMessageByConversation.has(message.conversation_id)) {
      latestMessageByConversation.set(message.conversation_id, message);
    }
  }

  const totalConversations = conversationsResult.count || 0;
  const activeConversations = activeConversationsResult.count || 0;
  const messagesToday = allTodayMessages.length;
  const totalAIMessages = allTodayMessages.filter((item) => item.role === "agent").length;
  const responseRate =
    totalConversations > 0
      ? Math.round((Math.min(totalAIMessages, totalConversations) / totalConversations) * 100)
      : 0;
  const knowledgeBaseItems = knowledgeBaseResult.count || 0;
  const activeShare = totalConversations > 0 ? Math.round((activeConversations / totalConversations) * 100) : 0;
  const unclaimedEscalations = unclaimedEscalationsResult.count || 0;

  const setupStatus = restaurant.setup_status || "draft";
  const needsWhatsAppSetup = !restaurant.twilio_phone_number || setupStatus !== "active";

  const readinessItems = [
    {
      label: t("readiness.restaurantSetup"),
      description:
        setupStatus === "draft" || setupStatus === "failed"
          ? t("readiness.restaurantSetupPending")
          : t("readiness.restaurantSetupDone"),
      ready: setupStatus !== "draft" && setupStatus !== "failed",
    },
    {
      label: t("readiness.aiAgent"),
      description: aiAgent?.name
        ? `${aiAgent.name} ${t("readiness.aiAgentActive")}`
        : t("readiness.aiAgentPending"),
      ready: Boolean(aiAgent?.name),
    },
    {
      label: t("readiness.knowledgeBase"),
      description:
        knowledgeBaseItems > 0
          ? `${knowledgeBaseItems} ${t("readiness.knowledgeBaseFull")}`
          : t("readiness.knowledgeBaseEmpty"),
      ready: knowledgeBaseItems > 0,
    },
    {
      label: t("readiness.whatsappRouting"),
      description: restaurant.twilio_phone_number
        ? `${t("readiness.whatsappConnected")} ${restaurant.twilio_phone_number}.`
        : t("readiness.whatsappPending"),
      ready: Boolean(restaurant.twilio_phone_number),
    },
  ];

  const readinessScore = Math.round(
    (readinessItems.filter((item) => item.ready).length / readinessItems.length) * 100
  );
  const focusItem = readinessItems.find((item) => !item.ready);

  const actionLinks = [
    { label: t("dashboard.refineAI"), description: t("dashboard.refineAIDesc"), href: "/dashboard/ai-agent", icon: Bot },
    { label: t("dashboard.reviewConversations"), description: t("dashboard.reviewConversationsDesc"), href: "/dashboard/conversations", icon: MessageSquare },
    { label: t("dashboard.expandKB"), description: t("dashboard.expandKBDesc"), href: "/dashboard/knowledge-base", icon: BookOpen },
    { label: t("dashboard.verifyPhone"), description: t("dashboard.verifyPhoneDesc"), href: "/dashboard/restaurant", icon: Phone },
  ];

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      <HomeRealtimeRefresh restaurantId={restaurant.id} />

      {/* WhatsApp setup alert */}
      {needsWhatsAppSetup ? (
        <div className="flex flex-col gap-4 rounded-[28px] border border-amber-300/70 bg-amber-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {restaurant.twilio_phone_number
                  ? t("dashboard.whatsappPendingTitle", "Finish connecting your WhatsApp number")
                  : t("dashboard.whatsappMissingTitle", "Connect your WhatsApp number")}
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-900/85">
                {t("dashboard.whatsappAlertBody", "Your bot can't send or receive messages until a phone number is registered.")}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/whatsapp-setup"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-amber-900 px-5 py-3 text-sm font-semibold text-amber-50 transition-transform hover:-translate-y-0.5 sm:self-center"
          >
            {t("dashboard.whatsappAlertCta", "Set up WhatsApp")}
            <ArrowRight size={16} className="rtl:rotate-180" />
          </Link>
        </div>
      ) : null}

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">{restaurant.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">مركز خدمة العملاء — واتساب</p>
        </div>
        <Badge
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            setupStatus === "draft" || setupStatus === "failed"
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-emerald-300 bg-emerald-50 text-emerald-700"
          )}
        >
          {setupStatus}
        </Badge>
      </div>

      {/* Overview cards grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatsCard
          title="تصعيدات مفتوحة"
          value={unclaimedEscalations}
          icon={<Inbox size={22} />}
          description={unclaimedEscalations > 0 ? "تحتاج تدخلاً بشرياً الآن" : "لا تصعيدات مفتوحة"}
          footnote="صندوق التصعيدات"
          tone="rose"
        />
        <StatsCard
          title={t("stats.activeConversations")}
          value={activeConversations}
          icon={<MessageSquare size={22} />}
          description={`${activeShare}% من إجمالي المحادثات`}
          footnote={`${totalConversations} ${t("stats.activeConversationsNote")}`}
          tone="emerald"
        />
        <StatsCard
          title={t("stats.messagesToday")}
          value={messagesToday}
          icon={<Send size={22} />}
          description={t("stats.messagesTodayDesc")}
          footnote={`${totalAIMessages} ${t("stats.messagesTodayNote")}`}
          tone="sky"
        />
        <StatsCard
          title={t("stats.responseRate")}
          value={`${responseRate}%`}
          icon={<TrendingUp size={22} />}
          description={t("stats.responseRateDesc")}
          footnote={t("stats.responseRateNote")}
          tone="amber"
        />
        <StatsCard
          title={t("stats.knowledgeBase")}
          value={knowledgeBaseItems}
          icon={<BookOpen size={22} />}
          description={t("stats.knowledgeBaseDesc")}
          footnote={knowledgeBaseItems > 0 ? t("stats.knowledgeBaseNoteFull") : t("stats.knowledgeBaseNoteEmpty")}
          tone="sky"
        />
        <StatsCard
          title="جاهزية النظام"
          value={`${readinessScore}%`}
          icon={<Sparkles size={22} />}
          description={focusItem ? `التركيز: ${focusItem.label}` : "النظام جاهز بالكامل"}
          footnote={`${readinessItems.filter((i) => i.ready).length} / ${readinessItems.length} مكتمل`}
          tone="emerald"
        />
      </div>

      {/* Main panels */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)] xl:items-start">
        {/* Recent conversations */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardDescription>{t("dashboard.liveQueue")}</CardDescription>
              <CardTitle>{t("dashboard.recentConversations")}</CardTitle>
            </div>
            <Link
              href="/dashboard/conversations"
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-800"
            >
              {t("dashboard.openInboxLink")}
              <ArrowRight size={16} className="rtl:rotate-180" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentConversations.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-600">
                {t("dashboard.noConversations")}
              </div>
            ) : null}
            {recentConversations.map((conversation) => {
              const latestMessage = latestMessageByConversation.get(conversation.id);
              const active = conversation.status === "active";
              return (
                <div
                  key={conversation.id}
                  className="rounded-[26px] border border-slate-200/75 bg-white/70 p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
                      {(conversation.customer_name || conversation.customer_phone || "C").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-950">
                          {conversation.customer_name || conversation.customer_phone}
                        </h3>
                        <Badge
                          variant={active ? "default" : "secondary"}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                            active ? "bg-emerald-500/12 text-emerald-700" : "bg-slate-200/70 text-slate-700"
                          )}
                        >
                          {conversation.status}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                        {latestMessage?.content || t("dashboard.noPreview")}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={13} />
                          {formatRelativeTimestamp(conversation.last_message_at, t)}
                        </span>
                        <span>{t("dashboard.lastUpdate")} {formatTimestamp(conversation.last_message_at, dateFormatter, t)}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Workflow size={13} />
                          {latestMessage?.role === "agent" ? t("dashboard.lastReplyAI") : t("dashboard.awaitingFollowup")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="grid gap-6">
          {/* AI agent card */}
          <Card className="overflow-hidden border-0 bg-[#173126] text-white shadow-[0_30px_90px_-54px_rgba(8,18,13,0.78)]">
            <CardHeader>
              <CardDescription className="text-emerald-50/70">{t("dashboard.activeAgent")}</CardDescription>
              <CardTitle className="text-white">{aiAgent?.name || t("dashboard.configMissing")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/62">{t("dashboard.personality")}</span>
                  <span className="text-sm font-medium capitalize text-white">{aiAgent?.personality || t("dashboard.na")}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-white/62">{t("dashboard.language")}</span>
                  <span className="text-sm font-medium text-white">{aiAgent?.language_preference || t("dashboard.na")}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-white/62">{t("dashboard.whatsappNumber")}</span>
                  <span className="text-sm font-medium text-white">{restaurant.twilio_phone_number || t("dashboard.pending")}</span>
                </div>
              </div>
              <Link
                href="/dashboard/ai-agent"
                className="inline-flex items-center gap-2 text-sm font-medium text-emerald-100 transition-colors hover:text-white"
              >
                {t("dashboard.tuneAgent")}
                <ArrowRight size={16} className="rtl:rotate-180" />
              </Link>
            </CardContent>
          </Card>

          {/* Readiness checklist */}
          <Card>
            <CardHeader>
              <CardDescription>{t("dashboard.launchReadiness")}</CardDescription>
              <CardTitle>{t("dashboard.operationalChecklist")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {readinessItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-[24px] border border-slate-200/75 bg-white/70 p-4"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
                      item.ready ? "bg-emerald-500/12 text-emerald-700" : "bg-amber-500/12 text-amber-700"
                    )}
                  >
                    {item.ready ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardDescription>{t("dashboard.fastActions")}</CardDescription>
              <CardTitle>{t("dashboard.fastActionsDesc")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {actionLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group flex items-center gap-3 rounded-[20px] border border-slate-200/70 bg-white/70 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/70"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Icon size={16} />
                    </div>
                    <p className="text-sm font-medium text-slate-950">{link.label}</p>
                    <ArrowRight
                      size={15}
                      className="ms-auto text-slate-400 transition-transform group-hover:ltr:translate-x-0.5 group-hover:rtl:-translate-x-0.5 rtl:rotate-180"
                    />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
