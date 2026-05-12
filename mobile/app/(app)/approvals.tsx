import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";
import { getApprovals, type PendingApproval } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { useSessionStore } from "../../lib/session-store";
import {
  ListSkeleton,
  managerColors,
  softShadow,
} from "../../components/manager-ui";
import { ExtractedIntentCard } from "../../components/extracted-intent-card";
import { EmptyState, ErrorState } from "../../components/list-state";
import {
  escalationReasonLabel,
  escalationReasonTone,
} from "../../lib/escalation-labels";

export default function ApprovalsScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";

  const query = useQuery({
    queryKey: qk.approvals(restaurantId),
    enabled: !!restaurantId,
    queryFn: getApprovals,
    refetchInterval: 30_000,
  });

  if (!restaurantId) {
    return (
      <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["top"]}>
        <ApprovalsHeader count={0} fetching={false} />
        <ListSkeleton count={4} />
      </SafeAreaView>
    );
  }

  // Defensive: see overview.tsx for why this is guarded. If the API ever
  // returns a non-array (HTML error page, wrong content-type, etc.), a
  // FlatList `data={string}` would crash rendering.
  const items: PendingApproval[] = Array.isArray(query.data) ? query.data : [];

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["top"]}>
      <ApprovalsHeader count={items.length} fetching={query.isFetching} />

      {query.isLoading ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={managerColors.brand}
            />
          }
          ListEmptyComponent={
            query.isError ? (
              <ErrorState onRetry={() => query.refetch()} />
            ) : (
              <EmptyState
                icon="checkmark-done"
                title="لا توجد طلبات الآن"
                description="أي تصعيد جديد من البوت سيظهر هنا مع سبب التصعيد ورسالة العميل."
              />
            )
          }
          renderItem={({ item }: { item: PendingApproval }) => (
            <ApprovalCard approval={item} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ApprovalsHeader({
  count,
  fetching,
}: {
  count: number;
  fetching: boolean;
}) {
  return (
    <View className="border-b border-[#E6E8EC] bg-white px-4 pb-3 pt-2">
      <View className="flex-row-reverse items-center gap-3">
        <View className="flex-1">
          <Text className="text-right text-[22px] font-bold text-[#16245C]">
            الطلبات
          </Text>
          <Text className="mt-1 text-right text-sm leading-6 text-[#5E6A99]">
            محادثات أوقفها البوت لأنه يحتاج قراركِ قبل الرد
          </Text>
        </View>
        <View className="min-w-12 items-center justify-center rounded-[18px] border border-red-100 bg-red-50 px-3 py-2.5">
          {fetching ? (
            <ActivityIndicator color={managerColors.danger} size="small" />
          ) : (
            <Text className="text-lg font-bold text-red-700">{count}</Text>
          )}
          <Text className="text-[10px] font-semibold text-red-700">طلب</Text>
        </View>
      </View>
    </View>
  );
}

function ApprovalCard({ approval }: { approval: PendingApproval }) {
  // Actual customer message goes in the body; the machine code is mapped to an
  // Arabic tag. `message` is the new field; fall back to `summary` so older
  // server builds still render something.
  const body = approval.message ?? approval.summary ?? "لا توجد رسالة مرفقة";
  const reasonLabel = escalationReasonLabel(approval.reasonCode);
  const reasonTone = escalationReasonTone(approval.reasonCode);
  const reasonClasses =
    reasonTone === "danger"
      ? "border-red-100 bg-red-50 text-red-800"
      : reasonTone === "warn"
      ? "border-amber-100 bg-amber-50 text-amber-800"
      : "border-indigo-100 bg-indigo-50 text-indigo-900";
  const customerLabel = approval.customer_name || approval.customer_phone;
  const showPhone = approval.customer_name && approval.customer_phone;
  const ageLabel = formatDistanceToNow(new Date(approval.created_at), {
    addSuffix: true,
    locale: ar,
  });

  const accentBar =
    reasonTone === "danger"
      ? "bg-red-500"
      : reasonTone === "warn"
      ? "bg-amber-500"
      : "bg-indigo-500";

  return (
    <View
      className="mb-3 overflow-hidden rounded-[24px] border border-[#E7EBFB] bg-white"
      style={softShadow}
    >
      <View className="flex-row-reverse">
        <View className={`w-1.5 ${accentBar}`} />
        <View className="flex-1 p-4">
          <View className="flex-row-reverse items-start gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-[#F4F7FF]">
              <Text className="text-base font-bold text-[#273B9A]">
                {customerLabel.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <View className="flex-row-reverse items-center gap-2">
                <Text
                  className="min-w-0 flex-1 text-right text-[17px] font-bold text-[#16245C]"
                  numberOfLines={1}
                >
                  {customerLabel}
                </Text>
                <Text className="text-[11px] font-medium text-[#7A88B8]">
                  {ageLabel}
                </Text>
              </View>
              {showPhone ? (
                <Text
                  className="mt-0.5 text-right text-xs text-[#7A88B8]"
                  selectable
                >
                  {approval.customer_phone}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            className={`mt-3 rounded-[14px] border px-3 py-2.5 ${reasonClasses}`}
          >
            <View className="flex-row-reverse items-center gap-1.5">
              <Ionicons
                name="sparkles-outline"
                size={14}
                color={
                  reasonTone === "danger"
                    ? "#991B1B"
                    : reasonTone === "warn"
                    ? "#92400E"
                    : "#312E81"
                }
              />
              <Text
                className={`text-right text-[11px] font-bold ${
                  reasonTone === "danger"
                    ? "text-red-800"
                    : reasonTone === "warn"
                    ? "text-amber-800"
                    : "text-indigo-900"
                }`}
              >
                لماذا يحتاج البوت مساعدتكِ؟
              </Text>
            </View>
            <Text
              className={`mt-1 text-right text-sm font-semibold ${
                reasonTone === "danger"
                  ? "text-red-800"
                  : reasonTone === "warn"
                  ? "text-amber-800"
                  : "text-indigo-900"
              }`}
            >
              {reasonLabel}
            </Text>
          </View>

          {approval.extracted_intent ? (
            <View className="mt-2">
              <ExtractedIntentCard intent={approval.extracted_intent} />
            </View>
          ) : (
            <View className="mt-2 rounded-[18px] bg-[#F7F9FF] px-3 py-3">
              <Text className="mb-1 text-right text-[11px] font-semibold text-[#7A88B8]">
                آخر رسالة من العميل
              </Text>
              <Text
                numberOfLines={4}
                className="text-right text-sm leading-6 text-[#16245C]"
              >
                {body}
              </Text>
            </View>
          )}

          <Pressable
            onPress={() =>
              router.push(`/(app)/inbox/${approval.conversation_id}`)
            }
            className="mt-3 flex-row-reverse items-center justify-center gap-2 rounded-[18px] py-3"
            style={{ backgroundColor: managerColors.brand }}
            accessibilityRole="button"
            accessibilityLabel={`فتح محادثة ${customerLabel}`}
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#fff" />
            <Text className="text-sm font-bold text-white">
              فتح المحادثة واتخاذ القرار
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
