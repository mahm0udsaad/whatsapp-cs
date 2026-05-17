import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
  preview_role: "customer" | "agent" | "system" | null;
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
const inboxTheme = {
  screenBg: managerColors.bg,
  heroBg: managerColors.brand,
  heroBorder: "#3C53B8",
  surface: managerColors.surface,
  surfaceMuted: managerColors.surfaceTint,
  border: managerColors.border,
};

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

      const filtered = rows.filter((r) =>
        showArchived ? r.archived_at !== null : true
      );

      // The RPC only returns the latest customer message as `preview`. Fetch
      // the actual latest message (any role) so the inbox reflects whichever
      // side spoke most recently.
      const convIds = filtered.map((r) => r.id);
      const latestByConv = new Map<
        string,
        { content: string; role: "customer" | "agent" | "system" }
      >();
      if (convIds.length > 0) {
        const { data: recent } = await supabase
          .from("messages")
          .select("conversation_id, content, created_at, role")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(convIds.length * 3);
        for (const m of (recent ?? []) as {
          conversation_id: string;
          content: string | null;
          role: "customer" | "agent" | "system";
        }[]) {
          if (!latestByConv.has(m.conversation_id)) {
            latestByConv.set(m.conversation_id, {
              content: m.content ?? "",
              role: m.role,
            });
          }
        }
      }

      return filtered.map((r) => {
        const latest = latestByConv.get(r.id);
        return {
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
          preview: latest?.content ?? r.preview,
          preview_role: latest?.role ?? (r.preview ? "customer" : null),
          assignee_name: r.assignee_name,
          is_expired: isExpired(r.last_inbound_at),
          is_mine: r.assigned_to === teamMemberId,
          label_ids: r.label_ids ?? [],
        };
      });
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
              preview_role: null,
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
          // No role filter — we want preview to update for customer AND
          // agent/bot replies so the inbox reflects whichever side spoke last.
        },
        (payload) => {
          const msg = payload.new as {
            conversation_id: string;
            content: string | null;
            created_at: string;
            role: "customer" | "agent" | "system";
            metadata?: Record<string, unknown> | null;
          };
          qc.setQueryData<ListItem[]>(inboxKey, (prev) => {
            if (!prev) return prev;
            const idx = prev.findIndex((c) => c.id === msg.conversation_id);
            if (idx === -1) return prev;
            const isCustomer = msg.role === "customer";
            const isBotReply =
              msg.role === "agent" &&
              !((msg.metadata as { sent_by_team_member_id?: string } | null)?.sent_by_team_member_id);
            const shouldIncrementUnread = isCustomer || isBotReply;
            const merged: ListItem = {
              ...prev[idx],
              preview: msg.content ?? prev[idx].preview,
              preview_role: msg.role,
              last_message_at: msg.created_at,
              last_inbound_at: isCustomer
                ? msg.created_at
                : prev[idx].last_inbound_at,
              is_expired: isCustomer ? false : prev[idx].is_expired,
              // Customer messages and bot replies count as unread until a
              // human opens the thread. Manual agent sends do not.
              unread_count: shouldIncrementUnread
                ? (prev[idx].unread_count ?? 0) + 1
                : prev[idx].unread_count,
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
      <View
        style={[
          styles.headerContainer,
          {
            borderColor: inboxTheme.border,
            backgroundColor: inboxTheme.surface,
          },
        ]}
      >
        <View style={styles.headerInner}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: inboxTheme.heroBg,
                borderColor: inboxTheme.heroBorder,
              },
            ]}
          >
            <View style={styles.heroOrbPrimary} />
            <View style={styles.heroOrbSecondary} />
            <View style={styles.heroRow}>
              <View style={styles.heroContent}>
                <Text
                  style={styles.heroEyebrow}
                >
                  مركز المحادثات
                </Text>
                <View style={styles.heroCountRow}>
                  <Text style={styles.heroCountValue}>
                    {attentionCount}
                  </Text>
                  <Text style={styles.heroCountLabel}>
                    تحتاج إجراء
                  </Text>
                </View>
                <Text style={styles.heroDescription}>
                  {attentionCount > 0
                    ? "محادثات تحتاج تدخل قبل باقي القائمة."
                    : "لا توجد محادثات عاجلة الآن."}
                </Text>
              </View>
              <Pressable
                onPress={() => setFilter(leadFilter)}
                style={styles.heroAction}
              >
                <Text style={styles.heroActionTopText}>
                  ابدأ من
                </Text>
                <Text style={styles.heroActionBottomText}>
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
        <View style={styles.metricsRow}>
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
                style={[
                  styles.filterChip,
                  active ? styles.filterChipActive : styles.filterChipIdle,
                ]}
              >
                <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : styles.filterChipTextIdle]}>
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
                style={[
                  styles.dateChip,
                  active ? styles.dateChipActive : styles.dateChipIdle,
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={active ? managerColors.brand : managerColors.muted}
                />
                <Text style={[styles.dateChipText, active ? styles.dateChipTextActive : styles.dateChipTextIdle]}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Search */}
        <View style={styles.searchOuter}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={managerColors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث بالاسم أو الرقم أو نص الرسالة..."
              placeholderTextColor="#98A2B3"
              style={styles.searchInput}
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
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}
      {query.isLoading ? (
        <ListSkeleton count={6} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 18 }}
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
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {query.isError
                  ? "تعذّر تحميل المحادثات"
                  : search.length > 0 || dateRange !== "any"
                  ? "لا توجد نتائج لهذا البحث"
                  : "لا توجد محادثات هنا"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {query.isError
                  ? "تحقق من الاتصال ثم اسحب للتحديث."
                  : search.length > 0 || dateRange !== "any"
                  ? "جرّب كلمة بحث مختلفة أو وسّع الفترة الزمنية."
                  : "سيظهر أي طلب يحتاج متابعة في هذه القائمة."}
              </Text>
            </View>
          }
          ListFooterComponent={
            canLoadMore ? (
              <View style={styles.footerState}>
                {query.isFetching ? (
                  <ActivityIndicator color={managerColors.brand} />
                ) : (
                  <Text style={styles.footerText}>
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
              style={[
                styles.conversationCard,
                item.is_expired
                  ? styles.conversationCardExpired
                  : item.handler_mode === "unassigned"
                  ? styles.conversationCardUnassigned
                  : item.unread_count > 0
                  ? styles.conversationCardUnread
                  : styles.conversationCardDefault,
              ]}
            >
              <View
                style={[
                  styles.conversationAccent,
                  item.handler_mode === "unassigned"
                    ? styles.conversationAccentUnassigned
                    : item.is_expired
                    ? styles.conversationAccentExpired
                    : item.handler_mode === "bot"
                    ? styles.conversationAccentBot
                    : item.is_mine
                    ? styles.conversationAccentMine
                    : styles.conversationAccentDefault,
                ]}
              />
              <View style={styles.conversationTopRow}>
                <View style={styles.conversationIdentity}>
                  <Text
                    style={styles.conversationName}
                    numberOfLines={1}
                  >
                    {item.customer_name || item.customer_phone}
                  </Text>
                  <Text style={styles.conversationPhone}>
                    {item.customer_phone}
                  </Text>
                </View>
                <View style={styles.conversationMeta}>
                  <View style={styles.conversationTimeRow}>
                    <Text style={styles.conversationTime} numberOfLines={1}>
                      {formatDistanceToNow(new Date(item.last_message_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </Text>
                    {item.unread_count > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
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
                      style={styles.transferButton}
                    >
                      <Ionicons name="swap-horizontal" size={14} color={managerColors.muted} />
                      <Text style={styles.transferButtonText}>
                        نقل
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {!!item.preview && (
                <Text
                  numberOfLines={2}
                  style={styles.previewText}
                >
                  {item.preview_role === "agent" && (
                    <Text style={styles.previewPrefixAgent}>
                      {item.handler_mode === "bot" ? "البوت: " : "أنت: "}
                    </Text>
                  )}
                  {item.preview_role === "system" && (
                    <Text style={styles.previewPrefixSystem}>
                      النظام:{" "}
                    </Text>
                  )}
                  {item.preview}
                </Text>
              )}
              <View style={styles.conversationBadgeRow}>
                <ModeBadge
                  mode={item.handler_mode}
                  assigneeName={item.assignee_name}
                />
                {!!getWindowLabel(item.last_inbound_at) && (
                  <Text
                    style={[
                      styles.windowBadge,
                      item.is_expired
                        ? styles.windowBadgeExpired
                        : styles.windowBadgeActive,
                    ]}
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
                      style={styles.labelChipFallback}
                      numberOfLines={1}
                    >
                      {lbl.name}
                    </Text>
                  );
                })}
                {item.label_ids.length > 3 ? (
                  <Text style={styles.moreLabelsText}>
                    +{item.label_ids.length - 3}
                  </Text>
                ) : null}
                {item.archived_at ? (
                  <Text style={styles.archivedBadge}>
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
            <Text className="text-right text-lg font-bold text-[#16245C]">
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
                          <Text className="text-right text-sm font-semibold text-[#16245C]">
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
                    <Text className="text-right text-sm font-semibold text-[#16245C]">
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
      ? styles.metricValueUrgent
      : tone === "success"
      ? styles.metricValueSuccess
      : tone === "bot"
      ? styles.metricValueBot
      : styles.metricValueWarning;
  return (
    <View style={[styles.metricCard, toneClass === "bg-rose-50 border-rose-100" ? styles.metricCardUrgent : toneClass === "bg-[#E9FBF3] border-emerald-100" ? styles.metricCardSuccess : toneClass === "bg-indigo-50 border-indigo-100" ? styles.metricCardBot : styles.metricCardWarning]}>
      <Text style={[styles.metricValue, textClass]}>
        {value}
      </Text>
      <Text
        style={styles.metricLabel}
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
    <View
      style={[
        styles.modeBadge,
        bg === "bg-red-50"
          ? styles.modeBadgeUnassigned
          : bg === "bg-[#E9FBF3]"
          ? styles.modeBadgeHuman
          : styles.modeBadgeBot,
      ]}
    >
      <Text
        style={[
          styles.modeBadgeText,
          fg === "text-red-800"
            ? styles.modeBadgeTextUnassigned
            : fg === "text-[#052E26]"
            ? styles.modeBadgeTextHuman
            : styles.modeBadgeTextBot,
        ]}
      >
        {label}
      </Text>
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
      style={styles.archiveButton}
    >
      <Text style={styles.archiveButtonText}>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F7F9",
  },
  headerContainer: {
    borderBottomWidth: 1,
  },
  headerInner: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  heroCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
  },
  heroOrbPrimary: {
    position: "absolute",
    right: -32,
    top: -40,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroOrbSecondary: {
    position: "absolute",
    left: 16,
    bottom: -32,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,201,40,0.22)",
  },
  heroRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 16,
  },
  heroContent: {
    flex: 1,
  },
  heroEyebrow: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
  },
  heroCountRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    columnGap: 8,
    marginTop: 8,
  },
  heroCountValue: {
    textAlign: "right",
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroCountLabel: {
    paddingBottom: 4,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
  },
  heroDescription: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 22,
    color: "rgba(255,255,255,0.82)",
  },
  heroAction: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FFD34D",
    backgroundColor: "#FFC928",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heroActionTopText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#273B9A",
  },
  heroActionBottomText: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "700",
    color: "#273B9A",
  },
  metricsRow: {
    flexDirection: "row-reverse",
    paddingHorizontal: 16,
    paddingBottom: 12,
    columnGap: 8,
  },
  filterChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
  },
  filterChipActive: {
    borderColor: "#273B9A",
    backgroundColor: "#273B9A",
  },
  filterChipIdle: {
    borderColor: "#E2E7FA",
    backgroundColor: "#F8FAFF",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterChipTextIdle: {
    color: "#344054",
  },
  dateChip: {
    minHeight: 40,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    columnGap: 6,
  },
  dateChipActive: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  dateChipIdle: {
    borderColor: "#E2E7FA",
    backgroundColor: "#F8FAFF",
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dateChipTextActive: {
    color: "#16245C",
  },
  dateChipTextIdle: {
    color: "#5E6A99",
  },
  searchOuter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBox: {
    minHeight: 48,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E7FA",
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 12,
    columnGap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    textAlign: "right",
    fontSize: 14,
    color: "#16245C",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  emptyTitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 14,
    color: "#6B7280",
  },
  footerState: {
    alignItems: "center",
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#667085",
  },
  conversationCard: {
    position: "relative",
    marginHorizontal: 12,
    marginVertical: 6,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  conversationCardDefault: {
    borderColor: "#E8ECFA",
  },
  conversationCardUnread: {
    borderColor: "#D6DDF8",
  },
  conversationCardUnassigned: {
    borderColor: "#FECACA",
  },
  conversationCardExpired: {
    borderColor: "#FDE68A",
  },
  conversationAccent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 6,
  },
  conversationAccentDefault: {
    backgroundColor: "#D0D5DD",
  },
  conversationAccentUnread: {
    backgroundColor: "#273B9A",
  },
  conversationAccentUnassigned: {
    backgroundColor: "#EF4444",
  },
  conversationAccentExpired: {
    backgroundColor: "#F59E0B",
  },
  conversationAccentBot: {
    backgroundColor: "#6366F1",
  },
  conversationAccentMine: {
    backgroundColor: "#00A884",
  },
  conversationTopRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 12,
    marginBottom: 8,
  },
  conversationIdentity: {
    flex: 1,
  },
  conversationName: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "700",
    color: "#16245C",
  },
  conversationPhone: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    color: "#667085",
  },
  conversationMeta: {
    alignItems: "flex-start",
    rowGap: 8,
  },
  conversationTimeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  conversationTime: {
    fontSize: 12,
    color: "#7A88B8",
  },
  unreadBadge: {
    minWidth: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#273B9A",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  transferButton: {
    minHeight: 32,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#F4F7FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    columnGap: 4,
  },
  transferButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#344054",
  },
  previewText: {
    textAlign: "right",
    fontSize: 14,
    lineHeight: 24,
    color: "#445179",
  },
  previewPrefixAgent: {
    fontWeight: "600",
    color: "#273B9A",
  },
  previewPrefixSystem: {
    fontWeight: "600",
    color: "#667085",
  },
  conversationBadgeRow: {
    marginTop: 12,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
    rowGap: 8,
  },
  windowBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "500",
  },
  windowBadgeActive: {
    backgroundColor: "#EDF2FF",
    color: "#1A2A78",
  },
  windowBadgeExpired: {
    backgroundColor: "#FFFBEB",
    color: "#78350F",
  },
  labelChipFallback: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#344054",
  },
  moreLabelsText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#667085",
  },
  archivedBadge: {
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricCardUrgent: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FFE4E6",
  },
  metricCardSuccess: {
    backgroundColor: "#E9FBF3",
    borderColor: "#D1FAE5",
  },
  metricCardBot: {
    backgroundColor: "#EEF2FF",
    borderColor: "#E0E7FF",
  },
  metricCardWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  metricValue: {
    textAlign: "right",
    fontSize: 18,
    fontWeight: "700",
  },
  metricValueUrgent: {
    color: "#9F1239",
  },
  metricValueSuccess: {
    color: "#052E26",
  },
  metricValueBot: {
    color: "#3730A3",
  },
  metricValueWarning: {
    color: "#92400E",
  },
  metricLabel: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "500",
    color: "#667085",
  },
  modeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeBadgeUnassigned: {
    backgroundColor: "#FEF2F2",
  },
  modeBadgeHuman: {
    backgroundColor: "#E9FBF3",
  },
  modeBadgeBot: {
    backgroundColor: "#EEF2FF",
  },
  modeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modeBadgeTextUnassigned: {
    color: "#991B1B",
  },
  modeBadgeTextHuman: {
    color: "#052E26",
  },
  modeBadgeTextBot: {
    color: "#312E81",
  },
  archiveButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D6D3D1",
    backgroundColor: "#FAFAF9",
    padding: 12,
  },
  archiveButtonText: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "#44403C",
  },
});
