import {
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
import { ListSkeleton } from "../../components/manager-ui";
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
      <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["top", "bottom"]}>
        <ApprovalsHeader />
        <ListSkeleton count={4} />
      </SafeAreaView>
    );
  }

  // Defensive: see overview.tsx for why this is guarded. If the API ever
  // returns a non-array (HTML error page, wrong content-type, etc.), a
  // FlatList `data={string}` would crash rendering.
  const items: PendingApproval[] = Array.isArray(query.data) ? query.data : [];

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["top", "bottom"]}>
      <ApprovalsHeader />

      {query.isLoading ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
            />
          }
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-500">
                لا توجد طلبات بانتظار الموافقة
              </Text>
            </View>
          }
          renderItem={({ item }: { item: PendingApproval }) => {
            // Actual customer message goes in the body; the machine code is
            // mapped to an Arabic tag. `message` is the new field; fall back
            // to `summary` so older server builds still render something.
            const body = item.message ?? item.summary ?? null;
            const reasonLabel = escalationReasonLabel(item.reasonCode);
            const reasonTone = escalationReasonTone(item.reasonCode);
            const reasonBg =
              reasonTone === "danger"
                ? "bg-red-50"
                : reasonTone === "warn"
                ? "bg-amber-50"
                : "bg-indigo-50";
            const reasonFg =
              reasonTone === "danger"
                ? "text-red-800"
                : reasonTone === "warn"
                ? "text-amber-800"
                : "text-indigo-900";
            return (
              <Pressable
                onPress={() =>
                  router.push(`/(app)/inbox/${item.conversation_id}`)
                }
              className="mb-2 rounded-lg border border-[#E6E8EC] bg-white p-4"
              >
                <View className="flex-row-reverse items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text
                      className="text-right text-base font-bold text-gray-950"
                      numberOfLines={1}
                    >
                      {item.customer_name || item.customer_phone}
                    </Text>
                    <Text className="mt-1 text-right text-xs text-gray-500">
                      {item.customer_phone}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(item.created_at), {
                      addSuffix: true,
                      locale: ar,
                    })}
                  </Text>
                </View>
                {body ? (
                  <View className="mt-3 rounded-lg border border-[#E6E8EC] bg-[#F6F7F9] px-3 py-2">
                    <Text
                      numberOfLines={3}
                      className="text-right text-sm leading-5 text-gray-900"
                    >
                      {body}
                    </Text>
                  </View>
                ) : null}
                <View className="mt-3 flex-row-reverse items-center justify-between gap-2">
                  <View className="flex-row-reverse items-center gap-1.5">
                    <Text className="rounded-lg bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-700">
                      تصعيد
                    </Text>
                    {item.reasonCode ? (
                      <Text
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${reasonBg} ${reasonFg}`}
                      >
                        {reasonLabel}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-back" size={18} color="#9CA3AF" />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function ApprovalsHeader() {
  return (
    <View className="border-b border-[#E6E8EC] bg-white px-4 py-3">
      <Pressable
        onPress={() => router.back()}
        className="mb-1 self-end"
        hitSlop={8}
      >
        <Ionicons name="arrow-forward" size={22} color="#374151" />
      </Pressable>
      <Text className="text-right text-xl font-bold text-gray-950">
        في انتظار الموافقة
      </Text>
      <Text className="mt-1 text-right text-xs text-gray-500">
        طلبات تصعيد تحتاج قرار مدير
      </Text>
    </View>
  );
}
