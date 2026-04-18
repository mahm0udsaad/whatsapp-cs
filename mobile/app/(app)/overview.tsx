import { useCallback, useMemo } from "react";
import {
  Alert,
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
import {
  getAiStatus,
  getKpisToday,
  getApprovals,
  toggleAi,
  type AiStatus,
  type OverviewSummary,
  type PendingApproval,
} from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { useSessionStore } from "../../lib/session-store";
import {
  ManagerCard,
  ManagerMetric,
  PriorityAction,
  SectionHeader,
  DashboardSkeleton,
} from "../../components/manager-ui";

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
  }, [aiQuery, kpisQuery, approvalsQuery]);

  const isRefreshing =
    aiQuery.isFetching || kpisQuery.isFetching || approvalsQuery.isFetching;

  const ai: AiStatus | undefined = aiQuery.data;
  const kpis: OverviewSummary | undefined = kpisQuery.data;
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
      <SafeAreaView className="flex-1 bg-[#F6F8F7]" edges={["bottom"]}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  if (kpisQuery.isLoading && !kpis) {
    return (
      <SafeAreaView className="flex-1 bg-[#F6F8F7]" edges={["bottom"]}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F8F7]" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} />
        }
      >
        <View className="rounded-lg bg-gray-950 p-5">
          <View className="flex-row-reverse items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-right text-xs font-semibold text-emerald-300">
                مركز الإدارة
              </Text>
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
            {approvals.length > 0 ? (
              <PriorityAction
                title="طلبات موافقة"
                description="قرارات تصعيد تنتظر المدير."
                value={approvals.length}
                tone="info"
                icon="shield-checkmark-outline"
                onPress={() => router.push("/(app)/approvals")}
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

        <ManagerCard>
          <SectionHeader
            title="آخر طلبات الموافقة"
            actionLabel={approvals.length > 0 ? "عرض الكل" : undefined}
            onActionPress={() => router.push("/(app)/approvals")}
          />
          {approvals.length === 0 ? (
            <Text className="mt-2 text-right text-sm text-gray-500">
              لا توجد طلبات بانتظار الموافقة
            </Text>
          ) : (
            approvals.slice(0, 5).map((a) => (
              <Pressable
                key={a.id}
                onPress={() =>
                  router.push(`/(app)/inbox/${a.conversation_id}`)
                }
                className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
              >
                <Text className="text-right text-sm font-semibold text-gray-950">
                  {a.customer_name ?? a.customer_phone}
                </Text>
                <Text
                  className="mt-1 text-right text-xs text-gray-500"
                  numberOfLines={1}
                >
                  {a.summary ?? a.type}
                </Text>
              </Pressable>
            ))
          )}
        </ManagerCard>

        {/* Open web dashboard */}
        <Pressable
          onPress={() => {
            const webUrl =
              process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
            if (webUrl) Linking.openURL(`${webUrl}/dashboard`);
          }}
          className="items-center rounded-lg border border-gray-200 bg-white py-3"
        >
          <Text className="text-sm text-gray-700">فتح لوحة التحكم</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
