import { useCallback, useMemo } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
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
      <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  if (kpisQuery.isLoading && !kpis) {
    return (
      <View className="flex-1" style={{ backgroundColor: managerColors.bg }}>
        <DashboardSkeleton />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} />
        }
      >
        <View
          className="overflow-hidden rounded-[28px] p-5"
          style={{ backgroundColor: managerColors.brandDark }}
        >
          <View
            className="absolute left-[-18] top-[-12] h-24 w-24 rounded-full"
            style={{ backgroundColor: "rgba(255, 201, 40, 0.18)" }}
          />
          <View
            className="absolute bottom-[-32] right-[-14] h-28 w-28 rounded-full"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.10)" }}
          />
          <View className="flex-row-reverse items-start justify-between gap-4">
            <View className="flex-1">
              <View className="flex-row-reverse items-center gap-2">
                <Image
                  source={require("../../assets/logo.png")}
                  style={{ width: 28, height: 28, borderRadius: 6 }}
                  resizeMode="cover"
                />
                <Text className="text-right text-xs font-semibold text-[#FFD969]">
                  Nehgz Bot
                </Text>
              </View>
              <Text className="mt-2 text-right text-2xl font-bold text-white">
                {hasAlerts ? "يحتاج متابعة الآن" : "الصورة التشغيلية واضحة"}
              </Text>
              <Text className="mt-2 text-right text-sm leading-6 text-gray-300">
                {hasAlerts
                  ? "ابدئي بالحالات العاجلة ثم تابعي الفريق والنمو من نفس الشاشة."
                  : "لا توجد حالات حرجة الآن، ويمكنك متابعة الأداء والحملات من الأسفل."}
              </Text>
              <View className="mt-4 flex-row-reverse flex-wrap gap-2">
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
              className={`min-w-20 items-center rounded-2xl border px-4 py-3 ${
                hasAlerts
                  ? "border-red-400 bg-red-500"
                  : "border-[#FFD34D] bg-[#FFC928]"
              }`}
            >
              <Text className={`text-4xl font-bold ${hasAlerts ? "text-white" : "text-[#16245C]"}`}>
                {needsAttentionCount}
              </Text>
              <Text className={`mt-1 text-xs font-semibold ${hasAlerts ? "text-white" : "text-[#16245C]"}`}>
                عاجل
              </Text>
            </View>
          </View>
          <View className="mt-5 flex-row-reverse gap-2">
            <Pressable
              onPress={() => router.push("/(app)/inbox")}
              className="flex-1 items-center rounded-2xl py-3"
              style={{ backgroundColor: "#FFC928" }}
            >
              <Text className="text-sm font-bold text-[#16245C]">
                فتح المحادثات
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmToggleAi(!(ai?.enabled ?? true))}
              disabled={toggleMutation.isPending}
              className="flex-1 items-center rounded-2xl border border-white/20 py-3"
            >
              <Text className="text-sm font-bold text-white">
                {ai?.enabled ? "إيقاف البوت" : "تشغيل البوت"}
              </Text>
            </Pressable>
          </View>
        </View>

        <OrdersWidget approvals={approvals} />

        {hasAlerts && kpis ? (
          <View className="gap-2">
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
                description="راجعي سياسة قوالب واتساب قبل الرد."
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

        <View className="gap-3">
          <SectionHeader title="نظرة عامة على التشغيل" />
          <View
            className="rounded-[30px] border px-5 py-5"
            style={{ borderColor: "#E2E7FA", backgroundColor: "#FCFDFE" }}
          >
            <View className="flex-row-reverse items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-right text-[11px] font-semibold tracking-[0.4px] text-[#5E6A99]">
                  التشغيل الآن
                </Text>
                <View className="mt-2 flex-row-reverse items-center gap-3">
                  <View
                    className={`h-3 w-3 rounded-full ${
                      ai?.enabled ? "bg-[#273B9A]" : "bg-red-500"
                    }`}
                  />
                  <Text className="text-right text-lg font-bold text-[#16245C]">
                    {ai?.enabled ? "المساعد الذكي نشط" : "المساعد الذكي متوقف"}
                  </Text>
                </View>
              </View>
              <View className="rounded-full border border-[#E7EBFB] bg-[#F8FAFF] px-3 py-1.5">
                <View className="flex-row-reverse items-center gap-1.5">
                  <Ionicons name="people" size={15} color="#5E6A99" />
                  <Text className="text-sm font-bold text-[#16245C]">
                    {kpis?.agentsOnShiftCount ?? 0}
                  </Text>
                  <Text className="text-[11px] font-medium text-[#5E6A99]">متاح</Text>
                </View>
              </View>
            </View>
            <View className="mt-4 flex-row-reverse flex-wrap gap-2.5">
              <MetricFeatureCard
                icon="hardware-chip"
                iconColor="#273B9A"
                borderClass="border-[#E1E7FB]"
                bgClass="bg-[#F7F9FF]"
                value={kpis?.botActiveCount ?? 0}
                label="مع المساعد"
                hint="محادثات يرد عليها البوت"
                valueClass="text-[#16245C]"
                labelClass="text-[#1A2A78]"
                hintClass="text-[#44559A]"
              />
              <MetricFeatureCard
                icon="person"
                iconColor="#FFC928"
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
                iconColor="#273B9A"
                borderClass="border-[#D6DDF8]"
                bgClass="bg-[#EDF2FF]"
                value={kpis?.unreadCount ?? 0}
                label="غير مقروءة"
                hint="محادثات فيها رسائل لم تُراجع بعد"
                valueClass="text-[#16245C]"
                labelClass="text-[#1A2A78]"
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

        <View className="flex-row-reverse gap-3">
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

        <View className="flex-row-reverse gap-3">
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

        <Pressable
          onPress={() => {
            const webUrl = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
            if (webUrl) Linking.openURL(`${webUrl}/dashboard`);
          }}
          className="items-center rounded-[20px] border py-3.5"
          style={{ borderColor: managerColors.border, backgroundColor: managerColors.surface }}
        >
          <Text className="text-sm font-semibold text-[#344054]">فتح لوحة التحكم</Text>
        </Pressable>
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
    <View className="flex-row-reverse items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
      <Ionicons name={icon} size={13} color="#FFD969" />
      <Text className="text-right text-[11px] font-semibold text-[#F8F9FF]">
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
      className={`min-w-[45%] flex-1 rounded-[20px] border px-4 py-4 ${borderClass} ${bgClass}`}
    >
      <View className="mb-4 flex-row-reverse items-start justify-between">
        <View className="rounded-full border border-black/5 bg-white px-2.5 py-1.5">
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text className={`text-3xl font-extrabold ${valueClass}`}>{value}</Text>
      </View>
      <Text className={`text-right text-sm font-bold ${labelClass}`}>{label}</Text>
      <Text className={`mt-1 text-right text-[11px] leading-5 ${hintClass}`}>{hint}</Text>
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
    <ManagerCard className="overflow-hidden" >
      <View className="absolute left-0 top-0 h-full w-1 rounded-l-full bg-[#273B9A]" />
      <SectionHeader
        title="نبض الفريق"
        actionLabel="عرض الفريق"
        onActionPress={() => router.push("/(app)/team")}
      />
      <View className="mt-3 flex-row-reverse flex-wrap gap-2.5">
        <MiniMetric label="إجمالي الفريق" value={rosterCount} tone="neutral" />
        <MiniMetric label="متاح الآن" value={activeTeamCount} tone="success" />
        <MiniMetric label="في المناوبة" value={onShiftCount} tone="info" />
        <MiniMetric
          label="ضغط مرتفع"
          value={overloadedCount}
          tone={overloadedCount > 0 ? "warning" : "neutral"}
        />
      </View>
      <View className="mt-4 rounded-[24px] border border-[#E7EBFB] bg-[#FBFCFF] p-4">
        <View className="flex-row-reverse items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-right text-[11px] font-semibold tracking-[0.4px] text-[#5E6A99]">
              جودة الخدمة
            </Text>
            <Text className="mt-2 text-right text-sm font-bold text-gray-950">
              ملخص الخدمة اليوم
            </Text>
            <Text className="mt-1 text-right text-xs leading-5 text-gray-600">
              {totals.messages > 0 || totals.conversations > 0
                ? `${totals.messages} رسالة و ${totals.conversations} محادثة تمت متابعتها اليوم.`
                : "لا توجد حركة كافية لقياس الخدمة اليوم بعد."}
            </Text>
          </View>
          <View className="rounded-[18px] border border-[#EEF1FB] bg-white px-3 py-2.5">
            <Text className="text-center text-lg font-extrabold text-gray-950">
              {totals.breaches}
            </Text>
            <Text className="text-[11px] text-gray-500">تجاوز SLA</Text>
          </View>
        </View>
      </View>
      <View className="mt-3 gap-2">
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
    </ManagerCard>
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
    <ManagerCard className="overflow-hidden">
      <View className="absolute left-0 top-0 h-full w-1 rounded-l-full bg-[#FFC928]" />
      <SectionHeader
        title="النمو والحملات"
        actionLabel="فتح الحملات"
        onActionPress={() => router.push("/(app)/campaigns")}
      />
      <View className="mt-3 flex-row-reverse flex-wrap gap-2.5">
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
      <View className="mt-4 flex-row-reverse gap-3">
        <View className="flex-1 rounded-[24px] border border-[#E5EAFB] bg-[#F8FAFF] p-4">
          <Text className="text-right text-xs font-semibold text-[#1A2A78]">
            معدل القراءة
          </Text>
          <Text className="mt-1 text-right text-2xl font-extrabold text-[#16245C]">
            {readRate}%
          </Text>
          <Text className="mt-1 text-right text-[11px] text-[#44559A]">
            من الرسائل التي تم تسليمها
          </Text>
        </View>
        <View className="flex-1 rounded-[24px] border border-[#F7E8B8] bg-[#FFFCEF] p-4">
          <Text className="text-right text-xs font-semibold text-[#8A5E00]">
            آخر عميل مضاف
          </Text>
          <Text
            className="mt-1 text-right text-sm font-bold text-[#8A5E00]"
            numberOfLines={1}
          >
            {latestCustomer?.full_name || latestCustomer?.phone_number || "لا يوجد بعد"}
          </Text>
          <Text className="mt-1 text-right text-[11px] text-[#A37200]">
            {latestCustomer?.last_seen_at
              ? "له تفاعل مسجل حديثاً"
              : "لم يبدأ محادثة بعد"}
          </Text>
        </View>
      </View>
      {latestCampaign ? (
        <View className="mt-4 rounded-[24px] border border-[#ECEFF7] bg-[#FEFEFF] p-4">
          <View className="flex-row-reverse items-start justify-between gap-2">
            <Text className="flex-1 text-right text-sm font-bold text-gray-950">
              {latestCampaign.name}
            </Text>
            <Text className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
              {campaignStatusLabel(latestCampaign.status)}
            </Text>
          </View>
          <Text className="mt-1 text-right text-xs text-gray-500">
            {latestCampaign.marketing_templates?.name ?? "بدون قالب"} ·{" "}
            {formatDistanceToNow(new Date(latestCampaign.created_at), {
              addSuffix: true,
              locale: ar,
            })}
          </Text>
          <Text className="mt-2 text-right text-xs leading-5 text-gray-700">
            {latestCampaign.total_recipients > 0
              ? `استهدفت ${latestCampaign.total_recipients} جهة، تم التسليم إلى ${latestCampaign.delivered_count} وقراءة ${latestCampaign.read_count}.`
              : "الحملة لم تُربط بجمهور بعد."}
          </Text>
        </View>
      ) : (
        <View className="mt-4 rounded-[24px] border border-dashed border-[#D7DDF0] bg-[#FEFEFF] p-4">
          <Text className="text-right text-sm font-semibold text-gray-900">
            لا توجد حملات بعد
          </Text>
          <Text className="mt-1 text-right text-xs text-gray-500">
            إضافة حملة واحدة هنا ستجعل شاشة المتابعة أذكى بكثير.
          </Text>
        </View>
      )}
    </ManagerCard>
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
      ? "border-[#D6DDF8] bg-[#EDF2FF] text-[#16245C]"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "info"
      ? "border-[#F4D774] bg-[#FFF7D8] text-[#8A5E00]"
      : "border-[#E6E8EC] bg-white text-gray-950";
  return (
    <View className={`min-w-[47%] flex-1 rounded-[16px] border px-3 py-3 ${toneClasses}`}>
      <Text className="text-right text-2xl font-extrabold">{value}</Text>
      <Text className="mt-1 text-right text-[10px] font-medium text-gray-500">
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
          box: "border-[#D6DDF8] bg-[#EDF2FF]",
          icon: "#273B9A",
          title: "text-[#16245C]",
        }
      : tint === "yellow"
      ? {
          box: "border-[#F4D774] bg-[#FFF7D8]",
          icon: "#C98500",
          title: "text-[#8A5E00]",
        }
      : {
          box: "border-amber-200 bg-amber-50",
          icon: "#B45309",
          title: "text-amber-950",
        };
  return (
    <View className={`flex-row-reverse items-start gap-3 rounded-[18px] border p-3 ${tone.box}`}>
      <View className="h-9 w-9 items-center justify-center rounded-full border border-black/5 bg-white">
        <Ionicons name={icon} size={18} color={tone.icon} />
      </View>
      <View className="flex-1">
        <Text className={`text-right text-sm font-bold ${tone.title}`}>{title}</Text>
        <Text className="mt-1 text-right text-[11px] leading-5 text-gray-700">
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
      className="flex-1 rounded-[20px] border p-4"
      style={{ borderColor: "#E5EAFB", backgroundColor: "#FCFDFE" }}
    >
      <View className="flex-row-reverse items-center justify-between">
        <View className="h-11 w-11 items-center justify-center rounded-full border border-[#E7EBFB] bg-[#F8FAFF]">
          <Ionicons name={icon} size={18} color={managerColors.brand} />
        </View>
        <Ionicons name="chevron-back" size={18} color="#98A2B3" />
      </View>
      <Text className="mt-5 text-right text-sm font-bold text-gray-950">
        {title}
      </Text>
      <Text className="mt-1 text-right text-[11px] leading-5 text-gray-500">
        {description}
      </Text>
    </Pressable>
  );
}

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
        className="flex-row-reverse items-center justify-between rounded-[24px] border p-4"
        style={{ borderColor: "#E3E8FA", backgroundColor: "#F8FAFF" }}
      >
        <View className="flex-row-reverse items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-[16px] border border-[#E2E7FA] bg-white">
            <Ionicons name="checkmark-done" size={22} color={managerColors.brand} />
          </View>
          <View>
            <Text className="text-right text-sm font-bold text-[#16245C]">
              لا توجد طلبات تنتظر قراركِ
            </Text>
            <Text className="mt-0.5 text-right text-xs text-[#44559A]">
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
    <View className="overflow-hidden rounded-[24px] border border-red-200 bg-white">
      <View className="flex-row-reverse">
        <View className="w-1.5 bg-red-500" />
        <View className="flex-1 p-4">
          <View className="flex-row-reverse items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-[18px] border border-red-100 bg-red-50">
              <Text className="text-2xl font-bold text-red-700">{count}</Text>
            </View>
            <View className="flex-1">
              <View className="flex-row-reverse items-center gap-1.5">
                <Ionicons name="alert-circle" size={16} color="#B91C1C" />
                <Text className="text-right text-sm font-bold text-red-800">
                  {count === 1 ? "طلب ينتظر قراركِ" : "طلبات تنتظر قراركِ"}
                </Text>
              </View>
              <Text className="mt-1 text-right text-xs text-gray-600">
                البوت أوقف الرد على هذه المحادثات ويحتاج تدخلكِ
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push(`/(app)/inbox/${top.conversation_id}`)}
            className="mt-3"
          >
            <View className="rounded-[16px] border border-[#EEF1F8] bg-[#FCFCFE] p-3">
              <View className="flex-row-reverse items-center justify-between gap-2">
                <Text
                  className="flex-1 text-right text-sm font-semibold text-gray-950"
                  numberOfLines={1}
                >
                  {topCustomer}
                </Text>
                {top.reasonCode ? (
                  <Text className="rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
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
                  className="mt-1 text-right text-sm leading-5 text-gray-700"
                  numberOfLines={2}
                >
                  {topBody}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(app)/approvals")}
            className="mt-3 flex-row-reverse items-center justify-center gap-2 rounded-lg bg-red-600 py-3"
          >
            <Ionicons name="shield-checkmark" size={16} color="#fff" />
            <Text className="text-sm font-bold text-white">
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
    const webUrl = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
    if (webUrl) Linking.openURL(`${webUrl}/dashboard/whatsapp-setup`);
  }, []);

  if (!health) {
    return (
      <ManagerCard>
        <SectionHeader title="رقم واتساب" />
        <View className="h-5 w-2/3 rounded-lg bg-[#F2F4F7]" />
      </ManagerCard>
    );
  }

  if (!health.hasNumbers) {
    return (
      <ManagerCard>
        <SectionHeader title="رقم واتساب" />
        <Pressable
          onPress={onOpenSetup}
          className="mt-1 flex-row-reverse items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <View className="flex-row-reverse items-center gap-2">
            <Ionicons name="warning-outline" size={20} color="#B45309" />
            <Text className="text-right text-sm font-semibold text-amber-900">
              لم يتم ربط رقم بعد
            </Text>
          </View>
          <Ionicons name="chevron-back" size={18} color="#B45309" />
        </Pressable>
        <Text className="mt-2 text-right text-xs text-[#667085]">
          افتحي لوحة التحكم لإكمال الإعداد ومشاركة الرابط مع مزود واتساب.
        </Text>
      </ManagerCard>
    );
  }

  const p = health.primary!;
  const toneClasses =
    p.severity === "ok"
      ? {
          border: "border-emerald-200",
          bg: "bg-emerald-50",
          text: "text-emerald-900",
          icon: "#065F46",
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
        className={`mt-1 flex-row-reverse items-center justify-between rounded-lg border p-3 ${toneClasses.border} ${toneClasses.bg}`}
      >
        <View className="flex-1 flex-row-reverse items-center gap-2.5">
          <Ionicons name={iconName} size={20} color={toneClasses.icon} />
          <View className="flex-1">
            <Text
              className={`text-right text-sm font-semibold ${toneClasses.text}`}
              numberOfLines={1}
            >
              {p.label}
            </Text>
            {p.phoneNumber ? (
              <Text className="mt-0.5 text-right text-xs text-[#667085]" selectable>
                {p.phoneNumber}
              </Text>
            ) : null}
            {p.lastError ? (
              <Text
                className="mt-1 text-right text-xs text-red-700"
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
