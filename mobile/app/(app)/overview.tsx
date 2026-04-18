import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
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

function StatTile({
  label,
  value,
  tone = "default",
  onPress,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "success" | "info";
  onPress?: () => void;
}) {
  const toneClasses =
    tone === "warning"
      ? "bg-amber-50 border-amber-200"
      : tone === "success"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "info"
      ? "bg-indigo-50 border-indigo-200"
      : "bg-white border-gray-100";
  const valueTone =
    tone === "warning"
      ? "text-amber-900"
      : tone === "success"
      ? "text-emerald-900"
      : tone === "info"
      ? "text-indigo-900"
      : "text-gray-950";
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`flex-1 rounded-2xl border p-4 ${toneClasses}`}
    >
      <Text className="text-right text-xs font-medium text-gray-500">
        {label}
      </Text>
      <Text className={`mt-1 text-right text-3xl font-bold ${valueTone}`}>
        {value}
      </Text>
    </Pressable>
  );
}

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
  const approvals: PendingApproval[] = approvalsQuery.data ?? [];

  const hasAlerts = useMemo(() => {
    if (!kpis) return false;
    return kpis.unassignedCount > 0 || kpis.expiredCount > 0;
  }, [kpis]);

  if (!restaurantId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} />
        }
      >
        {/* Live status strip */}
        <View className="mb-3 rounded-2xl border border-gray-100 bg-white p-4">
          <Text className="text-right text-xs font-medium text-gray-500">
            حالة المتجر الآن
          </Text>
          <View className="mt-2 flex-row-reverse items-center justify-between">
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
        </View>

        {/* Alerts */}
        {hasAlerts && kpis ? (
          <View className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <Text className="text-right text-sm font-bold text-red-900">
              تنبيهات
            </Text>
            {kpis.unassignedCount > 0 ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(app)/inbox",
                    params: { filter: "unassigned" },
                  })
                }
                className="mt-2 flex-row-reverse items-center justify-between"
              >
                <Text className="text-right text-sm text-red-800">
                  {kpis.unassignedCount} محادثة غير مُعيّنة
                </Text>
                <Ionicons name="chevron-back" size={18} color="#991B1B" />
              </Pressable>
            ) : null}
            {kpis.expiredCount > 0 ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(app)/inbox",
                    params: { filter: "expired" },
                  })
                }
                className="mt-2 flex-row-reverse items-center justify-between"
              >
                <Text className="text-right text-sm text-red-800">
                  {kpis.expiredCount} محادثة منتهية
                </Text>
                <Ionicons name="chevron-back" size={18} color="#991B1B" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* KPI grid */}
        <View className="mb-3 flex-row-reverse gap-2">
          <StatTile
            label="غير مُعيّنة"
            value={kpis?.unassignedCount ?? 0}
            tone={kpis && kpis.unassignedCount > 0 ? "warning" : "default"}
            onPress={() =>
              router.push({
                pathname: "/(app)/inbox",
                params: { filter: "unassigned" },
              })
            }
          />
          <StatTile
            label="مع موظف"
            value={kpis?.humanActiveCount ?? 0}
            tone="success"
            onPress={() => router.push("/(app)/inbox")}
          />
        </View>
        <View className="mb-3 flex-row-reverse gap-2">
          <StatTile
            label="مع المساعد"
            value={kpis?.botActiveCount ?? 0}
            tone="info"
          />
          <StatTile
            label="منتهية"
            value={kpis?.expiredCount ?? 0}
            tone={kpis && kpis.expiredCount > 0 ? "warning" : "default"}
            onPress={() =>
              router.push({
                pathname: "/(app)/inbox",
                params: { filter: "expired" },
              })
            }
          />
        </View>

        {/* Quick actions */}
        <View className="mb-3 flex-row-reverse gap-2">
          <Pressable
            onPress={() => confirmToggleAi(!(ai?.enabled ?? true))}
            disabled={toggleMutation.isPending}
            className={`flex-1 rounded-2xl border p-4 ${
              ai?.enabled
                ? "border-red-200 bg-red-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <View className="flex-row-reverse items-center gap-2">
              <Ionicons
                name={ai?.enabled ? "stop-circle" : "play-circle"}
                size={22}
                color={ai?.enabled ? "#991B1B" : "#065F46"}
              />
              <Text
                className={`text-right text-sm font-semibold ${
                  ai?.enabled ? "text-red-900" : "text-emerald-900"
                }`}
              >
                {ai?.enabled ? "إيقاف المساعد الذكي" : "تشغيل المساعد الذكي"}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Approvals */}
        <View className="mb-3 rounded-2xl border border-gray-100 bg-white p-4">
          <View className="flex-row-reverse items-center justify-between">
            <Text className="text-right text-sm font-bold text-gray-950">
              في انتظار الموافقة
            </Text>
            {approvals.length > 0 ? (
              <Pressable onPress={() => router.push("/(app)/approvals")}>
                <Text className="text-sm text-indigo-600">عرض الكل</Text>
              </Pressable>
            ) : null}
          </View>
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
                className="mt-3 border-t border-gray-100 pt-3"
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
        </View>

        {/* Open web dashboard */}
        <Pressable
          onPress={() => {
            const webUrl =
              process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
            if (webUrl) Linking.openURL(`${webUrl}/dashboard`);
          }}
          className="mt-2 items-center rounded-xl border border-gray-200 bg-white py-3"
        >
          <Text className="text-sm text-gray-700">فتح لوحة التحكم</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
