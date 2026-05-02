import { useMemo } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import {
  getMarketingCampaignDetail,
  sendMarketingCampaign,
  type CampaignRecipientRow,
  type CampaignStatus,
  type MarketingCampaignDetail,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import {
  CardSkeleton,
  ManagerCard,
  ManagerMetric,
  managerColors,
} from "../../../components/manager-ui";

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: qk.marketingCampaignDetail(id ?? ""),
    enabled: !!id,
    queryFn: () => getMarketingCampaignDetail(id!),
    // While sending, poll fast; otherwise slow poll.
    refetchInterval: (q) => {
      const d = q.state.data as MarketingCampaignDetail | undefined;
      const s = d?.campaign.status;
      if (s === "sending") return 3_000;
      if (s === "scheduled") return 15_000;
      return false;
    },
  });

  const data = detailQuery.data;
  const campaign = data?.campaign;
  const recipients = data?.recipients ?? [];

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("missing id");
      return sendMarketingCampaign(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.marketingCampaignDetail(id ?? "") });
      qc.invalidateQueries({ queryKey: qk.marketingCampaigns(restaurantId) });
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر الإرسال"),
  });

  function confirmSend() {
    if (!campaign) return;
    Alert.alert(
      "تأكيد الإرسال",
      `سيتم إرسال الحملة إلى ${campaign.total_recipients} جهة اتصال. هذا الإجراء لا يمكن التراجع عنه.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إرسال الآن",
          style: "destructive",
          onPress: () => sendMutation.mutate(),
        },
      ]
    );
  }

  if (detailQuery.isLoading || !campaign) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }} edges={["bottom"]}>
        <View className="p-4">
          <CardSkeleton rows={4} />
        </View>
      </SafeAreaView>
    );
  }

  const canSend = campaign.status === "draft" || campaign.status === "scheduled";
  const progress =
    campaign.total_recipients > 0
      ? Math.min(
          100,
          Math.round((campaign.sent_count / campaign.total_recipients) * 100)
        )
      : 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }} edges={["bottom"]}>
      <FlatList
        data={recipients}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={detailQuery.isFetching}
            onRefresh={() => detailQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View>
            <ManagerCard className="mb-3">
              <View className="flex-row-reverse items-start justify-between gap-2">
                <Text className="flex-1 text-right text-lg font-bold text-gray-950">
                  {campaign.name}
                </Text>
                <StatusBadge status={campaign.status} />
              </View>
              <Text className="mt-1 text-right text-xs text-gray-500">
                {campaign.marketing_templates?.name ?? "—"}
                {campaign.scheduled_at
                  ? ` · موعد: ${format(new Date(campaign.scheduled_at), "yyyy-MM-dd HH:mm")}`
                  : ""}
              </Text>

              {campaign.total_recipients > 0 ? (
                <View className="mt-3">
                  <View className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <View
                      className="h-full bg-emerald-500"
                      style={{ width: `${progress}%` }}
                    />
                  </View>
                  <Text className="mt-1 text-right text-[11px] text-gray-500">
                    {campaign.sent_count.toLocaleString()} /{" "}
                    {campaign.total_recipients.toLocaleString()} ({progress}%)
                  </Text>
                </View>
              ) : null}

              <View className="mt-3 flex-row-reverse gap-2">
                <ManagerMetric
                  label="المستلمون"
                  value={campaign.total_recipients}
                  tone="info"
                  compact
                />
                <ManagerMetric
                  label="تسليم"
                  value={campaign.delivered_count}
                  tone="success"
                  compact
                />
                <ManagerMetric
                  label="قراءة"
                  value={campaign.read_count}
                  tone="success"
                  compact
                />
                <ManagerMetric
                  label="فشل"
                  value={campaign.failed_count}
                  tone={campaign.failed_count > 0 ? "danger" : "neutral"}
                  compact
                />
              </View>

              {campaign.error_message ? (
                <View className="mt-3 rounded-md border border-red-200 bg-red-50 p-2">
                  <Text className="text-right text-xs text-red-900">
                    {campaign.error_message}
                  </Text>
                </View>
              ) : null}

              {canSend ? (
                <Pressable
                  onPress={confirmSend}
                  disabled={
                    sendMutation.isPending || campaign.total_recipients === 0
                  }
                  className={`mt-4 items-center rounded-lg py-3 ${
                    campaign.total_recipients === 0
                      ? "bg-[#B6E5D6]"
                      : ""
                  }`}
                  style={{
                    backgroundColor:
                      campaign.total_recipients === 0
                        ? "#B6E5D6"
                        : managerColors.brand,
                  }}
                >
                  <Text className="font-bold text-white">
                    {sendMutation.isPending ? "جار الإرسال..." : "إرسال الآن"}
                  </Text>
                </Pressable>
              ) : null}

              {campaign.status === "sending" ? (
                <View className="mt-4 items-center">
                  <Text className="text-xs text-gray-500">
                    الإرسال قيد التنفيذ، يتم التحديث تلقائياً...
                  </Text>
                </View>
              ) : null}
            </ManagerCard>

            <Text className="mb-2 mt-4 text-right text-xs font-bold text-gray-500">
              آخر المستلمين ({recipients.length})
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-10">
            <Text className="text-xs text-gray-500">
              لم تُضَف جهات اتصال للحملة بعد. ابدئي من شاشة &quot;حملة
              جديدة&quot; أو ارجعي لإضافة الجمهور.
            </Text>
            <Pressable
              onPress={() => router.back()}
              className="mt-3 rounded-md border px-4 py-2"
              style={{
                borderColor: managerColors.border,
                backgroundColor: managerColors.surface,
              }}
            >
              <Text className="text-sm text-gray-700">رجوع</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => <RecipientRow row={item} />}
      />
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const styles: Record<CampaignStatus, { label: string; cls: string }> = {
    draft: { label: "مسودة", cls: "bg-gray-100 text-gray-700" },
    scheduled: { label: "مجدولة", cls: "bg-indigo-50 text-indigo-900" },
    sending: { label: "قيد الإرسال", cls: "bg-amber-50 text-amber-900" },
    completed: { label: "مكتملة", cls: "bg-emerald-50 text-emerald-900" },
    partially_completed: { label: "جزئية", cls: "bg-amber-50 text-amber-900" },
    failed: { label: "فشلت", cls: "bg-red-50 text-red-900" },
  };
  const s = styles[status];
  return (
    <View className={`rounded-full px-2 py-0.5 ${s.cls}`}>
      <Text className="text-[11px] font-bold">{s.label}</Text>
    </View>
  );
}

function RecipientRow({ row }: { row: CampaignRecipientRow }) {
  const statusStyles = useMemo<Record<
    CampaignRecipientRow["status"],
    { icon: keyof typeof Ionicons.glyphMap; color: string }
  >>(() => ({
    pending: { icon: "time-outline", color: "#9CA3AF" },
    sent: { icon: "checkmark-outline", color: "#6B7280" },
    delivered: { icon: "checkmark-done-outline", color: "#6B7280" },
    read: { icon: "checkmark-done", color: "#00A884" },
    failed: { icon: "close-circle-outline", color: "#EF4444" },
  }), []);
  const s = statusStyles[row.status];
  return (
    <View className="mb-1.5 flex-row-reverse items-center gap-2 rounded-md border border-gray-100 bg-white px-3 py-2">
      <Ionicons name={s.icon} size={18} color={s.color} />
      <View className="flex-1">
        <Text className="text-right text-sm text-gray-950">
          {row.name || row.phone_number}
        </Text>
        {row.name ? (
          <Text className="text-right text-[11px] text-gray-500">
            {row.phone_number}
          </Text>
        ) : null}
        {row.error_message ? (
          <Text className="text-right text-[11px] text-red-700">
            {row.error_message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
