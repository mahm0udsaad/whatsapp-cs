import { useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import {
  listMarketingCampaigns,
  type CampaignStatus,
  type MarketingCampaignRow,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import {
  CardSkeleton,
  ListSkeleton,
  ManagerCard,
  ManagerMetric,
} from "../../../components/manager-ui";

export default function CampaignsIndexScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";

  const campaignsQuery = useQuery({
    queryKey: qk.marketingCampaigns(restaurantId),
    enabled: !!restaurantId,
    queryFn: listMarketingCampaigns,
    refetchInterval: 15_000,
  });

  const rows = useMemo<MarketingCampaignRow[]>(
    () => (Array.isArray(campaignsQuery.data) ? campaignsQuery.data : []),
    [campaignsQuery.data]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, c) => ({
          sent: a.sent + (c.sent_count ?? 0),
          delivered: a.delivered + (c.delivered_count ?? 0),
          read: a.read + (c.read_count ?? 0),
        }),
        { sent: 0, delivered: 0, read: 0 }
      ),
    [rows]
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      {campaignsQuery.isLoading ? (
        <View className="flex-1">
          <View className="px-4 pt-3">
            <CardSkeleton rows={3} />
          </View>
          <ListSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={campaignsQuery.isFetching}
              onRefresh={() => campaignsQuery.refetch()}
            />
          }
          ListHeaderComponent={
            rows.length > 0 ? (
              <ManagerCard className="mb-3">
                <Text className="text-right text-sm font-bold text-gray-950">
                  إجمالي النشاط
                </Text>
                <View className="mt-3 flex-row-reverse gap-2">
                  <ManagerMetric
                    label="مُرسلة"
                    value={totals.sent}
                    tone="info"
                    compact
                  />
                  <ManagerMetric
                    label="تم التسليم"
                    value={totals.delivered}
                    tone="success"
                    compact
                  />
                  <ManagerMetric
                    label="مقروءة"
                    value={totals.read}
                    tone="success"
                    compact
                  />
                </View>
              </ManagerCard>
            ) : null
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <Ionicons
                name="megaphone-outline"
                size={48}
                color="#9CA3AF"
              />
              <Text className="mt-3 text-gray-500">لا توجد حملات بعد</Text>
              <Text className="mt-1 text-xs text-gray-400">
                ابدئي أول حملة من زر &quot;+&quot; أدناه
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <CampaignCard
              row={item}
              onPress={() =>
                router.push({
                  pathname: "/campaigns/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
        />
      )}

      {/* FAB — New campaign */}
      <Pressable
        onPress={() => router.push("/campaigns/new")}
        className="absolute bottom-6 left-6 h-14 flex-row items-center gap-2 rounded-full bg-[#00A884] px-5"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text className="font-bold text-white">حملة جديدة</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function statusLabel(s: CampaignStatus): { label: string; tone: string } {
  switch (s) {
    case "draft":
      return { label: "مسودة", tone: "bg-gray-100 text-gray-700" };
    case "scheduled":
      return { label: "مجدولة", tone: "bg-indigo-50 text-indigo-900" };
    case "sending":
      return { label: "قيد الإرسال", tone: "bg-amber-50 text-amber-900" };
    case "completed":
      return { label: "مكتملة", tone: "bg-emerald-50 text-emerald-900" };
    case "partially_completed":
      return { label: "مكتملة جزئياً", tone: "bg-amber-50 text-amber-900" };
    case "failed":
      return { label: "فشلت", tone: "bg-red-50 text-red-900" };
  }
}

function CampaignCard({
  row,
  onPress,
}: {
  row: MarketingCampaignRow;
  onPress: () => void;
}) {
  const s = statusLabel(row.status);
  const progressPct =
    row.total_recipients > 0
      ? Math.min(100, Math.round((row.sent_count / row.total_recipients) * 100))
      : 0;
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 rounded-lg border border-gray-200 bg-white p-3"
    >
      <View className="flex-row-reverse items-start justify-between gap-2">
        <Text className="flex-1 text-right text-base font-semibold text-gray-950">
          {row.name}
        </Text>
        <View className={`rounded-full px-2 py-0.5 ${s.tone}`}>
          <Text className="text-[11px] font-bold">{s.label}</Text>
        </View>
      </View>

      <Text className="mt-1 text-right text-xs text-gray-500">
        {row.marketing_templates?.name ?? "قالب غير محدد"} ·{" "}
        {formatDistanceToNow(new Date(row.created_at), {
          addSuffix: true,
          locale: ar,
        })}
      </Text>

      {row.total_recipients > 0 ? (
        <View className="mt-3">
          <View className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <View
              className="h-full bg-emerald-500"
              style={{ width: `${progressPct}%` }}
            />
          </View>
          <View className="mt-2 flex-row-reverse items-center justify-between">
            <Text className="text-[11px] text-gray-500">
              {row.sent_count.toLocaleString()} / {row.total_recipients.toLocaleString()}
            </Text>
            <Text className="text-[11px] text-gray-500">
              تسليم {row.delivered_count} · قراءة {row.read_count}
              {row.failed_count > 0 ? ` · فشل ${row.failed_count}` : ""}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="mt-2 text-right text-[11px] text-gray-400">
          لا توجد جهات اتصال بعد
        </Text>
      )}

      {row.scheduled_at ? (
        <Text className="mt-2 text-right text-[11px] text-indigo-700">
          موعد الإرسال:{" "}
          {format(new Date(row.scheduled_at), "yyyy-MM-dd HH:mm")}
        </Text>
      ) : null}
    </Pressable>
  );
}
