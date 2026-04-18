import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { supabase } from "../../../lib/supabase";
import {
  listInboxConversations,
  type InboxConversationRow,
  type InboxFilter,
} from "../../../lib/api";
import { useSessionStore } from "../../../lib/session-store";

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: "open", label: "مفتوحة" },
  { key: "unassigned", label: "غير مستلمة" },
  { key: "mine", label: "ملفاتي" },
  { key: "expired", label: "منتهية" },
];

export default function InboxScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const qc = useQueryClient();
  const restaurantId = member?.restaurant_id ?? "";

  const [filter, setFilter] = useState<InboxFilter>("open");

  const query = useQuery({
    queryKey: ["inbox", restaurantId, filter],
    enabled: !!restaurantId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<InboxConversationRow[]> => {
      const res = await listInboxConversations(restaurantId, filter);
      return res.conversations;
    },
  });

  // Realtime: any change to this tenant's conversations refreshes all filter caches.
  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase
      .channel(`inbox-conv:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["inbox", restaurantId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [restaurantId, qc]);

  const items = query.data ?? [];

  const header = useMemo(
    () => (
      <View className="border-b border-gray-100 bg-white">
        <View className="px-4 py-3">
          <Text className="text-lg font-semibold text-right">
            المحادثات ({items.length})
          </Text>
        </View>
        <View className="flex-row-reverse px-3 pb-3">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                className={`mx-1 rounded-full px-3 py-1.5 ${
                  active ? "bg-gray-900" : "bg-gray-100"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    active ? "text-white" : "text-gray-700"
                  }`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ),
    [filter, items.length]
  );

  const openConversation = useCallback((id: string) => {
    router.push(`/inbox/${id}`);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["bottom"]}>
      {header}
      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
            />
          }
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-500">لا توجد محادثات</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openConversation(item.id)}
              className="mx-3 my-2 rounded-2xl bg-white p-4 shadow-sm border border-gray-100"
            >
              <View className="flex-row justify-between items-center mb-1">
                <ModeBadge mode={item.handler_mode} />
                <Text className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(item.last_message_at), {
                    addSuffix: true,
                    locale: ar,
                  })}
                </Text>
              </View>
              <Text className="text-base font-semibold text-right mb-1">
                {item.customer_name || item.customer_phone}
              </Text>
              {!!item.preview && (
                <Text
                  numberOfLines={2}
                  className="text-sm text-gray-600 text-right"
                >
                  {item.preview}
                </Text>
              )}
              <View className="mt-2 flex-row-reverse items-center gap-2">
                {item.is_expired && (
                  <Text className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    خارج نافذة 24س
                  </Text>
                )}
                {item.assignee_name && (
                  <Text className="text-[11px] text-gray-500">
                    {item.assignee_name}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ModeBadge({ mode }: { mode: "unassigned" | "human" | "bot" }) {
  const styles =
    mode === "unassigned"
      ? "bg-red-100 text-red-700"
      : mode === "human"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-indigo-100 text-indigo-800";
  const label =
    mode === "unassigned" ? "غير مستلمة" : mode === "human" ? "استلام يدوي" : "بوت بتوكيل";
  return (
    <View className={`rounded-full px-2 py-0.5 ${styles.split(" ")[0]}`}>
      <Text className={`text-[11px] font-medium ${styles.split(" ")[1]}`}>{label}</Text>
    </View>
  );
}
