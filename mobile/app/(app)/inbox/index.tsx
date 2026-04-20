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
  listLabels,
  reassignConversation,
  setConversationArchived,
  type ConversationLabel,
  type TeamMemberRosterRow,
} from "../../../lib/api";
import { labelChipClasses } from "../../../lib/label-colors";
import { qk } from "../../../lib/query-keys";
import {
  ListSkeleton,
  managerColors,
  premiumShadow,
  softShadow,
} from "../../../components/manager-ui";

type Filter = "all" | "unassigned" | "mine" | "bot" | "expired" | "archived";
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
  archived_at: string | null;
};

type ListItem = ConversationRow & {
  preview: string | null;
  assignee_name: string | null;
  is_expired: boolean;
  is_mine: boolean;
  label_ids: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unassigned", label: "غير مستلمة" },
  { key: "mine", label: "محادثاتي" },
  { key: "bot", label: "مع البوت" },
  { key: "expired", label: "خارج النافذة" },
  { key: "archived", label: "المؤرشفة" },
];

const EMPTY_ITEMS: ListItem[] = [];
const INBOX_PAGE_SIZE = 30;

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
  const [inboxLimit, setInboxLimit] = useState(INBOX_PAGE_SIZE);
  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  // Reassign bottom-sheet state (manager only).
  const [reassignTarget, setReassignTarget] = useState<ListItem | null>(
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
    // Optimistic: flip the row immediately so the modal can close to a list
    // that already reflects the new owner. Realtime UPDATE reconciles any
    // server-side diffs.
    onMutate: async (input) => {
      const activeInboxKey = [
        "inbox",
        restaurantId,
        teamMemberId,
        filter === "archived",
        inboxLimit,
      ];
      await qc.cancelQueries({ queryKey: activeInboxKey });
      const prevList = qc.getQueryData<ListItem[]>(activeInboxKey);

      const nextMode: "unassigned" | "human" | "bot" = input.forceBot
        ? "bot"
        : input.unassign
        ? "unassigned"
        : "human";
      const nextAssigned: string | null = input.forceBot
        ? null
        : input.unassign
        ? null
        : input.assignToTeamMemberId ?? null;

      if (prevList) {
        qc.setQueryData<ListItem[]>(
          activeInboxKey,
          prevList.map((c) =>
            c.id === input.conversationId
              ? {
                  ...c,
                  handler_mode: nextMode,
                  assigned_to: nextAssigned,
                  is_mine: nextAssigned === teamMemberId,
                  assignee_name:
                    nextMode === "human" ? c.assignee_name : null,
                }
              : c
          )
        );
      }

      setReassignTarget(null);
      return { prevList };
    },
    onError: (e: unknown, _input, ctx) => {
      if (ctx?.prevList) {
        qc.setQueryData(
          ["inbox", restaurantId, teamMemberId, filter === "archived", inboxLimit],
          ctx.prevList
        );
      }
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر التحويل");
    },
  });

  // When the user selects "المؤرشفة" we fetch archived rows; every other
  // filter hides them. Two separate caches so toggling doesn't discard the
  // other set.
  const showArchived = filter === "archived";
  const inboxKey = useMemo(
    () => ["inbox", restaurantId, teamMemberId, showArchived, inboxLimit],
    [restaurantId, teamMemberId, showArchived, inboxLimit]
  );
  useEffect(() => {
    setInboxLimit(INBOX_PAGE_SIZE);
  }, [showArchived]);

  const query = useQuery({
    queryKey: inboxKey,
    enabled: !!restaurantId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<ListItem[]> => {
      const { data, error } = await supabase.rpc("mobile_inbox_list", {
        p_restaurant_id: restaurantId,
        p_limit: inboxLimit,
        p_include_archived: showArchived,
      });
      if (error) throw error;

      const rows = (data ?? []) as (ConversationRow & {
        preview: string | null;
        assignee_name: string | null;
        label_ids: string[] | null;
      })[];

      return rows
        // When showArchived is true the RPC returns BOTH archived and
        // active rows; filter to archived-only so the inbox shows what the
        // user expects. When false the RPC already excluded archived.
        .filter((r) => (showArchived ? r.archived_at !== null : true))
        .map((r) => ({
          id: r.id,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          status: r.status,
          last_message_at: r.last_message_at,
          last_inbound_at: r.last_inbound_at,
          handler_mode: r.handler_mode,
          assigned_to: r.assigned_to,
          unread_count: r.unread_count,
          archived_at: r.archived_at,
          preview: r.preview,
          assignee_name: r.assignee_name,
          is_expired: isExpired(r.last_inbound_at),
          is_mine: r.assigned_to === teamMemberId,
          label_ids: r.label_ids ?? [],
        }));
    },
  });

  // Labels list for rendering chips + the picker modal. Cached aggressively
  // since labels rarely change during a session.
  const labelsQuery = useQuery({
    queryKey: ["labels", restaurantId],
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConversationLabel[]> => {
      return listLabels();
    },
  });
  const labelsById = useMemo(() => {
    const m = new Map<string, ConversationLabel>();
    for (const l of labelsQuery.data ?? []) m.set(l.id, l);
    return m;
  }, [labelsQuery.data]);

  // Realtime: patch the inbox cache in place instead of refetching the whole
  // list. On INSERT we prepend; on UPDATE we replace + resort by
  // last_message_at so a new-inbound row jumps to the top instantly. Falls
  // back to the 20s refetchInterval if the socket drops.
  useEffect(() => {
    if (!restaurantId) return;
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
            // New rows are never archived on insert; skip if we're on the
            // "archived only" tab.
            if (showArchived && !row.archived_at) return prev;
            if (!showArchived && row.archived_at) return prev;
            const next: ListItem = {
              ...row,
              preview: null,
              assignee_name: null,
              label_ids: [],
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
  }, [restaurantId, teamMemberId, qc, showArchived, inboxKey]);

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
      // `archived` filter is enforced by the query fetch itself, but we
      // still guard here so a stale cache doesn't leak rows.
      if (filter === "archived" && !item.archived_at) return false;
      if (filter !== "archived" && item.archived_at) return false;
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

  const canLoadMore = allItems.length >= inboxLimit;
  const loadMore = useCallback(() => {
    if (!canLoadMore || query.isFetching) return;
    setInboxLimit((current) => current + INBOX_PAGE_SIZE);
  }, [canLoadMore, query.isFetching]);

  const header = useMemo(
    () => (
      <View className="border-b border-[#E6E8EC] bg-white">
        <View className="px-4 pb-3 pt-3">
          <View
            className="overflow-hidden rounded-lg bg-[#052E26] p-4"
            style={premiumShadow}
          >
            <View className="flex-row-reverse items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="text-right text-xs font-semibold text-emerald-100/80">
                  مركز المحادثات
                </Text>
                <View className="mt-2 flex-row-reverse items-end gap-2">
                  <Text className="text-right text-4xl font-bold text-white">
                    {attentionCount}
                  </Text>
                  <Text className="pb-1 text-right text-sm font-semibold text-emerald-100/80">
                    تحتاج إجراء
                  </Text>
                </View>
                <Text className="mt-2 text-right text-sm leading-6 text-white/80">
                  {attentionCount > 0
                    ? "محادثات تحتاج تدخل قبل باقي القائمة."
                    : "لا توجد محادثات عاجلة الآن."}
                </Text>
              </View>
              <Pressable
                onPress={() => setFilter(leadFilter)}
                className="min-h-12 items-center justify-center rounded-lg bg-white px-4 py-3"
              >
                <Text className="text-xs font-semibold text-[#667085]">
                  ابدأي من
                </Text>
                <Text className="mt-1 text-sm font-bold text-[#0B0F13]">
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
                className={`min-h-11 rounded-lg border px-3 py-2 ${
                  active
                    ? "border-[#0B0F13] bg-[#0B0F13]"
                    : "border-[#E6E8EC] bg-white"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    active ? "text-white" : "text-[#344054]"
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
                className={`min-h-11 flex-row-reverse items-center gap-1.5 rounded-lg border px-3 py-2 ${
                  active
                    ? "border-[#00A884] bg-[#E9FBF3]"
                    : "border-[#E6E8EC] bg-white"
                }`}
              >
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={active ? managerColors.brand : managerColors.muted}
                />
                <Text
                  className={`text-xs font-semibold ${
                    active ? "text-[#052E26]" : "text-[#344054]"
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
          <View
            className="min-h-12 flex-row-reverse items-center gap-2 rounded-lg border border-[#E6E8EC] bg-[#F6F7F9] px-3"
            style={softShadow}
          >
            <Ionicons name="search" size={16} color={managerColors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث بالاسم أو الرقم أو نص الرسالة..."
              placeholderTextColor="#98A2B3"
              className="flex-1 py-2.5 text-right text-sm text-[#0B0F13]"
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#98A2B3" />
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
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["top", "bottom"]}>
      {header}
      {query.isLoading ? (
        <ListSkeleton count={6} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentInsetAdjustmentBehavior="automatic"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
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
          ListFooterComponent={
            canLoadMore ? (
              <View className="items-center py-4">
                {query.isFetching ? (
                  <ActivityIndicator color={managerColors.brand} />
                ) : (
                  <Text className="text-xs font-semibold text-[#667085]">
                    اسحبي لأسفل لتحميل المزيد
                  </Text>
                )}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openConversation(item.id)}
              onLongPress={() => setReassignTarget(item)}
              delayLongPress={400}
              className={`relative mx-3 my-1.5 overflow-hidden rounded-lg border bg-white p-4 ${
                item.is_expired
                  ? "border-amber-200"
                  : item.handler_mode === "unassigned"
                  ? "border-red-200"
                  : "border-[#E6E8EC]"
              }`}
              style={
                item.handler_mode === "unassigned" ||
                item.is_expired ||
                item.unread_count > 0
                  ? premiumShadow
                  : softShadow
              }
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
                    ? "bg-[#00A884]"
                    : "bg-[#D0D5DD]"
                }`}
              />
              <View className="mb-2 flex-row-reverse items-start justify-between gap-3">
                <View className="flex-1">
                  <Text
                    className="text-right text-base font-bold text-[#0B0F13]"
                    numberOfLines={1}
                  >
                    {item.customer_name || item.customer_phone}
                  </Text>
                  <Text className="mt-1 text-right text-xs text-[#667085]">
                    {item.customer_phone}
                  </Text>
                </View>
                <View className="items-start gap-2">
                  <View className="flex-row-reverse items-center gap-2">
                    <Text className="text-xs text-[#667085]" numberOfLines={1}>
                      {formatDistanceToNow(new Date(item.last_message_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </Text>
                    {item.unread_count > 0 ? (
                      <View className="min-w-5 items-center justify-center rounded-full bg-[#00A884] px-1.5 py-0.5">
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
                      className="min-h-8 flex-row-reverse items-center gap-1 rounded-lg bg-[#F2F4F7] px-2.5 py-1"
                    >
                      <Ionicons name="swap-horizontal" size={14} color={managerColors.muted} />
                      <Text className="text-xs font-semibold text-[#344054]">
                        نقل
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {!!item.preview && (
                <Text
                  numberOfLines={2}
                  className="text-right text-sm leading-5 text-[#344054]"
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
                        : "bg-[#E9FBF3] text-[#052E26]"
                    }`}
                  >
                    {getWindowLabel(item.last_inbound_at)}
                  </Text>
                )}
                {/* Render up to 3 label chips inline; overflow shows a "+N". */}
                {item.label_ids.slice(0, 3).map((lid) => {
                  const lbl = labelsById.get(lid);
                  if (!lbl) return null;
                  const cls = labelChipClasses[lbl.color];
                  return (
                    <Text
                      key={lid}
                      className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${cls.bg} ${cls.fg} ${cls.border}`}
                      numberOfLines={1}
                    >
                      {lbl.name}
                    </Text>
                  );
                })}
                {item.label_ids.length > 3 ? (
                  <Text className="text-[11px] font-semibold text-[#667085]">
                    +{item.label_ids.length - 3}
                  </Text>
                ) : null}
                {item.archived_at ? (
                  <Text className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    مؤرشفة
                  </Text>
                ) : null}
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
            <Text className="text-right text-lg font-bold text-[#0B0F13]">
              إدارة المحادثة
            </Text>
            <Text className="mt-1 text-right text-xs text-[#667085]">
              {reassignTarget?.customer_name ?? reassignTarget?.customer_phone}
            </Text>

            {manager ? (
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
            ) : null}

            <View className="mt-4 gap-2">
              {manager ? (
                <>
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
                </>
              ) : null}
              {/* Archive toggle — available to all members. Archiving removes
                 the row from the default inbox; "المؤرشفة" filter brings it
                 back. */}
              {reassignTarget ? (
                <ArchiveToggleButton
                  target={reassignTarget}
                  onDone={() => setReassignTarget(null)}
                />
              ) : null}
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
      ? "bg-rose-50 border-rose-100"
      : tone === "success"
      ? "bg-[#E9FBF3] border-emerald-100"
      : tone === "bot"
      ? "bg-indigo-50 border-indigo-100"
      : "bg-amber-50 border-amber-100";
  const textClass =
    tone === "urgent"
      ? "text-rose-800"
      : tone === "success"
      ? "text-[#052E26]"
      : tone === "bot"
      ? "text-indigo-800"
      : "text-amber-800";
  return (
    <View className={`flex-1 rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <Text className={`text-right text-lg font-bold ${textClass}`}>
        {value}
      </Text>
      <Text
        className="mt-0.5 text-right text-[11px] font-medium text-[#667085]"
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
      ? "bg-[#E9FBF3]"
      : "bg-indigo-50";
  const fg =
    mode === "unassigned"
      ? "text-red-800"
      : mode === "human"
      ? "text-[#052E26]"
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

// Small component so we can use hooks for the archive toggle without
// polluting the main InboxScreen. Optimistically flips the row in cache,
// rolls back on failure.
function ArchiveToggleButton({
  target,
  onDone,
}: {
  target: ListItem;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const teamMemberId = member?.id ?? "";
  const isArchived = !!target.archived_at;

  const mutation = useMutation({
    mutationFn: async () => setConversationArchived(target.id, !isArchived),
    onMutate: async () => {
      // Patch both inbox caches (active and archived) so the row moves
      // between tabs without a refetch.
      const activeKey = ["inbox", restaurantId, teamMemberId, false];
      const archivedKey = ["inbox", restaurantId, teamMemberId, true];
      const prevActive = qc.getQueryData<ListItem[]>(activeKey);
      const prevArchived = qc.getQueryData<ListItem[]>(archivedKey);
      const nowIso = new Date().toISOString();
      if (!isArchived) {
        // Active → archived: remove from active, prepend to archived.
        if (prevActive) {
          qc.setQueryData(
            activeKey,
            prevActive.filter((c) => c.id !== target.id)
          );
        }
        if (prevArchived) {
          qc.setQueryData(archivedKey, [
            { ...target, archived_at: nowIso },
            ...prevArchived,
          ]);
        }
      } else {
        // Archived → active
        if (prevArchived) {
          qc.setQueryData(
            archivedKey,
            prevArchived.filter((c) => c.id !== target.id)
          );
        }
        if (prevActive) {
          qc.setQueryData(activeKey, [
            { ...target, archived_at: null },
            ...prevActive,
          ]);
        }
      }
      onDone();
      return { prevActive, prevArchived };
    },
    onError: (e: unknown, _input, ctx) => {
      const activeKey = ["inbox", restaurantId, teamMemberId, false];
      const archivedKey = ["inbox", restaurantId, teamMemberId, true];
      if (ctx?.prevActive) qc.setQueryData(activeKey, ctx.prevActive);
      if (ctx?.prevArchived) qc.setQueryData(archivedKey, ctx.prevArchived);
      Alert.alert(
        "خطأ",
        e instanceof Error ? e.message : "تعذّر تحديث الأرشيف"
      );
    },
  });

  return (
    <Pressable
      disabled={mutation.isPending}
      onPress={() => mutation.mutate()}
      className="flex-row-reverse items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-3"
    >
      <Text className="text-right text-sm font-semibold text-stone-800">
        {isArchived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
      </Text>
      <Ionicons
        name={isArchived ? "archive" : "archive-outline"}
        size={20}
        color="#44403C"
      />
    </Pressable>
  );
}
