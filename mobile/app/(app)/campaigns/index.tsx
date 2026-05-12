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
  managerColors,
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }} edges={["top"]}>
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
          contentContainerStyle={{ padding: 12, paddingBottom: 132 }}
          refreshControl={
            <RefreshControl
              refreshing={campaignsQuery.isFetching}
              onRefresh={() => campaignsQuery.refetch()}
            />
          }
          ListHeaderComponent={
            <View>
              <Pressable
                onPress={() => router.push("/(app)/customers")}
                className="mb-3 flex-row-reverse items-center justify-between rounded-[24px] border px-4 py-3.5"
                style={{
                  borderColor: "#E7EBFB",
                  backgroundColor: managerColors.surface,
                }}
              >
                <View className="flex-row-reverse items-center gap-2.5">
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-[#F4F7FF]">
                    <Ionicons
                      name="people-circle-outline"
                      size={22}
                      color="#273B9A"
                    />
                  </View>
                  <View>
                    <Text className="text-right text-sm font-bold text-[#16245C]">
                      العملاء
                    </Text>
                    <Text className="mt-0.5 text-right text-xs leading-5 text-[#7A88B8]">
                      دفتر جهات الاتصال لاختيار مستلمي الحملات
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-back" size={20} color="#667085" />
              </Pressable>
              {rows.length > 0 ? (
                <ManagerCard className="mb-3">
                  <View className="flex-row-reverse items-center justify-between">
                    <View>
                      <Text className="text-right text-sm font-bold text-[#16245C]">
                        إجمالي النشاط
                      </Text>
                      <Text className="mt-0.5 text-right text-xs text-[#7A88B8]">
                        ملخص سريع لأحدث الحملات
                      </Text>
                    </View>
                    <View className="rounded-full bg-[#EDF2FF] px-3 py-1.5">
                      <Text className="text-[11px] font-semibold text-[#273B9A]">
                        {rows.length} حملة
                      </Text>
                    </View>
                  </View>
                  <View className="mt-3 flex-row-reverse gap-2">
                    <ManagerMetric
                      label="مرسلة"
                      value={totals.sent}
                      tone="bot"
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
                      tone="warning"
                      compact
                    />
                  </View>
                </ManagerCard>
              ) : (
                <View
                  className="mb-3 overflow-hidden rounded-[28px] border px-5 py-5"
                  style={{
                    borderColor: "#D6DDF8",
                    backgroundColor: "#273B9A",
                  }}
                >
                  <View
                    className="absolute -left-8 -top-8 h-24 w-24 rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
                  />
                  <View
                    className="absolute -bottom-10 right-0 h-28 w-28 rounded-full"
                    style={{ backgroundColor: "rgba(255,201,40,0.20)" }}
                  />
                  <Text className="text-right text-xs font-semibold text-white/70">
                    الحملات
                  </Text>
                  <Text className="mt-2 text-right text-2xl font-bold text-white">
                    ابدئي أول حملة
                  </Text>
                  <Text className="mt-2 text-right text-sm leading-6 text-white/80">
                    جهزي القالب ثم اختاري العملاء وابدئي الإرسال من هنا.
                  </Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center px-8 py-10">
              <View className="h-16 w-16 items-center justify-center rounded-[22px] bg-[#EDF2FF]">
                <Ionicons
                  name="megaphone-outline"
                  size={30}
                  color="#273B9A"
                />
              </View>
              <Text className="mt-4 text-base font-bold text-[#16245C]">
                لا توجد حملات بعد
              </Text>
              <Text className="mt-1 text-center text-sm leading-6 text-[#7A88B8]">
                ابدئي أول حملة جديدة أو افتحي القوالب لتجهيز المحتوى أولًا.
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

      <View
        className="absolute bottom-4 left-4 right-4 flex-row-reverse gap-3 rounded-[28px] border px-4 py-3"
        style={{
          borderColor: "#E7EBFB",
          backgroundColor: "rgba(255,255,255,0.96)",
        }}
      >
        <Pressable
          onPress={() => router.push("/campaigns/new")}
          className="h-12 flex-1 flex-row-reverse items-center justify-center gap-2 rounded-full"
          style={{
            backgroundColor: managerColors.brand,
            shadowColor: managerColors.brandDark,
            shadowOpacity: 0.14,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text className="font-bold text-white">حملة جديدة</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/campaigns/templates")}
          className="h-12 flex-row-reverse items-center justify-center gap-2 rounded-full border px-4"
          style={{
            borderColor: "#D6DDF8",
            backgroundColor: "#F8FAFF",
          }}
        >
          <Ionicons name="document-text-outline" size={18} color="#273B9A" />
          <Text className="text-sm font-semibold text-[#273B9A]">القوالب</Text>
        </Pressable>
      </View>
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
    default:
      return { label: s ?? "غير معروف", tone: "bg-gray-100 text-gray-700" };
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
      className="mb-3 overflow-hidden rounded-[24px] border p-4"
      style={{
        borderColor: "#E7EBFB",
        backgroundColor: managerColors.surface,
      }}
    >
      <View className="flex-row-reverse items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-right text-base font-semibold text-[#16245C]">
            {row.name}
          </Text>
          <Text className="mt-1 text-right text-xs text-[#7A88B8]">
            {row.marketing_templates?.name ?? "قالب غير محدد"} ·{" "}
            {formatDistanceToNow(new Date(row.created_at), {
              addSuffix: true,
              locale: ar,
            })}
          </Text>
        </View>
        <View className={`rounded-full px-2.5 py-1 ${s.tone}`}>
          <Text className="text-[11px] font-bold">{s.label}</Text>
        </View>
      </View>

      {row.total_recipients > 0 ? (
        <View className="mt-3">
          <View className="h-1.5 overflow-hidden rounded-full bg-[#EEF2FF]">
            <View
              className="h-full bg-[#273B9A]"
              style={{ width: `${progressPct}%` }}
            />
          </View>
          <View className="mt-3 flex-row-reverse flex-wrap items-center gap-2">
            <MiniCount label="مرسلة" value={row.sent_count} />
            <MiniCount label="مستلمون" value={row.total_recipients} />
            <MiniCount label="تسليم" value={row.delivered_count} />
            <MiniCount label="قراءة" value={row.read_count} />
            {row.failed_count > 0 ? (
              <MiniCount label="فشل" value={row.failed_count} tone="danger" />
            ) : null}
          </View>
        </View>
      ) : (
        <View className="mt-3 rounded-[18px] bg-[#F8FAFF] px-3 py-3">
          <Text className="text-right text-[11px] text-[#7A88B8]">
            لا توجد جهات اتصال بعد
          </Text>
        </View>
      )}

      <View className="mt-3 flex-row-reverse items-center justify-between">
        {row.scheduled_at ? (
          <Text className="text-right text-[11px] text-[#273B9A]">
            موعد الإرسال: {format(new Date(row.scheduled_at), "yyyy-MM-dd HH:mm")}
          </Text>
        ) : (
          <View />
        )}
        <View className="flex-row-reverse items-center gap-1.5">
          <Text className="text-[11px] font-semibold text-[#7A88B8]">
            فتح التفاصيل
          </Text>
          <Ionicons name="chevron-back" size={16} color="#7A88B8" />
        </View>
      </View>
    </Pressable>
  );
}

function MiniCount({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <View
      className={`rounded-full px-2.5 py-1 ${
        tone === "danger" ? "bg-red-50" : "bg-[#F4F7FF]"
      }`}
    >
      <Text
        className={`text-[11px] font-semibold ${
          tone === "danger" ? "text-red-700" : "text-[#5E6A99]"
        }`}
      >
        {label} {value.toLocaleString()}
      </Text>
    </View>
  );
}
