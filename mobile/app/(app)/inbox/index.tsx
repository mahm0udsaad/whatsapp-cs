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
  TextInput,
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
import {
  ListSkeleton,
  managerColors,
  premiumShadow,
} from "../../../components/manager-ui";

type Filter = "all" | "unassigned" | "mine" | "bot" | "expired";
type DateRange = "any" | "today" | "week" | "month";

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "any", label: "كل الفترات" },
  { key: "today", label: "اليوم" },
  { key: "week", label: "آخر 7 أيام" },
  { key: "month", label: "آخر 30 يوم" },
];

function rangeStartMs(range: DateRange): number {
  if (range === "any") return 0;
  const now = Date.now();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === "week") return now - 7 * 24 * 60 * 60 * 1000;
  // month
  return now - 30 * 24 * 60 * 60 * 1000;
}

function normalizeSearch(v: string) {
  return v.trim().toLowerCase();
}

type ConversationRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  status: string;
  last_message_at: string;
  last_inbound_at: string | null;
  handler_mode: "unassigned" | "human" | "bot";
  assigned_to: string | null;
  unread_count: number;
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
  const [dateRange, setDateRange] = useState<DateRange>("any");
  const [search, setSearch] = useState("");
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
          "id, customer_name, customer_phone, status, last_message_at, last_inbound_at, handler_mode, assigned_to, unread_count"
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

  // Realtime: patch the inbox cache in place instead of refetching the whole
  // list. On INSERT we prepend; on UPDATE we replace + resort by
  // last_message_at so a new-inbound row jumps to the top instantly. Falls
  // back to the 20s refetchInterval if the socket drops.
  useEffect(() => {
    if (!restaurantId) return;
    const inboxKey = ["inbox", restaurantId, teamMemberId];
    const ch = supabase
      .channel(`inbox-conv:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const row = payload.new as ConversationRow;
          qc.setQueryData<ListItem[]>(inboxKey, (prev) => {
            if (!prev) return prev;
            if (prev.some((c) => c.id === row.id)) return prev;
            const next: ListItem = {
              ...row,
              preview: null,
              assignee_name: null,
              is_expired: isExpired(row.last_inbound_at),
              is_mine: row.assigned_to === teamMemberId,
            };
            return [next, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const row = payload.new as ConversationRow;
          qc.setQueryData<ListItem[]>(inboxKey, (prev) => {
            if (!prev) return prev;
            const idx = prev.findIndex((c) => c.id === row.id);
            if (idx === -1) {
              // Unknown row — fall back to a gentle refetch so we pick up
              // anything the INSERT handler missed (e.g. subscription replay).
              qc.invalidateQueries({ queryKey: inboxKey });
              return prev;
            }
            const merged: ListItem = {
              ...prev[idx],
              ...row,
              is_expired: isExpired(row.last_inbound_at),
              is_mine: row.assigned_to === teamMemberId,
            };
            const rest = prev.filter((_, i) => i !== idx);
            const next = [merged, ...rest].sort(
              (a, b) =>
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime()
            );
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          // We can't filter by restaurant_id on the messages table directly
          // (conversation_id is the tenant key), so the channel sees every
          // insert in the project. That's OK for a small-to-mid tenant — we
          // guard the cache write below by checking the conversation is in
          // this user's inbox.
          filter: `role=eq.customer`,
        },
        (payload) => {
          const msg = payload.new as {
            conversation_id: string;
            content: string | null;
            created_at: string;
          };
          qc.setQueryData<ListItem[]>(inboxKey, (prev) => {
            if (!prev) return prev;
            const idx = prev.findIndex((c) => c.id === msg.conversation_id);
            if (idx === -1) return prev;
            const merged: ListItem = {
              ...prev[idx],
              preview: msg.content ?? prev[idx].preview,
              last_message_at: msg.created_at,
              last_inbound_at: msg.created_at,
              is_expired: false,
              // Optimistically bump — the DB trigger does the same on the
              // server. If the conversation is currently open, the chat
              // screen's mark-read will zero it out on scroll-to-bottom.
              unread_count: (prev[idx].unread_count ?? 0) + 1,
            };
            const rest = prev.filter((_, i) => i !== idx);
            return [merged, ...rest];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [restaurantId, teamMemberId, qc]);

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

  const attentionCount = stats.unassigned + stats.expired;
  const leadFilter: Filter =
    stats.unassigned > 0 ? "unassigned" : stats.expired > 0 ? "expired" : "mine";

  const items = useMemo(() => {
    const minTs = rangeStartMs(dateRange);
    const q = normalizeSearch(search);
    return allItems.filter((item) => {
      // Primary bucket filter
      if (filter === "unassigned" && item.handler_mode !== "unassigned")
        return false;
      if (filter === "mine" && !item.is_mine) return false;
      if (filter === "bot" && item.handler_mode !== "bot") return false;
      if (filter === "expired" && !item.is_expired) return false;
      // Date range — apply only when not 'any'.
      if (minTs > 0) {
        const ts = new Date(item.last_message_at).getTime();
        if (ts < minTs) return false;
      }
      // Free-text search across name + phone + last preview.
      if (q.length > 0) {
        const hay = `${item.customer_name ?? ""} ${item.customer_phone} ${
          item.preview ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allItems, filter, dateRange, search]);

  const header = useMemo(
    () => (
      <View className="border-b border-stone-200 bg-[#FFFDF8]">
        <View className="px-4 pb-3 pt-3">
          <View
            className={`overflow-hidden rounded-lg p-4 ${
              attentionCount > 0 ? "bg-[#2A1713]" : "bg-[#123D2E]"
            }`}
            style={premiumShadow}
          >
            <View className="flex-row-reverse items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="text-right text-xs font-semibold text-white/70">
                  مركز المحادثات
                </Text>
                <Text className="mt-2 text-right text-3xl font-bold text-white">
                  {attentionCount}
                </Text>
                <Text className="mt-1 text-right text-sm leading-6 text-white/80">
                  {attentionCount > 0
                    ? "محادثات تحتاج تدخل قبل باقي القائمة."
                    : "لا توجد محادثات عاجلة الآن."}
                </Text>
              </View>
              <Pressable
                onPress={() => setFilter(leadFilter)}
                className="items-center rounded-lg bg-white px-4 py-3"
              >
                <Text className="text-xs font-semibold text-stone-500">
                  ابدأي من
                </Text>
                <Text className="mt-1 text-sm font-bold text-[#151515]">
                  {leadFilter === "unassigned"
                    ? "غير مستلمة"
                    : leadFilter === "expired"
                    ? "منتهية"
                    : "محادثاتي"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View className="flex-row-reverse gap-2 px-4 pb-3">
          <MetricCard label="غير مستلمة" value={stats.unassigned} tone="urgent" />
          <MetricCard label="محادثاتي" value={stats.mine} tone="success" />
          <MetricCard label="البوت" value={stats.bot} tone="bot" />
          <MetricCard label="منتهية" value={stats.expired} tone="warning" />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="pb-2"
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

        {/* Date range chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="pb-2"
          contentContainerStyle={{
            flexDirection: "row-reverse",
            gap: 8,
            paddingHorizontal: 12,
          }}
        >
          {DATE_RANGES.map((r) => {
            const active = dateRange === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setDateRange(r.key)}
                className={`flex-row-reverse items-center gap-1.5 rounded-lg border px-3 py-2 ${
                  active
                    ? "border-emerald-700 bg-emerald-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={active ? "#065F46" : "#6B7280"}
                />
                <Text
                  className={`text-xs font-semibold ${
                    active ? "text-emerald-900" : "text-gray-700"
                  }`}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Search */}
        <View className="px-4 pb-3">
          <View className="flex-row-reverse items-center gap-2 rounded-lg border border-stone-200 bg-white px-3">
            <Ionicons name="search" size={16} color="#6B7280" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث بالاسم أو الرقم أو نص الرسالة..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 py-2.5 text-right text-sm text-[#151515]"
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    ),
    [attentionCount, filter, leadFilter, stats, dateRange, search]
  );

  const openConversation = useCallback((id: string) => {
    router.push(`/inbox/${id}`);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#F4F3EF]" edges={["top", "bottom"]}>
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
                  : search.length > 0 || dateRange !== "any"
                  ? "لا توجد نتائج لهذا البحث"
                  : "لا توجد محادثات هنا"}
              </Text>
              <Text className="mt-2 text-center text-sm text-gray-500">
                {query.isError
                  ? "تحققي من الاتصال ثم اسحبي للتحديث."
                  : search.length > 0 || dateRange !== "any"
                  ? "جرّبي كلمة بحث مختلفة أو وسّعي الفترة الزمنية."
                  : "سيظهر أي طلب يحتاج متابعة في هذه القائمة."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openConversation(item.id)}
              onLongPress={manager ? () => setReassignTarget(item) : undefined}
              delayLongPress={400}
              className={`relative mx-3 my-1.5 overflow-hidden rounded-lg border bg-[#FFFDF8] p-4 ${
                item.is_expired
                  ? "border-amber-200"
                  : item.handler_mode === "unassigned"
                  ? "border-red-200"
                  : "border-stone-200"
              }`}
              style={item.handler_mode === "unassigned" || item.is_expired ? premiumShadow : undefined}
            >
              <View
                className={`absolute bottom-0 right-0 top-0 w-1.5 ${
                  item.handler_mode === "unassigned"
                    ? "bg-red-500"
                    : item.is_expired
                    ? "bg-amber-500"
                    : item.handler_mode === "bot"
                    ? "bg-indigo-500"
                    : item.is_mine
                    ? "bg-emerald-600"
                    : "bg-stone-200"
                }`}
              />
              <View className="mb-2 flex-row-reverse items-start justify-between gap-3">
                <View className="flex-1">
                  <Text
                    className="text-right text-base font-bold text-[#151515]"
                    numberOfLines={1}
                  >
                    {item.customer_name || item.customer_phone}
                  </Text>
                  <Text className="mt-1 text-right text-xs text-stone-500">
                    {item.customer_phone}
                  </Text>
                </View>
                <View className="items-start gap-2">
                  <View className="flex-row-reverse items-center gap-2">
                    <Text className="text-xs text-stone-500" numberOfLines={1}>
                      {formatDistanceToNow(new Date(item.last_message_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </Text>
                    {item.unread_count > 0 ? (
                      <View className="min-w-5 items-center justify-center rounded-full bg-[#128C5B] px-1.5 py-0.5">
                        <Text className="text-[11px] font-bold text-white">
                          {item.unread_count > 99 ? "99+" : item.unread_count}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {manager ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setReassignTarget(item);
                      }}
                      hitSlop={8}
                      className="flex-row-reverse items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1"
                    >
                      <Ionicons name="swap-horizontal" size={14} color={managerColors.muted} />
                      <Text className="text-xs font-semibold text-stone-700">
                        نقل
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {!!item.preview && (
                <Text
                  numberOfLines={2}
                  className="text-right text-sm leading-5 text-stone-700"
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
                        ? "bg-amber-50 text-amber-900"
                        : "bg-emerald-50 text-emerald-900"
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
            className="rounded-t-lg bg-[#FFFDF8] p-4 pb-8"
          >
            <Text className="text-right text-lg font-bold text-[#151515]">
              نقل المحادثة
            </Text>
            <Text className="mt-1 text-right text-xs text-stone-500">
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
    <View className={`flex-1 rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <Text className={`text-right text-lg font-bold ${textClass}`}>
        {value}
      </Text>
      <Text
        className="mt-0.5 text-right text-[11px] font-medium text-stone-600"
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
      ? "text-red-800"
      : mode === "human"
      ? "text-emerald-900"
      : "text-indigo-900";
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
