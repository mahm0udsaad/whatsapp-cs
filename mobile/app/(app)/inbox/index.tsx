import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { useSessionStore } from "../../../lib/session-store";
import { isManager } from "../../../lib/roles";
import {
  asArray,
  getTeamRoster,
  reassignConversation,
  type TeamMemberRosterRow,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { ListSkeleton } from "../../../components/manager-ui";

type Filter = "all" | "unassigned" | "mine" | "bot" | "expired";

type ConversationRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  status: string;
  last_message_at: string;
  last_inbound_at: string | null;
  handler_mode: "unassigned" | "human" | "bot";
  assigned_to: string | null;
};

type ListItem = ConversationRow & {
  preview: string | null;
  assignee_name: string | null;
  is_expired: boolean;
  is_mine: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unassigned", label: "غير مستلمة" },
  { key: "mine", label: "محادثاتي" },
  { key: "bot", label: "مع البوت" },
  { key: "expired", label: "خارج النافذة" },
];

const EMPTY_ITEMS: ListItem[] = [];

function isExpired(lastInboundAt: string | null) {
  return (
    !!lastInboundAt &&
    new Date(lastInboundAt).getTime() < Date.now() - DAY_MS
  );
}

function getWindowLabel(lastInboundAt: string | null) {
  if (!lastInboundAt) return null;
  const remaining = DAY_MS - (Date.now() - new Date(lastInboundAt).getTime());
  if (remaining <= 0) return "خارج نافذة الرد";
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  if (hours < 1) return "تنتهي قريبًا";
  if (hours <= 3) return `متبقي ${hours}س`;
  return "داخل نافذة الرد";
}

export default function InboxScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const qc = useQueryClient();
  const restaurantId = member?.restaurant_id ?? "";
  const teamMemberId = member?.id ?? "";
  const manager = isManager(member);
  const searchParams = useLocalSearchParams<{ filter?: string }>();

  const initialFilter: Filter = useMemo(() => {
    const raw = searchParams.filter;
    if (
      raw === "unassigned" ||
      raw === "mine" ||
      raw === "bot" ||
      raw === "expired" ||
      raw === "all"
    ) {
      return raw;
    }
    return "all";
  }, [searchParams.filter]);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  // Reassign bottom-sheet state (manager only).
  const [reassignTarget, setReassignTarget] = useState<ConversationRow | null>(
    null
  );
  const rosterQuery = useQuery({
    queryKey: qk.teamRoster(restaurantId),
    enabled: manager && !!restaurantId && !!reassignTarget,
    queryFn: getTeamRoster,
  });
  const reassignMutation = useMutation({
    mutationFn: (input: {
      conversationId: string;
      assignToTeamMemberId?: string;
      forceBot?: boolean;
      unassign?: boolean;
    }) => reassignConversation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", restaurantId] });
      qc.invalidateQueries({ queryKey: qk.kpisToday(restaurantId) });
      setReassignTarget(null);
    },
    onError: (e: unknown) => {
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر التحويل");
    },
  });

  const query = useQuery({
    queryKey: ["inbox", restaurantId, teamMemberId],
    enabled: !!restaurantId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<ListItem[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, customer_name, customer_phone, status, last_message_at, last_inbound_at, handler_mode, assigned_to"
        )
        .eq("restaurant_id", restaurantId)
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = (data ?? []) as ConversationRow[];
      if (rows.length === 0) return [];

      const convIds = rows.map((r) => r.id);
      const assigneeIds = Array.from(
        new Set(rows.map((r) => r.assigned_to).filter(Boolean) as string[])
      );

      // Latest customer preview + assignee names in parallel.
      const [previewsRes, membersRes] = await Promise.all([
        supabase
          .from("messages")
          .select("conversation_id, content, created_at, role")
          .in("conversation_id", convIds)
          .eq("role", "customer")
          .order("created_at", { ascending: false })
          .limit(convIds.length * 3),
        assigneeIds.length > 0
          ? supabase
              .from("team_members")
              .select("id, full_name, role")
              .in("id", assigneeIds)
          : Promise.resolve({
              data: [] as {
                id: string;
                full_name: string | null;
                role: "admin" | "agent";
              }[],
              error: null,
            }),
      ]);

      const previewMap = new Map<string, string>();
      for (const m of (previewsRes.data ?? []) as {
        conversation_id: string;
        content: string;
      }[]) {
        if (!previewMap.has(m.conversation_id)) {
          previewMap.set(m.conversation_id, m.content ?? "");
        }
      }
      const assigneeMap = new Map<string, string>();
      for (const a of (membersRes.data ?? []) as {
        id: string;
        full_name: string | null;
        role: "admin" | "agent";
      }[]) {
        const trimmed = a.full_name?.trim();
        assigneeMap.set(
          a.id,
          trimmed || (a.role === "admin" ? "المدير" : "موظف")
        );
      }

      return rows.map((r) => ({
        ...r,
        preview: previewMap.get(r.id) ?? null,
        assignee_name: r.assigned_to ? assigneeMap.get(r.assigned_to) ?? null : null,
        is_expired: isExpired(r.last_inbound_at),
        is_mine: r.assigned_to === teamMemberId,
      }));
    },
  });

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

  const allItems = query.data ?? EMPTY_ITEMS;

  const stats = useMemo(
    () => ({
      total: allItems.length,
      unassigned: allItems.filter((item) => item.handler_mode === "unassigned")
        .length,
      mine: allItems.filter((item) => item.is_mine).length,
      bot: allItems.filter((item) => item.handler_mode === "bot").length,
      expired: allItems.filter((item) => item.is_expired).length,
    }),
    [allItems]
  );

  const items = useMemo(() => {
    if (filter === "unassigned") {
      return allItems.filter((item) => item.handler_mode === "unassigned");
    }
    if (filter === "mine") return allItems.filter((item) => item.is_mine);
    if (filter === "bot") {
      return allItems.filter((item) => item.handler_mode === "bot");
    }
    if (filter === "expired") return allItems.filter((item) => item.is_expired);
    return allItems;
  }, [allItems, filter]);

  const header = useMemo(
    () => (
      <View className="border-b border-gray-200 bg-white">
        <View className="px-4 pb-3 pt-3">
          <Text className="text-right text-2xl font-bold text-gray-950">
            المحادثات
          </Text>
          <Text className="mt-1 text-right text-sm text-gray-500">
            ابدئي بغير المستلمة والمنتهية ثم راجعي باقي المحادثات
          </Text>
        </View>
        <View className="flex-row-reverse gap-2 px-3 pb-3">
          <MetricCard
            label="للاستلام"
            value={stats.unassigned}
            tone="urgent"
          />
          <MetricCard label="محادثاتي" value={stats.mine} tone="success" />
          <MetricCard label="البوت" value={stats.bot} tone="bot" />
          <MetricCard
            label="منتهية"
            value={stats.expired}
            tone="warning"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="pb-3"
          contentContainerStyle={{
            flexDirection: "row-reverse",
            gap: 8,
            paddingHorizontal: 12,
          }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all"
                ? stats.total
                : f.key === "unassigned"
                ? stats.unassigned
                : f.key === "mine"
                ? stats.mine
                : f.key === "bot"
                ? stats.bot
                : stats.expired;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                className={`rounded-lg border px-3 py-2 ${
                  active
                    ? "border-gray-950 bg-gray-950"
                    : "border-gray-200 bg-white"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    active ? "text-white" : "text-gray-700"
                  }`}
                >
                  {f.label} {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    ),
    [filter, stats]
  );

  const openConversation = useCallback((id: string) => {
    router.push(`/inbox/${id}`);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#F6F8F7]" edges={["top", "bottom"]}>
      {header}
      {query.isLoading ? (
        <ListSkeleton count={6} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
            />
          }
          ListEmptyComponent={
            <View className="items-center px-8 py-20">
              <Text className="text-center text-base font-semibold text-gray-700">
                {query.isError
                  ? "تعذّر تحميل المحادثات"
                  : "لا توجد محادثات هنا"}
              </Text>
              <Text className="mt-2 text-center text-sm text-gray-500">
                {query.isError
                  ? "تحققي من الاتصال ثم اسحبي للتحديث."
                  : "سيظهر أي طلب يحتاج متابعة في هذه القائمة."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openConversation(item.id)}
              onLongPress={manager ? () => setReassignTarget(item) : undefined}
              delayLongPress={400}
              className={`mx-3 my-2 rounded-lg border bg-white p-4 ${
                item.is_expired
                  ? "border-amber-300"
                  : item.handler_mode === "unassigned"
                  ? "border-red-300"
                  : "border-gray-200"
              }`}
            >
              <View className="mb-2 flex-row-reverse items-start justify-between gap-3">
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
                <View className="items-start gap-2">
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    {formatDistanceToNow(new Date(item.last_message_at), {
                      addSuffix: true,
                      locale: ar,
                    })}
                  </Text>
                  {manager ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setReassignTarget(item);
                      }}
                      hitSlop={8}
                      className="flex-row-reverse items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1"
                    >
                      <Ionicons name="swap-horizontal" size={14} color="#374151" />
                      <Text className="text-xs font-semibold text-gray-700">
                        نقل
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {!!item.preview && (
                <Text
                  numberOfLines={2}
                  className="text-right text-sm leading-5 text-gray-700"
                >
                  {item.preview}
                </Text>
              )}
              <View className="mt-3 flex-row-reverse flex-wrap items-center gap-2">
                <ModeBadge
                  mode={item.handler_mode}
                  assigneeName={item.assignee_name}
                />
                {!!getWindowLabel(item.last_inbound_at) && (
                  <Text
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                      item.is_expired
                        ? "bg-amber-50 text-amber-800"
                        : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {getWindowLabel(item.last_inbound_at)}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Manager reassign sheet */}
      <Modal
        visible={!!reassignTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setReassignTarget(null)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setReassignTarget(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-lg bg-white p-4 pb-8"
          >
            <Text className="text-right text-lg font-bold text-gray-950">
              نقل المحادثة
            </Text>
            <Text className="mt-1 text-right text-xs text-gray-500">
              {reassignTarget?.customer_name ?? reassignTarget?.customer_phone}
            </Text>

            <View className="mt-4">
              <Text className="mb-2 text-right text-xs font-semibold text-gray-600">
                نقل إلى موظف
              </Text>
              {rosterQuery.isLoading ? (
                <ActivityIndicator />
              ) : (
                <ScrollView style={{ maxHeight: 220 }}>
                  {asArray<TeamMemberRosterRow>(rosterQuery.data)
                    .filter((m) => m.is_active)
                    .map((m: TeamMemberRosterRow) => (
                      <Pressable
                        key={m.id}
                        disabled={reassignMutation.isPending}
                        onPress={() =>
                          reassignTarget &&
                          reassignMutation.mutate({
                            conversationId: reassignTarget.id,
                            assignToTeamMemberId: m.id,
                          })
                        }
                        className="flex-row-reverse items-center justify-between border-b border-gray-100 py-3"
                      >
                        <View className="flex-row-reverse items-center gap-2">
                          <View
                            className={`h-2 w-2 rounded-full ${
                              m.is_available && m.on_shift_now
                                ? "bg-emerald-500"
                                : m.is_available
                                ? "bg-emerald-300"
                                : "bg-gray-300"
                            }`}
                          />
                          <Text className="text-right text-sm font-semibold text-gray-950">
                            {m.full_name?.trim() ||
                              (m.role === "admin" ? "المدير" : "موظف")}
                          </Text>
                        </View>
                        <Text className="text-xs text-gray-500">
                          {m.role === "admin" ? "مدير" : "موظف"}
                        </Text>
                      </Pressable>
                    ))}
                </ScrollView>
              )}
            </View>

            <View className="mt-4 gap-2">
              <Pressable
                disabled={reassignMutation.isPending}
                onPress={() =>
                  reassignTarget &&
                  reassignMutation.mutate({
                    conversationId: reassignTarget.id,
                    forceBot: true,
                  })
                }
                className="flex-row-reverse items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 p-3"
              >
                <Text className="text-right text-sm font-semibold text-indigo-900">
                  إرجاع للبوت
                </Text>
                <Ionicons name="hardware-chip-outline" size={20} color="#3730A3" />
              </Pressable>
              <Pressable
                disabled={reassignMutation.isPending}
                onPress={() =>
                  reassignTarget &&
                  reassignMutation.mutate({
                    conversationId: reassignTarget.id,
                    unassign: true,
                  })
                }
                className="flex-row-reverse items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <Text className="text-right text-sm font-semibold text-gray-800">
                  إلغاء التعيين
                </Text>
                <Ionicons name="refresh" size={20} color="#374151" />
              </Pressable>
              <Pressable
                onPress={() => setReassignTarget(null)}
                className="mt-1 items-center rounded-lg border border-gray-200 py-3"
              >
                <Text className="text-sm text-gray-700">إغلاق</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "urgent" | "success" | "bot" | "warning";
}) {
  const toneClass =
    tone === "urgent"
      ? "bg-red-50 border-red-100"
      : tone === "success"
      ? "bg-emerald-50 border-emerald-100"
      : tone === "bot"
      ? "bg-indigo-50 border-indigo-100"
      : "bg-amber-50 border-amber-100";
  const textClass =
    tone === "urgent"
      ? "text-red-800"
      : tone === "success"
      ? "text-emerald-800"
      : tone === "bot"
      ? "text-indigo-800"
      : "text-amber-800";
  return (
    <View className={`flex-1 rounded-lg border p-3 ${toneClass}`}>
      <Text className={`text-right text-xl font-bold ${textClass}`}>
        {value}
      </Text>
      <Text
        className="mt-1 text-right text-[11px] font-medium text-gray-600"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

function ModeBadge({
  mode,
  assigneeName,
}: {
  mode: "unassigned" | "human" | "bot";
  assigneeName?: string | null;
}) {
  const bg =
    mode === "unassigned"
      ? "bg-red-50"
      : mode === "human"
      ? "bg-emerald-50"
      : "bg-indigo-50";
  const fg =
    mode === "unassigned"
      ? "text-red-700"
      : mode === "human"
      ? "text-emerald-800"
      : "text-indigo-800";
  const trimmed = assigneeName?.trim();
  const label =
    mode === "unassigned"
      ? "غير مستلمة"
      : mode === "human"
      ? trimmed
        ? `مع ${trimmed}`
        : "مع موظف"
      : "موكلة للبوت";
  return (
    <View className={`rounded-lg px-2.5 py-1 ${bg}`}>
      <Text className={`text-xs font-semibold ${fg}`}>{label}</Text>
    </View>
  );
}
