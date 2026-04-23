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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  getAiStatus,
  getKpisToday,
  getApprovals,
  getWhatsAppHealth,
  toggleAi,
  type AiStatus,
  type OverviewSummary,
  type PendingApproval,
  type WhatsAppHealth,
} from "../../lib/api";
import { escalationReasonLabel } from "../../lib/escalation-labels";
import { qk } from "../../lib/query-keys";
import { useSessionStore } from "../../lib/session-store";
import {
  ManagerCard,
  ManagerMetric,
  PriorityAction,
  SectionHeader,
  DashboardSkeleton,
} from "../../components/manager-ui";
import { ExtractedIntentCard } from "../../components/extracted-intent-card";

export default function OverviewScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();

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
    // WA status rarely changes — 2min cadence is enough.
    refetchInterval: 120_000,
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
  }, [aiQuery, kpisQuery, approvalsQuery, waHealthQuery]);

  const isRefreshing =
    aiQuery.isFetching ||
    kpisQuery.isFetching ||
    approvalsQuery.isFetching ||
    waHealthQuery.isFetching;

  const ai: AiStatus | undefined = aiQuery.data;
  const kpis: OverviewSummary | undefined = kpisQuery.data;
  const waHealth: WhatsAppHealth | undefined = waHealthQuery.data;
  // Defensive: /api/mobile/approvals *should* return a JSON array, but a
  // non-JSON response (HTML error page, proxy text/plain, etc.) would make
  // apiFetch fall back to res.text() and hand us a string. A string also has
  // `.slice`, so `approvals.slice(0, 5).map` explodes with "map is not a
  // function". Coerce to an array and log once so we notice server-side
  // regressions without crashing the screen.
  const approvalsRaw = approvalsQuery.data as unknown;
  const approvals: PendingApproval[] = Array.isArray(approvalsRaw)
    ? (approvalsRaw as PendingApproval[])
    : [];
  if (approvalsRaw !== undefined && !Array.isArray(approvalsRaw)) {
    console.warn(
      "[overview] /api/mobile/approvals returned non-array shape:",
      typeof approvalsRaw,
      typeof approvalsRaw === "string"
        ? (approvalsRaw as string).slice(0, 80)
        : approvalsRaw
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

  if (!restaurantId) {
    return (
      <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  if (kpisQuery.isLoading && !kpis) {
    return (
      <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} />
        }
      >
        <View className="rounded-lg bg-[#052E26] p-5">
          <View className="flex-row-reverse items-start justify-between gap-4">
            <View className="flex-1">
              <View className="flex-row-reverse items-center gap-2">
                <Image
                  source={require("../../assets/logo.png")}
                  style={{ width: 28, height: 28, borderRadius: 6 }}
                  resizeMode="cover"
                />
                <Text className="text-right text-xs font-semibold text-emerald-300">
                  Nehgz Bot
                </Text>
              </View>
              <Text className="mt-2 text-right text-2xl font-bold text-white">
                {hasAlerts ? "يحتاج متابعة الآن" : "كل شيء تحت السيطرة"}
              </Text>
              <Text className="mt-2 text-right text-sm leading-6 text-gray-300">
                {hasAlerts
                  ? "ابدئي بالحالات العاجلة قبل مراجعة باقي الأرقام."
                  : "لا توجد محادثات عاجلة أو طلبات موافقة حالياً."}
              </Text>
            </View>
            <View
              className={`min-w-20 items-center rounded-lg border px-4 py-3 ${
                hasAlerts
                  ? "border-red-400 bg-red-500"
                  : "border-emerald-400 bg-emerald-500"
              }`}
            >
              <Text className="text-4xl font-bold text-white">
                {needsAttentionCount}
              </Text>
              <Text className="mt-1 text-xs font-semibold text-white">
                عاجل
              </Text>
            </View>
          </View>
          <View className="mt-5 flex-row-reverse gap-2">
            <Pressable
              onPress={() => router.push("/(app)/inbox")}
              className="flex-1 items-center rounded-lg bg-white py-3"
            >
              <Text className="text-sm font-bold text-gray-950">
                فتح المحادثات
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmToggleAi(!(ai?.enabled ?? true))}
              disabled={toggleMutation.isPending}
              className="flex-1 items-center rounded-lg border border-white/20 py-3"
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

        <ManagerCard>
          <SectionHeader title="تشغيل اليوم" />
          <View className="flex-row-reverse items-center justify-between">
            <View className="flex-row-reverse items-center gap-2">
              <View
                className={`h-2.5 w-2.5 rounded-full ${
                  ai?.enabled ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <Text className="text-right text-sm font-semibold text-gray-950">
                {ai?.enabled ? "المساعد الذكي مُفعّل" : "المساعد الذكي متوقف"}
              </Text>
            </View>
            <Text className="text-sm text-gray-600">
              {kpis?.agentsOnShiftCount ?? 0} في المناوبة
            </Text>
          </View>
          <View className="mt-4 flex-row-reverse gap-2">
            <ManagerMetric
              label="مع موظف"
              value={kpis?.humanActiveCount ?? 0}
              tone="success"
              compact
            />
            <ManagerMetric
              label="مع المساعد"
              value={kpis?.botActiveCount ?? 0}
              tone="info"
              compact
            />
          </View>
        </ManagerCard>

        <WhatsAppHealthCard health={waHealth} />

        {/* Open web dashboard */}
        <Pressable
          onPress={() => {
            const webUrl =
              process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
            if (webUrl) Linking.openURL(`${webUrl}/dashboard`);
          }}
          className="items-center rounded-lg border border-[#E6E8EC] bg-white py-3"
        >
          <Text className="text-sm text-[#344054]">فتح لوحة التحكم</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Orders widget — prominent home-screen highlight for pending approvals.
// When empty, shows a calm "all clear" state. When there are items, shows a
// bold red-accented card with count, top preview, and a CTA.
// ---------------------------------------------------------------------------
function OrdersWidget({ approvals }: { approvals: PendingApproval[] }) {
  const count = approvals.length;
  const top = approvals[0];

  if (count === 0) {
    return (
      <Pressable
        onPress={() => router.push("/(app)/approvals")}
        className="flex-row-reverse items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-4"
      >
        <View className="flex-row-reverse items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-white">
            <Ionicons name="checkmark-done" size={22} color="#047857" />
          </View>
          <View>
            <Text className="text-right text-sm font-bold text-emerald-900">
              لا توجد طلبات تنتظر قراركِ
            </Text>
            <Text className="mt-0.5 text-right text-xs text-emerald-800">
              البوت يتولى المحادثات حالياً
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-back" size={20} color="#047857" />
      </Pressable>
    );
  }

  const topBody = top.message ?? top.summary ?? null;
  const topCustomer = top.customer_name ?? top.customer_phone;

  return (
    <View className="overflow-hidden rounded-lg border-2 border-red-200 bg-white">
      <View className="flex-row-reverse">
        <View className="w-1.5 bg-red-500" />
        <View className="flex-1 p-4">
          <View className="flex-row-reverse items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-lg bg-red-50">
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
            <View className="rounded-lg border border-gray-100 bg-[#F9FAFB] p-3">
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

// ---------------------------------------------------------------------------
// WhatsApp number health card
// Shows the business owner at a glance whether their channel is live,
// still onboarding, or broken — mirroring the web dashboard's setup banner
// but in a compact card. Tapping the card opens the web dashboard so they
// can finish the onboarding steps (which we intentionally keep on the web
// surface per the mobile-first subset scope).
// ---------------------------------------------------------------------------
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
    // Loading: render a subtle skeleton so the card doesn't jump in late.
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
      ? { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-900", icon: "#065F46" }
      : p.severity === "warn"
      ? { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-900", icon: "#B45309" }
      : { border: "border-red-200", bg: "bg-red-50", text: "text-red-900", icon: "#991B1B" };
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
