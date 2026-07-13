import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  BookOpen,
  CheckCircle2,
  MessageSquare,
  Phone,
  Send,
  TrendingUp,
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

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

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
  const completedReadinessItems = readinessItems.filter((item) => item.ready).length;
  const todayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const actionLinks = [
    { label: t("dashboard.refineAI"), description: t("dashboard.refineAIDesc"), href: "/dashboard/ai-agent", icon: Bot },
    { label: t("dashboard.reviewConversations"), description: t("dashboard.reviewConversationsDesc"), href: "/dashboard/conversations", icon: MessageSquare },
    { label: t("dashboard.expandKB"), description: t("dashboard.expandKBDesc"), href: "/dashboard/ai-agent?tab=knowledge", icon: BookOpen },
    { label: t("dashboard.verifyPhone"), description: t("dashboard.verifyPhoneDesc"), href: "/dashboard/restaurant", icon: Phone },
  ];

  return (
    <div className="dashboard-page space-y-7" dir="rtl">
      <HomeRealtimeRefresh restaurantId={restaurant.id} />

      {/* WhatsApp setup alert */}
      {needsWhatsAppSetup ? (
        <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-amber-300 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-amber-100 text-amber-800">
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
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-amber-900 px-5 py-3 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-950 sm:self-center"
          >
            {t("dashboard.whatsappAlertCta", "Set up WhatsApp")}
            <ArrowRight size={16} className="rtl:rotate-180" />
          </Link>
        </div>
      ) : null}

      {/* Page header */}
      <div className="dashboard-page-header">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#20339a]">لوحة التشغيل</p>
          <h1>{restaurant.name}</h1>
          <p>ملخص مباشر للمحادثات، نشاط اليوم، وجاهزية خدمة العملاء.</p>
        </div>
        <div className="text-start sm:text-end">
          <p className="text-sm font-semibold text-[var(--foreground)]">{todayLabel}</p>
          <Badge
            className={cn(
              "mt-2 rounded-[var(--radius-full)] border px-3 py-1 text-xs font-semibold",
              setupStatus === "draft" || setupStatus === "failed"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-[#20339a]/20 bg-[#edf0ff] text-[#20339a]"
            )}
          >
            {setupStatus === "active" ? "النظام يعمل" : setupStatus}
          </Badge>
        </div>
      </div>

      <Link
        href="/dashboard/conversations?tab=requests"
        className={cn(
          "group flex flex-col gap-4 rounded-[var(--radius-lg)] border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between",
          unclaimedEscalations > 0
            ? "border-rose-200 bg-rose-50 hover:bg-rose-100/70"
            : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100/60"
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
            unclaimedEscalations > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
          )}>
            {unclaimedEscalations > 0 ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">
              {unclaimedEscalations > 0
                ? `${unclaimedEscalations} تصعيدات تنتظر تدخلك`
                : "لا توجد تصعيدات مفتوحة الآن"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {unclaimedEscalations > 0 ? "راجعي الطلبات وحددي الإجراء المناسب لكل عميل." : "فريقك والمساعد الذكي يتعاملان مع المحادثات بصورة طبيعية."}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--brand)]">
          {unclaimedEscalations > 0 ? "مراجعة الآن" : "عرض الطلبات"}
          <ArrowRight size={16} className="transition-transform group-hover:ltr:translate-x-0.5 group-hover:rtl:-translate-x-0.5 rtl:rotate-180" />
        </span>
      </Link>

      {/* Overview cards grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title={t("stats.activeConversations")}
          value={activeConversations}
          icon={<MessageSquare size={22} />}
          description={`${activeShare}% من إجمالي المحادثات`}
          footnote={`${totalConversations} ${t("stats.activeConversationsNote")}`}
          tone="emerald"
          className="bg-white"
        />
        <StatsCard
          title={t("stats.messagesToday")}
          value={messagesToday}
          icon={<Send size={22} />}
          description={t("stats.messagesTodayDesc")}
          footnote={`${totalAIMessages} ${t("stats.messagesTodayNote")}`}
          tone="sky"
          className="bg-white"
        />
        <StatsCard
          title={t("stats.responseRate")}
          value={`${responseRate}%`}
          icon={<TrendingUp size={22} />}
          description={t("stats.responseRateDesc")}
          footnote={t("stats.responseRateNote")}
          tone="amber"
          className="bg-white"
        />
        <StatsCard
          title={t("stats.knowledgeBase")}
          value={knowledgeBaseItems}
          icon={<BookOpen size={22} />}
          description={t("stats.knowledgeBaseDesc")}
          footnote={knowledgeBaseItems > 0 ? t("stats.knowledgeBaseNoteFull") : t("stats.knowledgeBaseNoteEmpty")}
          tone="sky"
          className="bg-white"
        />
      </div>

      {/* Main panels */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)] xl:items-start">
        {/* Recent conversations */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-3 border-b border-[var(--line)] sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardDescription>{t("dashboard.liveQueue")}</CardDescription>
              <CardTitle>{t("dashboard.recentConversations")}</CardTitle>
            </div>
            <Link
              href="/dashboard/conversations"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#20339a] transition-colors hover:text-[#172777]"
            >
              {t("dashboard.openInboxLink")}
              <ArrowRight size={16} className="rtl:rotate-180" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentConversations.length === 0 ? (
              <div className="p-10 text-center">
                <MessageSquare className="mx-auto size-6 text-[var(--subtle)]" />
                <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">{t("dashboard.noConversations")}</p>
              </div>
            ) : null}
            {recentConversations.map((conversation) => {
              const latestMessage = latestMessageByConversation.get(conversation.id);
              const active = conversation.status === "active";
              return (
                <Link
                  key={conversation.id}
                  href="/dashboard/conversations"
                  className="group block border-b border-[var(--line)] p-4 transition-colors last:border-b-0 hover:bg-[#f8f9fd] sm:px-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand)]">
                      {(conversation.customer_name || conversation.customer_phone || "C").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-[var(--foreground)]">
                          {conversation.customer_name || conversation.customer_phone}
                        </h3>
                        <span className="text-xs font-medium text-[var(--muted)]">{formatRelativeTimestamp(conversation.last_message_at, t)}</span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm leading-6 text-[var(--muted)]">
                        {latestMessage?.content || t("dashboard.noPreview")}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                        <Badge className={cn("px-2 py-0.5 text-[10px]", active ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-slate-100 text-slate-700")}>{active ? "نشطة" : "مغلقة"}</Badge>
                        <span className="inline-flex items-center gap-1">
                          <Workflow size={13} />
                          {latestMessage?.role === "agent" ? t("dashboard.lastReplyAI") : t("dashboard.awaitingFollowup")}
                        </span>
                        <ArrowRight size={14} className="ms-auto text-[var(--subtle)] transition-transform group-hover:ltr:translate-x-0.5 group-hover:rtl:-translate-x-0.5 rtl:rotate-180" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="grid gap-6">
          {/* Readiness checklist */}
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardDescription>{t("dashboard.launchReadiness")}</CardDescription>
                  <CardTitle>{t("dashboard.operationalChecklist")}</CardTitle>
                </div>
                <span className="text-2xl font-bold tracking-tight text-[var(--brand)]">{readinessScore}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-[var(--radius-full)] bg-[var(--brand-soft)]">
                <div className="h-full rounded-[var(--radius-full)] bg-[var(--brand)]" style={{ width: `${readinessScore}%` }} />
              </div>
              <p className="text-xs text-[var(--muted)]">{completedReadinessItems} من {readinessItems.length} مكتملة{focusItem ? ` · التالي: ${focusItem.label}` : ""}</p>
            </CardHeader>
            <CardContent className="divide-y divide-[var(--line)] pt-0">
              {readinessItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
                      item.ready ? "bg-[#edf0ff] text-[#20339a]" : "bg-amber-100 text-amber-800"
                    )}
                  >
                    {item.ready ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{item.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AI agent card */}
          <Card className="overflow-hidden border-0 bg-[#20339a] text-white shadow-[0_24px_60px_-40px_rgba(17,29,87,0.8)]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white/10 text-[#ffc400]"><Bot size={19} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white/70">{t("dashboard.activeAgent")}</p>
                  <p className="mt-1 text-lg font-bold text-white">{aiAgent?.name || t("dashboard.configMissing")}</p>
                  <p className="mt-1 text-xs text-white/70">{aiAgent?.personality || t("dashboard.na")} · {aiAgent?.language_preference || t("dashboard.na")}</p>
                </div>
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" aria-label="نشط" />
              </div>
              <Link href="/dashboard/ai-agent" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#fff3bf] hover:text-white">
                {t("dashboard.tuneAgent")}<ArrowRight size={15} className="rtl:rotate-180" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <section>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">{t("dashboard.fastActions")}</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--foreground)]">{t("dashboard.fastActionsDesc")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actionLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href} className="group flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-white p-4 transition-colors hover:border-[#20339a]/25 hover:bg-[var(--brand-soft)]">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-[var(--brand)] group-hover:bg-white"><Icon size={17} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--foreground)]">{link.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{link.description}</p>
                </div>
                <ArrowRight size={15} className="mt-1 text-[var(--subtle)] transition-transform group-hover:ltr:translate-x-0.5 group-hover:rtl:-translate-x-0.5 rtl:rotate-180" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
