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
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  // Defensive: see overview.tsx for why this is guarded. If the API ever
  // returns a non-array (HTML error page, wrong content-type, etc.), a
  // FlatList `data={string}` would crash rendering.
  const items: PendingApproval[] = Array.isArray(query.data) ? query.data : [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top", "bottom"]}>
      <View className="border-b border-gray-100 bg-white px-4 py-3">
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

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 12 }}
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
          renderItem={({ item }: { item: PendingApproval }) => (
            <Pressable
              onPress={() => router.push(`/(app)/inbox/${item.conversation_id}`)}
              className="mb-2 rounded-2xl border border-gray-100 bg-white p-4"
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
              {item.summary ? (
                <Text
                  numberOfLines={2}
                  className="mt-2 text-right text-sm leading-5 text-gray-700"
                >
                  {item.summary}
                </Text>
              ) : null}
              <View className="mt-3 flex-row-reverse items-center justify-between">
                <Text className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {item.type === "escalation" ? "تصعيد" : item.type}
                </Text>
                <Ionicons name="chevron-back" size={18} color="#9CA3AF" />
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
