import { useCallback, useMemo } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { endOfDay, formatDistanceToNow, startOfDay } from "date-fns";
import { ar } from "date-fns/locale";
import {
  getAiStatus,
  getApprovals,
  getKpisToday,
  getTeamPerformance,
  getTeamRoster,
  getWhatsAppHealth,
  listCustomersPaginated,
  listMarketingCampaigns,
  toggleAi,
  type AiStatus,
  type CustomerDirectoryRow,
  type MarketingCampaignRow,
  type OverviewSummary,
  type PendingApproval,
  type TeamMemberRosterRow,
  type TeamPerformanceRow,
  type WhatsAppHealth,
} from "../../lib/api";
import { escalationReasonLabel } from "../../lib/escalation-labels";
import { captureMessage } from "../../lib/observability";
import { qk } from "../../lib/query-keys";
import { useSessionStore } from "../../lib/session-store";
import {
  DashboardSkeleton,
  ManagerCard,
  PriorityAction,
  SectionHeader,
  managerColors,
} from "../../components/manager-ui";
import { ExtractedIntentCard } from "../../components/extracted-intent-card";

export default function OverviewScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();
  const todayRange = useMemo(
    () => ({
      from: startOfDay(new Date()).toISOString(),
      to: endOfDay(new Date()).toISOString(),
    }),
    []
  );

  const aiQuery = useQuery({
    queryKey: qk.aiStatus(restaurantId),
    enabled: !!restaurantId,
    queryFn: getAiStatus,
    refetchInterval: 30_000,
  });

  const kpisQuery = useQuery({
    queryKey: qk.kpisToday(restaurantId),
    enabled: !!restaurantId,
    queryFn: getKpisToday,
    refetchInterval: 20_000,
  });

  const approvalsQuery = useQuery({
    queryKey: qk.approvals(restaurantId),
    enabled: !!restaurantId,
    queryFn: getApprovals,
    refetchInterval: 30_000,
  });

  const waHealthQuery = useQuery({
    queryKey: qk.whatsappHealth(restaurantId),
    enabled: !!restaurantId,
    queryFn: getWhatsAppHealth,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const rosterQuery = useQuery({
    queryKey: qk.teamRoster(restaurantId),
    enabled: !!restaurantId,
    queryFn: getTeamRoster,
    refetchInterval: 30_000,
  });

  const perfQuery = useQuery({
    queryKey: qk.teamPerformance(restaurantId, todayRange.from, todayRange.to),
    enabled: !!restaurantId,
    queryFn: () => getTeamPerformance(todayRange.from, todayRange.to),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const campaignsQuery = useQuery({
    queryKey: qk.marketingCampaigns(restaurantId),
    enabled: !!restaurantId,
    queryFn: listMarketingCampaigns,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const customersQuery = useQuery({
    queryKey: qk.customers(restaurantId, "", 1, "all"),
    enabled: !!restaurantId,
    queryFn: () => listCustomersPaginated({ page: 1, pageSize: 1 }),
    staleTime: 60_000,
  });

  const optedOutCustomersQuery = useQuery({
    queryKey: qk.customers(restaurantId, "", 1, "opted_out"),
    enabled: !!restaurantId,
    queryFn: () =>
      listCustomersPaginated({ page: 1, pageSize: 1, optedOut: true }),
    staleTime: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleAi(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.aiStatus(restaurantId) });
      qc.invalidateQueries({ queryKey: qk.overviewSummary(restaurantId) });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "تعذر التحديث";
      Alert.alert("خطأ", msg);
    },
  });

  const confirmToggleAi = useCallback(
    (target: boolean) => {
      if (target === false) {
        Alert.alert(
          "إيقاف المساعد الذكي",
          "هل أنت متأكد؟ سيتوقف الرد التلقائي لجميع المحادثات.",
          [
            { text: "إلغاء", style: "cancel" },
            {
              text: "إيقاف",
              style: "destructive",
              onPress: () => toggleMutation.mutate(false),
            },
          ]
        );
      } else {
        toggleMutation.mutate(true);
      }
    },
    [toggleMutation]
  );

  const refetchAll = useCallback(() => {
    aiQuery.refetch();
    kpisQuery.refetch();
    approvalsQuery.refetch();
    waHealthQuery.refetch();
    rosterQuery.refetch();
    perfQuery.refetch();
    campaignsQuery.refetch();
    customersQuery.refetch();
    optedOutCustomersQuery.refetch();
  }, [
    aiQuery,
    kpisQuery,
    approvalsQuery,
    waHealthQuery,
    rosterQuery,
    perfQuery,
    campaignsQuery,
    customersQuery,
    optedOutCustomersQuery,
  ]);

  const isRefreshing =
    aiQuery.isFetching ||
    kpisQuery.isFetching ||
    approvalsQuery.isFetching ||
    waHealthQuery.isFetching ||
    rosterQuery.isFetching ||
    perfQuery.isFetching ||
    campaignsQuery.isFetching ||
    customersQuery.isFetching ||
    optedOutCustomersQuery.isFetching;

  const ai: AiStatus | undefined = aiQuery.data;
  const kpis: OverviewSummary | undefined = kpisQuery.data;
  const waHealth: WhatsAppHealth | undefined = waHealthQuery.data;
  const roster = useMemo<TeamMemberRosterRow[]>(
    () => (Array.isArray(rosterQuery.data) ? rosterQuery.data : []),
    [rosterQuery.data]
  );
  const teamPerformanceRows = useMemo<TeamPerformanceRow[]>(
    () => (Array.isArray(perfQuery.data?.rows) ? perfQuery.data.rows : []),
    [perfQuery.data]
  );
  const campaigns = useMemo<MarketingCampaignRow[]>(
    () => (Array.isArray(campaignsQuery.data) ? campaignsQuery.data : []),
    [campaignsQuery.data]
  );
  const customers: CustomerDirectoryRow[] = customersQuery.data?.rows ?? [];
  const totalCustomers = customersQuery.data?.total ?? 0;
  const optedOutCustomers = optedOutCustomersQuery.data?.total ?? 0;
  const latestCustomer = customers[0];

  const approvalsRaw = approvalsQuery.data as unknown;
  const approvals: PendingApproval[] = Array.isArray(approvalsRaw)
    ? (approvalsRaw as PendingApproval[])
    : [];
  if (approvalsRaw !== undefined && !Array.isArray(approvalsRaw)) {
    captureMessage(
      "/api/mobile/approvals returned non-array shape",
      "warning",
      {
        shape: typeof approvalsRaw,
        preview:
          typeof approvalsRaw === "string"
            ? (approvalsRaw as string).slice(0, 80)
            : approvalsRaw,
      }
    );
  }

  const hasAlerts = useMemo(() => {
    if (!kpis) return false;
    return (
      kpis.unassignedCount > 0 ||
      kpis.expiredCount > 0 ||
      approvals.length > 0
    );
  }, [approvals.length, kpis]);

  const needsAttentionCount =
    (kpis?.unassignedCount ?? 0) +
    (kpis?.expiredCount ?? 0) +
    approvals.length;

  const activeTeamCount = roster.filter((m) => m.is_available).length;
  const onShiftCount = roster.filter((m) => m.on_shift_now).length;
  const overloadedCount = roster.filter((m) => m.active_conversations >= 5).length;
  const missingPushCount = roster.filter((m) => !m.has_push_device).length;
  const busiestMember =
    roster
      .slice()
      .sort((a, b) => b.active_conversations - a.active_conversations)[0] ?? null;

  const perfTotals = teamPerformanceRows.reduce(
    (acc, row) => ({
      messages: acc.messages + row.messages_sent,
      conversations: acc.conversations + row.conversations_handled,
      breaches: acc.breaches + row.sla_breaches,
    }),
    { messages: 0, conversations: 0, breaches: 0 }
  );
  const topPerformer =
    teamPerformanceRows
      .slice()
      .sort((a, b) => b.messages_sent - a.messages_sent)[0] ?? null;

  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status === "sending" || campaign.status === "scheduled"
  );
  const completedCampaigns = campaigns.filter(
    (campaign) => campaign.status === "completed"
  );
  const latestCampaign =
    campaigns
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0] ?? null;
  const campaignTotals = campaigns.reduce(
    (acc, campaign) => ({
      delivered: acc.delivered + campaign.delivered_count,
      read: acc.read + campaign.read_count,
    }),
    { delivered: 0, read: 0 }
  );
  const readRate =
    campaignTotals.delivered > 0
      ? Math.round((campaignTotals.read / campaignTotals.delivered) * 100)
      : 0;

  if (!restaurantId) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  if (kpisQuery.isLoading && !kpis) {
    return (
      <View style={styles.screen}>
        <DashboardSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} />
        }
      >
        <View
          style={styles.heroCard}
        >
          <View style={styles.heroOrbLeft} />
          <View style={styles.heroOrbRight} />
          <View style={styles.heroRow}>
            <View style={styles.heroContent}>
              <View style={styles.heroBrandRow}>
                <Image
                  source={require("../../assets/logo.png")}
                  style={{ width: 28, height: 28, borderRadius: 6 }}
                  resizeMode="cover"
                />
                <Text style={styles.heroBrandText}>
                  Nehgz Bot
                </Text>
              </View>
              <Text style={styles.heroTitle}>
                {hasAlerts ? "يحتاج متابعة الآن" : "الصورة التشغيلية واضحة"}
              </Text>
              <Text style={styles.heroDescription}>
                {hasAlerts
                  ? "ابدأ بالحالات العاجلة ثم تابع الفريق والنمو من نفس الشاشة."
                  : "لا توجد حالات حرجة الآن، ويمكنك متابعة الأداء والحملات من الأسفل."}
              </Text>
              <View style={styles.heroPillsRow}>
                <HeroPill
                  icon="sparkles"
                  label={ai?.enabled ? "الأتمتة تعمل" : "الأتمتة متوقفة"}
                />
                <HeroPill
                  icon="people"
                  label={`${activeTeamCount} متاح الآن`}
                />
                <HeroPill
                  icon="logo-whatsapp"
                  label={waHealth?.primary?.label ?? "واتساب قيد التحقق"}
                />
              </View>
            </View>
            <View
              style={[
                styles.heroCountCard,
                hasAlerts ? styles.heroCountCardDanger : styles.heroCountCardNormal,
              ]}
            >
              <Text style={[styles.heroCountValue, hasAlerts ? styles.heroCountTextLight : styles.heroCountTextDark]}>
                {needsAttentionCount}
              </Text>
              <Text style={[styles.heroCountLabel, hasAlerts ? styles.heroCountTextLight : styles.heroCountTextDark]}>
                عاجل
              </Text>
            </View>
          </View>
          <View style={styles.heroActionsRow}>
            <Pressable
              onPress={() => router.push("/(app)/inbox")}
              style={styles.heroPrimaryAction}
            >
              <Text style={styles.heroPrimaryActionText}>
                فتح المحادثات
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmToggleAi(!(ai?.enabled ?? true))}
              disabled={toggleMutation.isPending}
              style={styles.heroSecondaryAction}
            >
              <Text style={styles.heroSecondaryActionText}>
                {ai?.enabled ? "إيقاف البوت" : "تشغيل البوت"}
              </Text>
            </Pressable>
          </View>
        </View>

        <OrdersWidget approvals={approvals} />

        {hasAlerts && kpis ? (
          <View style={styles.alertStack}>
            {kpis.unassignedCount > 0 ? (
              <PriorityAction
                title="محادثات غير مستلمة"
                description="تحتاج موظف أو تحويل للبوت."
                value={kpis.unassignedCount}
                tone="danger"
                icon="chatbubble-ellipses-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(app)/inbox",
                    params: { filter: "unassigned" },
                  })
                }
              />
            ) : null}
            {kpis.expiredCount > 0 ? (
              <PriorityAction
                title="محادثات خارج نافذة الرد"
                description="راجع سياسة قوالب واتساب قبل الرد."
                value={kpis.expiredCount}
                tone="warning"
                icon="time-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(app)/inbox",
                    params: { filter: "expired" },
                  })
                }
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.operationalSection}>
          <SectionHeader title="نظرة عامة على التشغيل" />
          <View style={styles.operationalCard}>
            <View style={styles.operationalHeaderRow}>
              <View style={styles.operationalHeaderContent}>
                <Text style={styles.operationalEyebrow}>
                  التشغيل الآن
                </Text>
                <View style={styles.operationalStatusRow}>
                  <View
                    style={[
                      styles.operationalStatusDot,
                      ai?.enabled
                        ? styles.operationalStatusDotOn
                        : styles.operationalStatusDotOff,
                    ]}
                  />
                  <Text style={styles.operationalStatusText}>
                    {ai?.enabled ? "المساعد الذكي نشط" : "المساعد الذكي متوقف"}
                  </Text>
                </View>
              </View>
              <View style={styles.operationalBadge}>
                <View style={styles.operationalBadgeRow}>
                  <Ionicons name="people" size={15} color="#5E6A99" />
                  <Text style={styles.operationalBadgeValue}>
                    {kpis?.agentsOnShiftCount ?? 0}
                  </Text>
                  <Text style={styles.operationalBadgeLabel}>متاح</Text>
                </View>
              </View>
            </View>
            <View style={styles.operationalMetricsGrid}>
              <MetricFeatureCard
                icon="hardware-chip"
                iconColor="#011F91"
                borderClass="border-[#E1E7FB]"
                bgClass="bg-[#F7F9FF]"
                value={kpis?.botActiveCount ?? 0}
                label="مع المساعد"
                hint="محادثات يرد عليها البوت"
                valueClass="text-[#16245C]"
                labelClass="text-[#011F91]"
                hintClass="text-[#44559A]"
              />
              <MetricFeatureCard
                icon="person"
                iconColor="#FCBD05"
                borderClass="border-[#F6E5AF]"
                bgClass="bg-[#FFFBEF]"
                value={kpis?.humanActiveCount ?? 0}
                label="مع الفريق"
                hint="محادثات مع الموظفين"
                valueClass="text-[#8A5E00]"
                labelClass="text-[#8A5E00]"
                hintClass="text-[#A37200]"
              />
              <MetricFeatureCard
                icon="time"
                iconColor="#D97706"
                borderClass="border-amber-200"
                bgClass="bg-amber-50"
                value={kpis?.unassignedCount ?? 0}
                label="في الانتظار"
                hint="لم يتم استلامها بعد"
                valueClass="text-amber-900"
                labelClass="text-amber-900"
                hintClass="text-amber-700/80"
              />
              <MetricFeatureCard
                icon="mail-unread-outline"
                iconColor="#011F91"
                borderClass="border-[#D6DDF8]"
                bgClass="bg-[#EDF2FF]"
                value={kpis?.unreadCount ?? 0}
                label="غير مقروءة"
                hint="محادثات فيها رسائل لم تُراجع بعد"
                valueClass="text-[#16245C]"
                labelClass="text-[#011F91]"
                hintClass="text-[#44559A]"
              />
              <MetricFeatureCard
                icon="warning"
                iconColor="#E11D48"
                borderClass="border-red-200"
                bgClass="bg-red-50"
                value={kpis?.expiredCount ?? 0}
                label="خارج النافذة"
                hint="تتطلب قوالب للرد"
                valueClass="text-red-900"
                labelClass="text-red-900"
                hintClass="text-red-700/80"
              />
            </View>
          </View>
        </View>

        <TeamPulseCard
          rosterCount={roster.length}
          activeTeamCount={activeTeamCount}
          onShiftCount={onShiftCount}
          overloadedCount={overloadedCount}
          missingPushCount={missingPushCount}
          totals={perfTotals}
          busiestMember={busiestMember}
          topPerformer={topPerformer}
        />

        <GrowthPulseCard
          totalCustomers={totalCustomers}
          optedOutCustomers={optedOutCustomers}
          activeCampaigns={activeCampaigns.length}
          completedCampaigns={completedCampaigns.length}
          readRate={readRate}
          latestCustomer={latestCustomer}
          latestCampaign={latestCampaign}
        />

        <WhatsAppHealthCard health={waHealth} />

        <View style={styles.quickLinksRow}>
          <QuickLinkCard
            icon="people-circle-outline"
            title="الفريق"
            description="الطاقة الحالية والأداء"
            onPress={() => router.push("/(app)/team")}
          />
          <QuickLinkCard
            icon="megaphone-outline"
            title="الحملات"
            description="الوصول والقراءات"
            onPress={() => router.push("/(app)/campaigns")}
          />
        </View>

        <View style={styles.quickLinksRow}>
          <QuickLinkCard
            icon="person-add-outline"
            title="العملاء"
            description="النمو وإلغاء الاشتراك"
            onPress={() => router.push("/(app)/customers")}
          />
          <QuickLinkCard
            icon="checkmark-done-outline"
            title="الموافقات"
            description="طلبات القرار اليدوي"
            onPress={() => router.push("/(app)/approvals")}
          />
        </View>

        {/* Hidden on iOS — see comment in profile.tsx (4.2 minimum
            functionality / 4.3 spam: avoid the "thin web wrapper" signal). */}
        {Platform.OS !== "ios" ? (
          <Pressable
            onPress={() => {
              const webUrl = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
              if (webUrl) Linking.openURL(`${webUrl}/dashboard`);
            }}
            style={styles.dashboardButton}
          >
            <Text style={styles.dashboardButtonText}>فتح لوحة التحكم</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function HeroPill({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.heroPill}>
      <Ionicons name={icon} size={13} color="#FCBD05" />
      <Text style={styles.heroPillText}>
        {label}
      </Text>
    </View>
  );
}

function MetricFeatureCard({
  icon,
  iconColor,
  borderClass,
  bgClass,
  value,
  label,
  hint,
  valueClass,
  labelClass,
  hintClass,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  borderClass: string;
  bgClass: string;
  value: number;
  label: string;
  hint: string;
  valueClass: string;
  labelClass: string;
  hintClass: string;
}) {
  return (
    <View
      style={[
        styles.metricFeatureCard,
        bgClass === "bg-[#FFFBEF]"
          ? styles.metricFeatureCardWarm
          : bgClass === "bg-amber-50"
          ? styles.metricFeatureCardAmber
          : bgClass === "bg-red-50"
          ? styles.metricFeatureCardRed
          : bgClass === "bg-[#EDF2FF]"
          ? styles.metricFeatureCardBlue
          : styles.metricFeatureCardWhite,
      ]}
    >
      <View style={styles.metricFeatureTopRow}>
        <View style={styles.metricFeatureIconWrap}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text
          style={[
            styles.metricFeatureValue,
            valueClass === "text-[#8A5E00]"
              ? styles.metricFeatureValueWarm
              : valueClass === "text-amber-900"
              ? styles.metricFeatureValueWarm
              : valueClass === "text-red-900"
              ? styles.metricFeatureValueDanger
              : styles.metricFeatureValueBlue,
          ]}
        >
          {value}
        </Text>
      </View>
      <Text
        style={[
          styles.metricFeatureLabel,
          labelClass === "text-[#8A5E00]" || labelClass === "text-amber-900"
            ? styles.metricFeatureLabelWarm
            : labelClass === "text-red-900"
            ? styles.metricFeatureLabelDanger
            : styles.metricFeatureLabelBlue,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.metricFeatureHint,
          hintClass === "text-[#A37200]" || hintClass === "text-amber-700/80"
            ? styles.metricFeatureHintWarm
            : hintClass === "text-red-700/80"
            ? styles.metricFeatureHintDanger
            : styles.metricFeatureHintBlue,
        ]}
      >
        {hint}
      </Text>
    </View>
  );
}

function TeamPulseCard({
  rosterCount,
  activeTeamCount,
  onShiftCount,
  overloadedCount,
  missingPushCount,
  totals,
  busiestMember,
  topPerformer,
}: {
  rosterCount: number;
  activeTeamCount: number;
  onShiftCount: number;
  overloadedCount: number;
  missingPushCount: number;
  totals: { messages: number; conversations: number; breaches: number };
  busiestMember: TeamMemberRosterRow | null;
  topPerformer: TeamPerformanceRow | null;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightAccentBlue} />
      <View style={styles.cardHeaderRow}>
        <Pressable onPress={() => router.push("/(app)/team")} hitSlop={8}>
          <Text style={styles.cardHeaderAction}>عرض الفريق</Text>
        </Pressable>
        <Text style={styles.cardHeaderTitle}>نبض الفريق</Text>
      </View>
      <View style={styles.miniMetricGrid}>
        <MiniMetric label="إجمالي الفريق" value={rosterCount} tone="neutral" />
        <MiniMetric label="متاح الآن" value={activeTeamCount} tone="success" />
        <MiniMetric label="في المناوبة" value={onShiftCount} tone="info" />
        <MiniMetric
          label="ضغط مرتفع"
          value={overloadedCount}
          tone={overloadedCount > 0 ? "warning" : "neutral"}
        />
      </View>
      <View style={styles.serviceSummaryCard}>
        <View style={styles.serviceSummaryRow}>
          <View style={styles.serviceSummaryContent}>
            <Text style={styles.serviceSummaryEyebrow}>
              جودة الخدمة
            </Text>
            <Text style={styles.serviceSummaryTitle}>
              ملخص الخدمة اليوم
            </Text>
            <Text style={styles.serviceSummaryBody}>
              {totals.messages > 0 || totals.conversations > 0
                ? `${totals.messages} رسالة و ${totals.conversations} محادثة تمت متابعتها اليوم.`
                : "لا توجد حركة كافية لقياس الخدمة اليوم بعد."}
            </Text>
          </View>
          <View style={styles.serviceSummaryBadge}>
            <Text style={styles.serviceSummaryBadgeValue}>
              {totals.breaches}
            </Text>
            <Text style={styles.serviceSummaryBadgeLabel}>تجاوز SLA</Text>
          </View>
        </View>
      </View>
      <View style={styles.insightStack}>
        {busiestMember ? (
          <InsightRow
            icon="pulse"
            tint="blue"
            title="أكثر عضو تحت ضغط الآن"
            body={`${busiestMember.full_name ?? "عضو غير معروف"} لديه ${busiestMember.active_conversations} محادثة نشطة.`}
          />
        ) : null}
        {topPerformer ? (
          <InsightRow
            icon="trophy-outline"
            tint="yellow"
            title="الأعلى نشاطاً اليوم"
            body={`${topPerformer.full_name ?? "عضو غير معروف"} أرسل ${topPerformer.messages_sent} رسالة وتعامل مع ${topPerformer.conversations_handled} محادثة.`}
          />
        ) : null}
        {missingPushCount > 0 ? (
          <InsightRow
            icon="notifications-off-outline"
            tint="amber"
            title="تنبيهات غير مكتملة"
            body={`${missingPushCount} عضو بدون جهاز تنبيهات مفعّل، وهذا يضعف سرعة الاستلام.`}
          />
        ) : null}
      </View>
    </View>
  );
}

function GrowthPulseCard({
  totalCustomers,
  optedOutCustomers,
  activeCampaigns,
  completedCampaigns,
  readRate,
  latestCustomer,
  latestCampaign,
}: {
  totalCustomers: number;
  optedOutCustomers: number;
  activeCampaigns: number;
  completedCampaigns: number;
  readRate: number;
  latestCustomer: CustomerDirectoryRow | undefined;
  latestCampaign: MarketingCampaignRow | null;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightAccentGold} />
      <View style={styles.cardHeaderRow}>
        <Pressable onPress={() => router.push("/(app)/campaigns")} hitSlop={8}>
          <Text style={styles.cardHeaderAction}>فتح الحملات</Text>
        </Pressable>
        <Text style={styles.cardHeaderTitle}>النمو والحملات</Text>
      </View>
      <View style={styles.miniMetricGrid}>
        <MiniMetric label="إجمالي العملاء" value={totalCustomers} tone="info" />
        <MiniMetric
          label="إلغاء الاشتراك"
          value={optedOutCustomers}
          tone={optedOutCustomers > 0 ? "warning" : "neutral"}
        />
        <MiniMetric label="حملات نشطة" value={activeCampaigns} tone="success" />
        <MiniMetric
          label="حملات مكتملة"
          value={completedCampaigns}
          tone="neutral"
        />
      </View>
      <View style={styles.growthDualRow}>
        <View style={styles.growthReadRateCard}>
          <Text style={styles.growthReadRateLabel}>
            معدل القراءة
          </Text>
          <Text style={styles.growthReadRateValue}>
            {readRate}%
          </Text>
          <Text style={styles.growthReadRateHint}>
            من الرسائل التي تم تسليمها
          </Text>
        </View>
        <View style={styles.growthLatestCustomerCard}>
          <Text style={styles.growthLatestCustomerLabel}>
            آخر عميل مضاف
          </Text>
          <Text
            style={styles.growthLatestCustomerValue}
            numberOfLines={1}
          >
            {latestCustomer?.full_name || latestCustomer?.phone_number || "لا يوجد بعد"}
          </Text>
          <Text style={styles.growthLatestCustomerHint}>
            {latestCustomer?.last_seen_at
              ? "له تفاعل مسجل حديثاً"
              : "لم يبدأ محادثة بعد"}
          </Text>
        </View>
      </View>
      {latestCampaign ? (
        <View style={styles.campaignSummaryCard}>
          <View style={styles.campaignSummaryHeader}>
            <Text style={styles.campaignSummaryTitle}>
              {latestCampaign.name}
            </Text>
            <Text style={styles.campaignStatusPill}>
              {campaignStatusLabel(latestCampaign.status)}
            </Text>
          </View>
          <Text style={styles.campaignSummaryMeta}>
            {latestCampaign.marketing_templates?.name ?? "بدون قالب"} ·{" "}
            {formatDistanceToNow(new Date(latestCampaign.created_at), {
              addSuffix: true,
              locale: ar,
            })}
          </Text>
          <Text style={styles.campaignSummaryBody}>
            {latestCampaign.total_recipients > 0
              ? `استهدفت ${latestCampaign.total_recipients} جهة، تم التسليم إلى ${latestCampaign.delivered_count} وقراءة ${latestCampaign.read_count}.`
              : "الحملة لم تُربط بجمهور بعد."}
          </Text>
        </View>
      ) : (
        <View style={styles.noCampaignCard}>
          <Text style={styles.noCampaignTitle}>
            لا توجد حملات بعد
          </Text>
          <Text style={styles.noCampaignBody}>
            إضافة حملة واحدة هنا ستجعل شاشة المتابعة أذكى بكثير.
          </Text>
        </View>
      )}
    </View>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "neutral" | "success" | "warning" | "info";
}) {
  const toneClasses =
    tone === "success"
      ? styles.miniMetricSuccess
      : tone === "warning"
      ? styles.miniMetricWarning
      : tone === "info"
      ? styles.miniMetricInfo
      : styles.miniMetricNeutral;
  return (
    <View style={[styles.miniMetricCard, toneClasses]}>
      <Text
        style={[
          styles.miniMetricValue,
          tone === "warning" || tone === "info"
            ? styles.miniMetricValueWarm
            : styles.miniMetricValueDefault,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.miniMetricLabel}>
        {label}
      </Text>
    </View>
  );
}

function InsightRow({
  icon,
  tint,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: "blue" | "yellow" | "amber";
  title: string;
  body: string;
}) {
  const tone =
    tint === "blue"
      ? {
          box: styles.insightRowBlue,
          icon: "#011F91",
          title: styles.insightRowTitleBlue,
        }
      : tint === "yellow"
      ? {
          box: styles.insightRowYellow,
          icon: "#C98500",
          title: styles.insightRowTitleYellow,
        }
      : {
          box: styles.insightRowAmber,
          icon: "#B45309",
          title: styles.insightRowTitleAmber,
        };
  return (
    <View style={[styles.insightRow, tone.box]}>
      <View style={styles.insightRowIconWrap}>
        <Ionicons name={icon} size={18} color={tone.icon} />
      </View>
      <View style={styles.insightRowContent}>
        <Text style={[styles.insightRowTitle, tone.title]}>{title}</Text>
        <Text style={styles.insightRowBody}>
          {body}
        </Text>
      </View>
    </View>
  );
}

function QuickLinkCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.quickLinkCard}
    >
      <View style={styles.quickLinkHeader}>
        <View style={styles.quickLinkIconWrap}>
          <Ionicons name={icon} size={18} color={managerColors.brand} />
        </View>
        <Ionicons name="chevron-back" size={18} color="#98A2B3" />
      </View>
      <Text style={styles.quickLinkTitle}>
        {title}
      </Text>
      <Text style={styles.quickLinkDescription}>
        {description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: managerColors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
    rowGap: 16,
  },
  heroCard: {
    overflow: "hidden",
    borderRadius: 28,
    padding: 20,
    backgroundColor: managerColors.brandDark,
  },
  heroOrbLeft: {
    position: "absolute",
    left: -18,
    top: -12,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255, 201, 40, 0.18)",
  },
  heroOrbRight: {
    position: "absolute",
    bottom: -32,
    right: -14,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 16,
  },
  heroContent: {
    flex: 1,
  },
  heroBrandRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  heroBrandText: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: "#FCBD05",
  },
  heroTitle: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroDescription: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 24,
    color: "rgba(255,255,255,0.70)",
  },
  heroPillsRow: {
    marginTop: 16,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 8,
  },
  heroCountCard: {
    minWidth: 80,
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heroCountCardDanger: {
    borderColor: "#F87171",
    backgroundColor: "#EF4444",
  },
  heroCountCardNormal: {
    borderColor: "#FDD043",
    backgroundColor: "#FCBD05",
  },
  heroCountValue: {
    fontSize: 36,
    fontWeight: "700",
  },
  heroCountLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  heroCountTextLight: {
    color: "#FFFFFF",
  },
  heroCountTextDark: {
    color: "#16245C",
  },
  heroActionsRow: {
    marginTop: 20,
    flexDirection: "row-reverse",
    columnGap: 8,
  },
  heroPrimaryAction: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#FCBD05",
    paddingVertical: 12,
  },
  heroPrimaryActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  heroSecondaryAction: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    paddingVertical: 12,
  },
  heroSecondaryActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroPillText: {
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: "#F8F9FF",
  },
  alertStack: {
    rowGap: 8,
  },
  operationalSection: {
    rowGap: 12,
  },
  operationalCard: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#E2E7FA",
    backgroundColor: "#FCFDFE",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  operationalHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 12,
  },
  operationalHeaderContent: {
    flex: 1,
  },
  operationalEyebrow: {
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: "#5E6A99",
  },
  operationalStatusRow: {
    marginTop: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 12,
  },
  operationalStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  operationalStatusDotOn: {
    backgroundColor: "#011F91",
  },
  operationalStatusDotOff: {
    backgroundColor: "#EF4444",
  },
  operationalStatusText: {
    textAlign: "right",
    fontSize: 18,
    fontWeight: "700",
    color: "#16245C",
  },
  operationalBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  operationalBadgeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 6,
  },
  operationalBadgeValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  operationalBadgeLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#5E6A99",
  },
  operationalMetricsGrid: {
    marginTop: 16,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 10,
  },
  metricFeatureCard: {
    minWidth: "45%",
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  metricFeatureCardBlue: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  metricFeatureCardWarm: {
    borderColor: "#F6E5AF",
    backgroundColor: "#FFFBEF",
  },
  metricFeatureCardAmber: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  metricFeatureCardRed: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  metricFeatureCardWhite: {
    borderColor: "#E1E7FB",
    backgroundColor: "#F7F9FF",
  },
  metricFeatureTopRow: {
    marginBottom: 16,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  metricFeatureIconWrap: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metricFeatureValue: {
    fontSize: 30,
    fontWeight: "800",
  },
  metricFeatureValueBlue: {
    color: "#16245C",
  },
  metricFeatureValueWarm: {
    color: "#8A5E00",
  },
  metricFeatureValueDanger: {
    color: "#7F1D1D",
  },
  metricFeatureLabel: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
  },
  metricFeatureLabelBlue: {
    color: "#011F91",
  },
  metricFeatureLabelWarm: {
    color: "#8A5E00",
  },
  metricFeatureLabelDanger: {
    color: "#7F1D1D",
  },
  metricFeatureHint: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 11,
    lineHeight: 20,
  },
  metricFeatureHintBlue: {
    color: "#44559A",
  },
  metricFeatureHintWarm: {
    color: "#A37200",
  },
  metricFeatureHintDanger: {
    color: "#B91C1C",
  },
  quickLinksRow: {
    flexDirection: "row-reverse",
    columnGap: 12,
  },
  quickLinkCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5EAFB",
    backgroundColor: "#FCFDFE",
    padding: 16,
  },
  quickLinkHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickLinkIconWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#F8FAFF",
  },
  quickLinkTitle: {
    marginTop: 20,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  quickLinkDescription: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 11,
    lineHeight: 20,
    color: "#7A88B8",
  },
  dashboardButton: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: managerColors.surface,
    paddingVertical: 14,
  },
  dashboardButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5E6A99",
  },
  whatsAppSkeleton: {
    marginTop: 4,
    height: 20,
    width: "66%",
    borderRadius: 10,
    backgroundColor: "#F2F4F7",
  },
  whatsAppEmptyCard: {
    marginTop: 4,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
    padding: 12,
  },
  whatsAppEmptyRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  whatsAppEmptyTitle: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "#78350F",
  },
  whatsAppHelperText: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 12,
    color: "#7A88B8",
  },
  whatsAppStatusCard: {
    marginTop: 4,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  whatsAppStatusCardOk: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  whatsAppStatusCardWarn: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },
  whatsAppStatusCardDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  whatsAppStatusContentRow: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 10,
  },
  whatsAppStatusTextWrap: {
    flex: 1,
  },
  whatsAppStatusTitle: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
  },
  whatsAppStatusTitleOk: {
    color: "#16245C",
  },
  whatsAppStatusTitleWarn: {
    color: "#78350F",
  },
  whatsAppStatusTitleDanger: {
    color: "#991B1B",
  },
  whatsAppPhoneNumber: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 12,
    color: "#667085",
  },
  whatsAppErrorText: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    color: "#B91C1C",
  },
  insightCard: {
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#FCFEFC",
    padding: 16,
    shadowColor: "#273B9A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  insightAccentBlue: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: "#011F91",
  },
  insightAccentGold: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: "#FCBD05",
  },
  cardHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderTitle: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "700",
    color: "#16245C",
  },
  cardHeaderAction: {
    fontSize: 14,
    fontWeight: "600",
    color: "#273B9A",
  },
  miniMetricGrid: {
    marginTop: 12,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 10,
  },
  miniMetricCard: {
    minWidth: "47%",
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  miniMetricNeutral: {
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
  },
  miniMetricSuccess: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  miniMetricWarning: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  miniMetricInfo: {
    borderColor: "#F4D774",
    backgroundColor: "#FFF7D8",
  },
  miniMetricValue: {
    textAlign: "right",
    fontSize: 24,
    fontWeight: "800",
  },
  miniMetricValueDefault: {
    color: "#16245C",
  },
  miniMetricValueWarm: {
    color: "#8A5E00",
  },
  miniMetricLabel: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "500",
    color: "#7A88B8",
  },
  serviceSummaryCard: {
    marginTop: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FBFCFF",
    padding: 16,
  },
  serviceSummaryRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 12,
  },
  serviceSummaryContent: {
    flex: 1,
  },
  serviceSummaryEyebrow: {
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: "#5E6A99",
  },
  serviceSummaryTitle: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  serviceSummaryBody: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 20,
    color: "#5E6A99",
  },
  serviceSummaryBadge: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EEF1FB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  serviceSummaryBadgeValue: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: "#16245C",
  },
  serviceSummaryBadgeLabel: {
    fontSize: 11,
    color: "#7A88B8",
  },
  insightStack: {
    marginTop: 12,
    rowGap: 8,
  },
  insightRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    columnGap: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  insightRowBlue: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  insightRowYellow: {
    borderColor: "#F4D774",
    backgroundColor: "#FFF7D8",
  },
  insightRowAmber: {
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  insightRowIconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    backgroundColor: "#FFFFFF",
  },
  insightRowContent: {
    flex: 1,
  },
  insightRowTitle: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
  },
  insightRowTitleBlue: {
    color: "#16245C",
  },
  insightRowTitleYellow: {
    color: "#8A5E00",
  },
  insightRowTitleAmber: {
    color: "#78350F",
  },
  insightRowBody: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 11,
    lineHeight: 20,
    color: "#5E6A99",
  },
  growthDualRow: {
    marginTop: 16,
    flexDirection: "row-reverse",
    columnGap: 12,
  },
  growthReadRateCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5EAFB",
    backgroundColor: "#F8FAFF",
    padding: 16,
  },
  growthReadRateLabel: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: "#011F91",
  },
  growthReadRateValue: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 24,
    fontWeight: "800",
    color: "#16245C",
  },
  growthReadRateHint: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 11,
    color: "#44559A",
  },
  growthLatestCustomerCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F7E8B8",
    backgroundColor: "#FFFCEF",
    padding: 16,
  },
  growthLatestCustomerLabel: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: "#8A5E00",
  },
  growthLatestCustomerValue: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#8A5E00",
  },
  growthLatestCustomerHint: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 11,
    color: "#A37200",
  },
  campaignSummaryCard: {
    marginTop: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#ECEFF7",
    backgroundColor: "#FEFEFF",
    padding: 16,
  },
  campaignSummaryHeader: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 8,
  },
  campaignSummaryTitle: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  campaignStatusPill: {
    borderRadius: 999,
    backgroundColor: "#F4F7FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#5E6A99",
  },
  campaignSummaryMeta: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    color: "#7A88B8",
  },
  campaignSummaryBody: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 20,
    color: "#5E6A99",
  },
  noCampaignCard: {
    marginTop: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D7DDF0",
    backgroundColor: "#FEFEFF",
    padding: 16,
    borderStyle: "dashed",
  },
  noCampaignTitle: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "#16245C",
  },
  noCampaignBody: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    color: "#7A88B8",
  },
  ordersEmptyCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E3E8FA",
    backgroundColor: "#F8FAFF",
    padding: 16,
  },
  ordersEmptyRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 12,
  },
  ordersEmptyIconWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E7FA",
    backgroundColor: "#FFFFFF",
  },
  ordersEmptyTitle: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  ordersEmptyBody: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 12,
    color: "#44559A",
  },
  ordersCard: {
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
  },
  ordersCardRow: {
    flexDirection: "row-reverse",
  },
  ordersAccent: {
    width: 6,
    backgroundColor: "#EF4444",
  },
  ordersBodyWrap: {
    flex: 1,
    padding: 16,
  },
  ordersHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 12,
  },
  ordersCountBox: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  ordersCountValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#B91C1C",
  },
  ordersHeaderContent: {
    flex: 1,
  },
  ordersHeaderTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 6,
  },
  ordersHeaderTitle: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#991B1B",
  },
  ordersHeaderBody: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    color: "#5E6A99",
  },
  ordersPreviewPressable: {
    marginTop: 12,
  },
  ordersPreviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEF1F8",
    backgroundColor: "#FCFCFE",
    padding: 12,
  },
  ordersPreviewHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
  },
  ordersPreviewCustomer: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "#16245C",
  },
  ordersReasonPill: {
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#991B1B",
  },
  ordersPreviewBody: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: "#5E6A99",
  },
  ordersActionButton: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
    borderRadius: 18,
    backgroundColor: "#DC2626",
    paddingVertical: 12,
  },
  ordersActionButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

function campaignStatusLabel(status: MarketingCampaignRow["status"]) {
  switch (status) {
    case "draft":
      return "مسودة";
    case "scheduled":
      return "مجدولة";
    case "sending":
      return "قيد الإرسال";
    case "completed":
      return "مكتملة";
    case "partially_completed":
      return "مكتملة جزئياً";
    case "failed":
      return "فشلت";
    default:
      return "غير معروفة";
  }
}

function OrdersWidget({ approvals }: { approvals: PendingApproval[] }) {
  const count = approvals.length;
  const top = approvals[0];

  if (count === 0) {
    return (
      <Pressable
        onPress={() => router.push("/(app)/approvals")}
        style={styles.ordersEmptyCard}
      >
        <View style={styles.ordersEmptyRow}>
          <View style={styles.ordersEmptyIconWrap}>
            <Ionicons name="checkmark-done" size={22} color={managerColors.brand} />
          </View>
          <View>
            <Text style={styles.ordersEmptyTitle}>
              لا توجد طلبات تنتظر قرارك
            </Text>
            <Text style={styles.ordersEmptyBody}>
              البوت يتولى المحادثات حالياً
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-back" size={20} color={managerColors.brand} />
      </Pressable>
    );
  }

  const topBody = top.message ?? top.summary ?? null;
  const topCustomer = top.customer_name ?? top.customer_phone;

  return (
    <View style={styles.ordersCard}>
      <View style={styles.ordersCardRow}>
        <View style={styles.ordersAccent} />
        <View style={styles.ordersBodyWrap}>
          <View style={styles.ordersHeaderRow}>
            <View style={styles.ordersCountBox}>
              <Text style={styles.ordersCountValue}>{count}</Text>
            </View>
            <View style={styles.ordersHeaderContent}>
              <View style={styles.ordersHeaderTitleRow}>
                <Ionicons name="alert-circle" size={16} color="#B91C1C" />
                <Text style={styles.ordersHeaderTitle}>
                  {count === 1 ? "طلب ينتظر قرارك" : "طلبات تنتظر قرارك"}
                </Text>
              </View>
              <Text style={styles.ordersHeaderBody}>
                البوت أوقف الرد على هذه المحادثات ويحتاج تدخلك
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push(`/(app)/inbox/${top.conversation_id}`)}
            style={styles.ordersPreviewPressable}
          >
            <View style={styles.ordersPreviewCard}>
              <View style={styles.ordersPreviewHeader}>
                <Text
                  style={styles.ordersPreviewCustomer}
                  numberOfLines={1}
                >
                  {topCustomer}
                </Text>
                {top.reasonCode ? (
                  <Text style={styles.ordersReasonPill}>
                    {escalationReasonLabel(top.reasonCode)}
                  </Text>
                ) : null}
              </View>
              {top.extracted_intent ? (
                <View className="mt-2">
                  <ExtractedIntentCard
                    intent={top.extracted_intent}
                    variant="compact"
                  />
                </View>
                ) : topBody ? (
                <Text
                  style={styles.ordersPreviewBody}
                  numberOfLines={2}
                >
                  {topBody}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(app)/approvals")}
            style={styles.ordersActionButton}
          >
            <Ionicons name="shield-checkmark" size={16} color="#fff" />
            <Text style={styles.ordersActionButtonText}>
              {count > 1 ? `عرض كل الطلبات (${count})` : "عرض الطلب"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function WhatsAppHealthCard({
  health,
}: {
  health: WhatsAppHealth | undefined;
}) {
  const onOpenSetup = useCallback(() => {
    // WhatsApp number provisioning is a one-time admin task that lives on the
    // web dashboard (Meta Business Manager handshake, etc.). On iOS we can't
    // deep-link out to the web app without it looking like a thin web wrapper
    // (App Store guidelines 4.2 / 4.3) — instead we tell the manager to
    // finish setup from a desktop browser. Android keeps the deep link.
    if (Platform.OS === "ios") {
      Alert.alert(
        "إكمال إعداد واتساب",
        "لإكمال إعداد رقم واتساب، يرجى تسجيل الدخول إلى لوحة التحكم من متصفح الكمبيوتر."
      );
      return;
    }
    const webUrl = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
    if (webUrl) Linking.openURL(`${webUrl}/dashboard/whatsapp-setup`);
  }, []);

  if (!health) {
    return (
      <ManagerCard>
        <SectionHeader title="رقم واتساب" />
        <View style={styles.whatsAppSkeleton} />
      </ManagerCard>
    );
  }

  if (!health.hasNumbers) {
    return (
      <ManagerCard>
        <SectionHeader title="رقم واتساب" />
        <Pressable
          onPress={onOpenSetup}
          style={styles.whatsAppEmptyCard}
        >
          <View style={styles.whatsAppEmptyRow}>
            <Ionicons name="warning-outline" size={20} color="#B45309" />
            <Text style={styles.whatsAppEmptyTitle}>
              لم يتم ربط رقم بعد
            </Text>
          </View>
          <Ionicons name="chevron-back" size={18} color="#B45309" />
        </Pressable>
        <Text style={styles.whatsAppHelperText}>
          افتح لوحة التحكم لإكمال الإعداد ومشاركة الرابط مع مزود واتساب.
        </Text>
      </ManagerCard>
    );
  }

  const p = health.primary!;
  const toneClasses =
    p.severity === "ok"
      ? {
          border: "border-[#D6DDF8]",
          bg: "bg-[#EDF2FF]",
          text: "text-[#16245C]",
          icon: "#011F91",
        }
      : p.severity === "warn"
      ? {
          border: "border-amber-200",
          bg: "bg-amber-50",
          text: "text-amber-900",
          icon: "#B45309",
        }
      : {
          border: "border-red-200",
          bg: "bg-red-50",
          text: "text-red-900",
          icon: "#991B1B",
        };
  const iconName =
    p.severity === "ok"
      ? "checkmark-circle"
      : p.severity === "warn"
      ? "time-outline"
      : "alert-circle";
  const tappable = p.severity !== "ok";
  const Container: typeof Pressable | typeof View = tappable ? Pressable : View;

  return (
    <ManagerCard>
      <SectionHeader title="رقم واتساب" />
      <Container
        onPress={tappable ? onOpenSetup : undefined}
        style={[
          styles.whatsAppStatusCard,
          p.severity === "ok"
            ? styles.whatsAppStatusCardOk
            : p.severity === "warn"
            ? styles.whatsAppStatusCardWarn
            : styles.whatsAppStatusCardDanger,
        ]}
      >
        <View style={styles.whatsAppStatusContentRow}>
          <Ionicons name={iconName} size={20} color={toneClasses.icon} />
          <View style={styles.whatsAppStatusTextWrap}>
            <Text
              style={[
                styles.whatsAppStatusTitle,
                p.severity === "ok"
                  ? styles.whatsAppStatusTitleOk
                  : p.severity === "warn"
                  ? styles.whatsAppStatusTitleWarn
                  : styles.whatsAppStatusTitleDanger,
              ]}
              numberOfLines={1}
            >
              {p.label}
            </Text>
            {p.phoneNumber ? (
              <Text style={styles.whatsAppPhoneNumber} selectable>
                {p.phoneNumber}
              </Text>
            ) : null}
            {p.lastError ? (
              <Text
                style={styles.whatsAppErrorText}
                numberOfLines={2}
              >
                {p.lastError}
              </Text>
            ) : null}
          </View>
        </View>
        {tappable ? (
          <Ionicons name="chevron-back" size={18} color={toneClasses.icon} />
        ) : null}
      </Container>
    </ManagerCard>
  );
}
