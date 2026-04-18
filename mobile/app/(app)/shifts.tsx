import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/query-keys";
import { useSessionStore } from "../../lib/session-store";

type Shift = {
  id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
};

export default function ShiftsScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const teamMemberId = member?.id ?? "";

  const query = useQuery({
    queryKey: qk.shifts(teamMemberId),
    enabled: !!teamMemberId,
    queryFn: async (): Promise<Shift[]> => {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("agent_shifts")
        .select("id, starts_at, ends_at, note")
        .eq("team_member_id", teamMemberId)
        .gte("ends_at", from)
        .lte("starts_at", to)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const items = query.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["bottom"]}>
      <FlatList
        data={items}
        keyExtractor={(s) => s.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <View className="items-center py-20">
            <Text className="text-gray-500">لا توجد مناوبات مجدولة</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white rounded-2xl p-4 mb-2 border border-gray-100">
            <Text className="text-base font-semibold text-right">
              {format(new Date(item.starts_at), "EEEE d MMM")}
            </Text>
            <Text className="text-sm text-gray-600 text-right mt-1">
              {format(new Date(item.starts_at), "HH:mm")} —{" "}
              {format(new Date(item.ends_at), "HH:mm")}
            </Text>
            {item.note && (
              <Text className="text-xs text-gray-500 text-right mt-1">
                {item.note}
              </Text>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
