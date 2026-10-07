import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { displayMessageText } from "../../../lib/message-display";
import { useSessionStore } from "../../../lib/session-store";
import { isManager } from "../../../lib/roles";
import { NewChatSheet } from "../../../components/new-chat-sheet";
import { FollowUpSheet } from "../../../components/follow-up-sheet";
import {
  asArray,
  getTeamRoster,
  listLabels,
  reassignConversation,
  setConversationArchived,
  type ConversationLabel,
  type TeamMemberRosterRow,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import {
  ListSkeleton,
  managerColors,
} from "../../../components/manager-ui";

type Filter =
  | "all"
  | "awaiting"
  | "follow_up"
  | "unassigned"
  | "mine"
  | "bot"
  | "expired"
  | "archived";
type DateRange = "any" | "today" | "week" | "month";
type Sender = "customer" | "team" | "bot" | "system";

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
  follow_up_at?: string | null;
  follow_up_note?: string | null;
  follow_up_by?: string | null;
};

type InboxRpcRow = ConversationRow & {
  preview: string | null;
  assignee_name: string | null;
  label_ids: string[] | null;
  last_message_content?: string | null;
  last_message_metadata?: Record<string, unknown> | null;
  last_message_role?: "customer" | "agent" | "system" | null;
  last_message_sender?: Sender | null;
  last_message_sender_name?: string | null;
  last_outbound_at?: string | null;
  follow_up_by_name?: string | null;
};

type ListItem = ConversationRow & {
  preview: string | null;
  last_sender: Sender | null;
  last_sender_name: string | null;
  last_sender_id: string | null;
  last_outbound_at: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  follow_up_by: string | null;
  follow_up_by_name: string | null;
  assignee_name: string | null;
  is_expired: boolean;
  is_mine: boolean;
  label_ids: string[];
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// A customer who spoke last more than a week ago is history, not a pending
// reply — keeps imported / long-dead chats out of "بانتظار الرد".
const AWAITING_MAX_AGE_MS = 7 * DAY_MS;
// Waits longer than this get the red "late" treatment.
const LATE_REPLY_MS = HOUR_MS;

const FILTERS: {
  key: Filter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "all", label: "الكل", icon: "chatbubbles-outline" },
  { key: "awaiting", label: "بانتظار الرد", icon: "time-outline" },
  { key: "follow_up", label: "للمتابعة", icon: "flag-outline" },
  { key: "unassigned", label: "غير مستلمة", icon: "alert-circle-outline" },
  { key: "mine", label: "محادثاتي", icon: "person-outline" },
  { key: "bot", label: "مع البوت", icon: "hardware-chip-outline" },
  { key: "expired", label: "خارج النافذة", icon: "hourglass-outline" },
  { key: "archived", label: "المؤرشفة", icon: "archive-outline" },
];
const FILTER_KEYS = new Set<string>(FILTERS.map((f) => f.key));

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

/** Customer spoke last (recently) and nobody — team or bot — answered yet. */
function isAwaiting(item: {
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}) {
  if (!item.last_inbound_at) return false;
  const inbound = new Date(item.last_inbound_at).getTime();
  if (Date.now() - inbound > AWAITING_MAX_AGE_MS) return false;
  if (!item.last_outbound_at) return true;
  return inbound > new Date(item.last_outbound_at).getTime();
}

function waitedMs(item: { last_inbound_at: string | null }) {
  return item.last_inbound_at
    ? Date.now() - new Date(item.last_inbound_at).getTime()
    : 0;
}

function formatWait(ms: number) {
  if (ms < MINUTE_MS) return "الآن";
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)} د`;
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)} س`;
  return `${Math.floor(ms / DAY_MS)} يوم`;
}

function teamMemberIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const v = metadata?.sent_by_team_member_id;
  return typeof v === "string" && v.length > 0 ? v : null;
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
    return raw && FILTER_KEYS.has(raw) ? (raw as Filter) : "all";
  }, [searchParams.filter]);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [dateRange, setDateRange] = useState<DateRange>("any");
  const [labelFilterId, setLabelFilterId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<ListItem | null>(null);
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

      const rows = ((data ?? []) as InboxRpcRow[]).filter((r) =>
        showArchived ? r.archived_at !== null : true
      );

      // The RPC returns the latest message of any role, so the row reflects
      // whichever side spoke most recently.
      return rows.map((r) => {
        const hasLatest = r.last_message_role != null;
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
          preview: hasLatest
            ? displayMessageText({
                content: r.last_message_content ?? null,
                metadata: r.last_message_metadata ?? null,
              })
            : r.preview,
          last_sender: r.last_message_sender ?? (r.preview ? "customer" : null),
          last_sender_name: r.last_message_sender_name ?? null,
          last_sender_id: teamMemberIdFromMetadata(r.last_message_metadata),
          last_outbound_at: r.last_outbound_at ?? null,
          follow_up_at: r.follow_up_at ?? null,
          follow_up_note: r.follow_up_note ?? null,
          follow_up_by: r.follow_up_by ?? null,
          follow_up_by_name: r.follow_up_by_name ?? null,
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
              last_sender: null,
              last_sender_name: null,
              last_sender_id: null,
              last_outbound_at: null,
              follow_up_at: row.follow_up_at ?? null,
              follow_up_note: row.follow_up_note ?? null,
              follow_up_by: row.follow_up_by ?? null,
              follow_up_by_name: null,
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
            const before = prev[idx];
            const followUpBy = row.follow_up_by ?? null;
            const merged: ListItem = {
              ...before,
              ...row,
              follow_up_at: row.follow_up_at ?? null,
              follow_up_note: row.follow_up_note ?? null,
              follow_up_by: followUpBy,
              // The realtime row has no joined names; keep the one we know
              // unless the flagger changed.
              follow_up_by_name:
                followUpBy === before.follow_up_by
                  ? before.follow_up_by_name
                  : followUpBy === teamMemberId
                  ? member?.full_name ?? null
                  : null,
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
            const senderId = teamMemberIdFromMetadata(msg.metadata);
            const isBotReply = msg.role === "agent" && !senderId;
            const shouldIncrementUnread = isCustomer || isBotReply;
            const sender: Sender = isCustomer
              ? "customer"
              : msg.role === "system"
              ? "system"
              : senderId
              ? "team"
              : "bot";
            const merged: ListItem = {
              ...prev[idx],
              preview: msg.content
                ? displayMessageText({ content: msg.content, metadata: msg.metadata })
                : prev[idx].preview,
              last_sender: sender,
              last_sender_id: senderId,
              last_sender_name:
                senderId && senderId === teamMemberId
                  ? member?.full_name ?? null
                  : senderId === prev[idx].last_sender_id
                  ? prev[idx].last_sender_name
                  : null,
              last_message_at: msg.created_at,
              last_inbound_at: isCustomer
                ? msg.created_at
                : prev[idx].last_inbound_at,
              last_outbound_at:
                msg.role === "agent" ? msg.created_at : prev[idx].last_outbound_at,
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
  }, [restaurantId, teamMemberId, member?.full_name, qc, showArchived, inboxKey]);

  const allItems = query.data ?? EMPTY_ITEMS;

  // Re-render every minute so "waiting for X min" labels stay honest even
  // when no realtime event arrives.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), MINUTE_MS);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: 0,
      awaiting: 0,
      follow_up: 0,
      unassigned: 0,
      mine: 0,
      bot: 0,
      expired: 0,
      archived: 0,
    };
    for (const item of allItems) {
      if (item.archived_at) {
        c.archived += 1;
        continue;
      }
      c.all += 1;
      if (isAwaiting(item)) c.awaiting += 1;
      if (item.follow_up_at) c.follow_up += 1;
      if (item.handler_mode === "unassigned") c.unassigned += 1;
      if (item.is_mine) c.mine += 1;
      if (item.handler_mode === "bot") c.bot += 1;
      if (item.is_expired) c.expired += 1;
    }
    return c;
  }, [allItems]);

  const items = useMemo(() => {
    const minTs = rangeStartMs(dateRange);
    const q = normalizeSearch(search);
    const list = allItems.filter((item) => {
      // Primary bucket filter
      if (filter === "awaiting" && !isAwaiting(item)) return false;
      if (filter === "follow_up" && !item.follow_up_at) return false;
      if (filter === "unassigned" && item.handler_mode !== "unassigned")
        return false;
      if (filter === "mine" && !item.is_mine) return false;
      if (filter === "bot" && item.handler_mode !== "bot") return false;
      if (filter === "expired" && !item.is_expired) return false;
      // `archived` filter is enforced by the query fetch itself, but we
      // still guard here so a stale cache doesn't leak rows.
      if (filter === "archived" && !item.archived_at) return false;
      if (filter !== "archived" && item.archived_at) return false;
      if (labelFilterId && !item.label_ids.includes(labelFilterId)) return false;
      // Date range — apply only when not 'any'.
      if (minTs > 0) {
        const ts = new Date(item.last_message_at).getTime();
        if (ts < minTs) return false;
      }
      // Free-text search across name + phone + last preview + follow-up note.
      if (q.length > 0) {
        const hay = `${item.customer_name ?? ""} ${item.customer_phone} ${
          item.preview ?? ""
        } ${item.follow_up_note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Work queues read oldest-first: whoever has waited longest is on top.
    if (filter === "awaiting") {
      return [...list].sort((a, b) => waitedMs(b) - waitedMs(a));
    }
    if (filter === "follow_up") {
      return [...list].sort(
        (a, b) =>
          new Date(a.follow_up_at ?? 0).getTime() -
          new Date(b.follow_up_at ?? 0).getTime()
      );
    }
    return list;
  }, [allItems, filter, dateRange, labelFilterId, search]);

  const canLoadMore = allItems.length >= inboxLimit;
  const loadMore = useCallback(() => {
    if (!canLoadMore || query.isFetching) return;
    setInboxLimit((current) => current + INBOX_PAGE_SIZE);
  }, [canLoadMore, query.isFetching]);

  const activeFilter = FILTERS.find((f) => f.key === filter);
  const activeLabel = labelFilterId ? labelsById.get(labelFilterId) : null;
  const activeFilterCount =
    (filter !== "all" ? 1 : 0) +
    (dateRange !== "any" ? 1 : 0) +
    (labelFilterId ? 1 : 0);

  const header = (
    <View style={styles.headerContainer}>
      <View style={styles.brandBar}>
        <Image
          source={require("../../../assets/logo.png")}
          style={styles.brandLogo}
          resizeMode="contain"
        />
        <View style={styles.brandCopy}>
          <Text style={styles.brandTitle}>المحادثات</Text>
          <Text style={styles.brandSubtitle} numberOfLines={1}>
            {counts.awaiting > 0
              ? `${counts.awaiting} بانتظار الرد`
              : "لا يوجد عملاء بانتظار الرد"}
            {counts.follow_up > 0 ? ` · ${counts.follow_up} للمتابعة` : ""}
          </Text>
        </View>
        {counts.awaiting > 0 && filter !== "awaiting" ? (
          <Pressable
            onPress={() => setFilter("awaiting")}
            style={styles.brandAction}
            accessibilityRole="button"
            accessibilityLabel="عرض المحادثات بانتظار الرد"
          >
            <Ionicons name="time" size={14} color="#16245C" />
            <Text style={styles.brandActionText}>ابدأ بالرد</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.searchRow}>
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
        <Pressable
          onPress={() => setFiltersOpen(true)}
          style={[
            styles.filterButton,
            activeFilterCount > 0 && styles.filterButtonActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="الفلاتر"
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeFilterCount > 0 ? "#FFFFFF" : managerColors.brand}
          />
          {activeFilterCount > 0 ? (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {activeFilterCount > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activePillRow}
        >
          {filter !== "all" && activeFilter ? (
            <ActivePill
              icon={activeFilter.icon}
              label={`${activeFilter.label} · ${counts[filter]}`}
              onClear={() => setFilter("all")}
            />
          ) : null}
          {dateRange !== "any" ? (
            <ActivePill
              icon="calendar-outline"
              label={DATE_RANGES.find((r) => r.key === dateRange)?.label ?? ""}
              onClear={() => setDateRange("any")}
            />
          ) : null}
          {activeLabel ? (
            <ActivePill
              icon="pricetag-outline"
              label={activeLabel.name}
              onClear={() => setLabelFilterId(null)}
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
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
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 84 }}
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
                  : filter === "awaiting"
                  ? "لا يوجد عملاء بانتظار الرد 🎉"
                  : filter === "follow_up"
                  ? "لا توجد محادثات للمتابعة"
                  : "لا توجد محادثات هنا"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {query.isError
                  ? "تحقق من الاتصال ثم اسحب للتحديث."
                  : search.length > 0 || dateRange !== "any"
                  ? "جرّب كلمة بحث مختلفة أو وسّع الفترة الزمنية."
                  : filter === "follow_up"
                  ? "اضغط على علامة 🚩 في أي محادثة لإضافتها للمتابعة."
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
            <ConversationCard
              item={item}
              manager={manager}
              teamMemberId={teamMemberId}
              labelsById={labelsById}
              onOpen={openConversation}
              onManage={setReassignTarget}
              onFollowUp={setFollowUpTarget}
            />
          )}
        />
      )}

      <Pressable
        onPress={() => setNewChatOpen(true)}
        style={styles.newConversationFab}
        accessibilityRole="button"
        accessibilityLabel="محادثة جديدة"
      >
        <Ionicons name="create-outline" size={20} color="#FFFFFF" />
        <Text style={styles.newConversationFabText}>محادثة جديدة</Text>
      </Pressable>

      <NewChatSheet
        visible={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        restaurantId={restaurantId}
        onStarted={(conversationId) => {
          setNewChatOpen(false);
          router.push({
            pathname: "/inbox/[id]",
            params: { id: conversationId, template: "1" },
          });
        }}
      />

      <FollowUpSheet
        visible={!!followUpTarget}
        onClose={() => setFollowUpTarget(null)}
        conversationId={followUpTarget?.id ?? null}
        customerLabel={
          followUpTarget?.customer_name ?? followUpTarget?.customer_phone
        }
        current={followUpTarget}
        restaurantId={restaurantId}
        teamMemberId={teamMemberId}
        teamMemberName={member?.full_name}
      />

      {/* Filters sheet — every bucket lives here so the list gets the screen */}
      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setFiltersOpen(false)}
        >
          <Pressable style={styles.filterSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Pressable onPress={() => {
                setFilter("all");
                setDateRange("any");
                setLabelFilterId(null);
              }}>
                <Text style={styles.sheetReset}>مسح الكل</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>تصفية المحادثات</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetSectionTitle}>عرض</Text>
              <View style={styles.bucketGrid}>
                {FILTERS.map((item) => {
                  const active = filter === item.key;
                  const urgent =
                    (item.key === "awaiting" || item.key === "follow_up") &&
                    counts[item.key] > 0;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setFilter(item.key)}
                      style={[
                        styles.bucketTile,
                        urgent && styles.bucketTileUrgent,
                        active && styles.bucketTileActive,
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={18}
                        color={active ? "#FFFFFF" : urgent ? "#8A5A00" : managerColors.brand}
                      />
                      <Text
                        style={[styles.bucketLabel, active && styles.bucketLabelActive]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                      <Text style={[styles.bucketCount, active && styles.bucketCountActive]}>
                        {item.key === "archived" && !showArchived ? "—" : counts[item.key]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sheetSectionTitle}>الفترة</Text>
              <View style={styles.sheetChipRow}>
                {DATE_RANGES.map((item) => {
                  const active = dateRange === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setDateRange(item.key)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sheetSectionTitle}>الوسم</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetLabelRow}>
                <Pressable
                  onPress={() => setLabelFilterId(null)}
                  style={[styles.sheetChip, !labelFilterId && styles.sheetChipActive]}
                >
                  <Text style={[styles.sheetChipText, !labelFilterId && styles.sheetChipTextActive]}>كل الوسوم</Text>
                </Pressable>
                {(labelsQuery.data ?? []).map((label) => {
                  const active = labelFilterId === label.id;
                  return (
                    <Pressable
                      key={label.id}
                      onPress={() => setLabelFilterId(label.id)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]} numberOfLines={1}>
                        {label.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </ScrollView>

            <Pressable onPress={() => setFiltersOpen(false)} style={styles.sheetDoneButton}>
              <Text style={styles.sheetDoneText}>
                عرض {items.length} محادثة
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manage sheet (long-press / نقل) */}
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
              {/* Follow-up + archive — available to all members. */}
              {reassignTarget ? (
                <Pressable
                  onPress={() => {
                    setFollowUpTarget(reassignTarget);
                    setReassignTarget(null);
                  }}
                  style={styles.followUpAction}
                >
                  <Text style={styles.followUpActionText}>
                    {reassignTarget.follow_up_at
                      ? "تعديل / إنهاء المتابعة"
                      : "إضافة للمتابعة"}
                  </Text>
                  <Ionicons
                    name={reassignTarget.follow_up_at ? "flag" : "flag-outline"}
                    size={20}
                    color="#8A5A00"
                  />
                </Pressable>
              ) : null}
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

function ActivePill({
  icon,
  label,
  onClear,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onClear: () => void;
}) {
  return (
    <Pressable
      onPress={onClear}
      style={styles.activePill}
      accessibilityRole="button"
      accessibilityLabel={`إزالة ${label}`}
    >
      <Ionicons name={icon} size={13} color={managerColors.brand} />
      <Text style={styles.activePillText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="close" size={14} color={managerColors.muted} />
    </Pressable>
  );
}

/**
 * One inbox row. The status line answers "whose turn is it?" at a glance:
 * customer waiting (amber, red once late) vs. answered by a teammate / bot.
 */
function ConversationCard({
  item,
  manager,
  teamMemberId,
  labelsById,
  onOpen,
  onManage,
  onFollowUp,
}: {
  item: ListItem;
  manager: boolean;
  teamMemberId: string;
  labelsById: Map<string, ConversationLabel>;
  onOpen: (id: string) => void;
  onManage: (item: ListItem) => void;
  onFollowUp: (item: ListItem) => void;
}) {
  const awaiting = !item.archived_at && isAwaiting(item);
  const waited = awaiting ? waitedMs(item) : 0;
  const late = awaiting && waited >= LATE_REPLY_MS;
  const flagged = !!item.follow_up_at;
  const repliedByMe =
    item.last_sender === "team" && item.last_sender_id === teamMemberId;
  const teamName = repliedByMe ? "أنت" : item.last_sender_name?.trim() || "الفريق";

  const status: {
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
    tone: "late" | "waiting" | "team" | "bot" | "muted";
  } | null = awaiting
    ? {
        icon: late ? "alert-circle" : "time",
        text: `بانتظار ردّكم · منذ ${formatWait(waited)}`,
        tone: late ? "late" : "waiting",
      }
    : item.last_sender === "team"
    ? { icon: "checkmark-done", text: `تم الرد · ${teamName}`, tone: "team" }
    : item.last_sender === "bot"
    ? { icon: "hardware-chip", text: "ردّ البوت", tone: "bot" }
    : item.last_sender === "customer"
    ? { icon: "time-outline", text: "آخر رسالة من العميل", tone: "muted" }
    : null;

  const prefix =
    item.last_sender === "team"
      ? `${teamName}: `
      : item.last_sender === "bot"
      ? "البوت: "
      : item.last_sender === "system"
      ? "النظام: "
      : null;

  return (
    <Pressable
      onPress={() => onOpen(item.id)}
      onLongPress={() => onManage(item)}
      delayLongPress={400}
      style={[
        styles.conversationCard,
        late
          ? styles.conversationCardLate
          : flagged
          ? styles.conversationCardFlagged
          : awaiting
          ? styles.conversationCardWaiting
          : styles.conversationCardDefault,
      ]}
    >
      <View
        style={[
          styles.conversationAccent,
          late
            ? styles.conversationAccentLate
            : flagged
            ? styles.conversationAccentFlagged
            : awaiting
            ? styles.conversationAccentWaiting
            : item.is_mine
            ? styles.conversationAccentMine
            : item.handler_mode === "bot"
            ? styles.conversationAccentBot
            : styles.conversationAccentDefault,
        ]}
      />
      <View style={styles.conversationTopRow}>
        <View style={styles.conversationIdentity}>
          <Text
            style={[
              styles.conversationName,
              item.unread_count > 0 && styles.conversationNameUnread,
            ]}
            numberOfLines={1}
          >
            {item.customer_name || item.customer_phone}
          </Text>
          {item.customer_name ? (
            <Text style={styles.conversationPhone}>{item.customer_phone}</Text>
          ) : null}
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
          <View style={styles.rowActions}>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onFollowUp(item);
              }}
              hitSlop={8}
              style={[styles.iconAction, flagged && styles.iconActionFlagged]}
              accessibilityRole="button"
              accessibilityLabel={flagged ? "تعديل المتابعة" : "إضافة للمتابعة"}
            >
              <Ionicons
                name={flagged ? "flag" : "flag-outline"}
                size={14}
                color={flagged ? "#8A5A00" : managerColors.muted}
              />
            </Pressable>
            {manager ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onManage(item);
                }}
                hitSlop={8}
                style={styles.transferButton}
              >
                <Ionicons name="swap-horizontal" size={14} color={managerColors.muted} />
                <Text style={styles.transferButtonText}>نقل</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {status ? (
        <View
          style={[
            styles.statusLine,
            status.tone === "late"
              ? styles.statusLate
              : status.tone === "waiting"
              ? styles.statusWaiting
              : status.tone === "team"
              ? styles.statusTeam
              : status.tone === "bot"
              ? styles.statusBot
              : styles.statusMuted,
          ]}
        >
          <Ionicons
            name={status.icon}
            size={13}
            color={
              status.tone === "late"
                ? "#B42318"
                : status.tone === "waiting"
                ? "#B54708"
                : status.tone === "team"
                ? "#067647"
                : status.tone === "bot"
                ? "#3730A3"
                : "#667085"
            }
          />
          <Text
            style={[
              styles.statusText,
              status.tone === "late"
                ? styles.statusTextLate
                : status.tone === "waiting"
                ? styles.statusTextWaiting
                : status.tone === "team"
                ? styles.statusTextTeam
                : status.tone === "bot"
                ? styles.statusTextBot
                : styles.statusTextMuted,
            ]}
            numberOfLines={1}
          >
            {status.text}
          </Text>
        </View>
      ) : null}

      {!!item.preview && (
        <Text numberOfLines={2} style={styles.previewText}>
          {prefix ? (
            <Text
              style={
                item.last_sender === "system"
                  ? styles.previewPrefixSystem
                  : styles.previewPrefixAgent
              }
            >
              {prefix}
            </Text>
          ) : null}
          {item.preview}
        </Text>
      )}

      {flagged ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onFollowUp(item);
          }}
          style={styles.followUpNote}
        >
          <Ionicons name="flag" size={13} color="#8A5A00" />
          <Text style={styles.followUpNoteText} numberOfLines={2}>
            {item.follow_up_note?.trim() || "للمتابعة"}
            {item.follow_up_by_name ? ` — ${item.follow_up_by_name}` : ""}
          </Text>
        </Pressable>
      ) : null}

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
  );
}

function ModeBadge({
  mode,
  assigneeName,
}: {
  mode: "unassigned" | "human" | "bot";
  assigneeName?: string | null;
}) {
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
        mode === "unassigned"
          ? styles.modeBadgeUnassigned
          : mode === "human"
          ? styles.modeBadgeHuman
          : styles.modeBadgeBot,
      ]}
    >
      <Text
        style={[
          styles.modeBadgeText,
          mode === "unassigned"
            ? styles.modeBadgeTextUnassigned
            : mode === "human"
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
      // Patch every page of both inbox caches (active and archived; the key
      // also carries the page limit) so the row moves between tabs without a
      // refetch.
      const activePrefix = ["inbox", restaurantId, teamMemberId, false];
      const archivedPrefix = ["inbox", restaurantId, teamMemberId, true];
      const prevActive = qc.getQueriesData<ListItem[]>({ queryKey: activePrefix });
      const prevArchived = qc.getQueriesData<ListItem[]>({ queryKey: archivedPrefix });
      const nowIso = new Date().toISOString();
      const [fromPrefix, toPrefix, moved] = isArchived
        ? [archivedPrefix, activePrefix, { ...target, archived_at: null }]
        : [activePrefix, archivedPrefix, { ...target, archived_at: nowIso }];
      qc.setQueriesData<ListItem[]>({ queryKey: fromPrefix }, (prev) =>
        prev?.filter((c) => c.id !== target.id)
      );
      qc.setQueriesData<ListItem[]>({ queryKey: toPrefix }, (prev) =>
        prev ? [moved, ...prev.filter((c) => c.id !== target.id)] : prev
      );
      onDone();
      return { prev: [...prevActive, ...prevArchived] };
    },
    onError: (e: unknown, _input, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
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
  newConversationFab: {
    position: "absolute",
    left: 16,
    bottom: 20,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: managerColors.brand,
    boxShadow: "0 10px 24px rgba(1, 31, 145, 0.28)",
  },
  newConversationFabText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  headerContainer: {
    borderBottomWidth: 1,
    borderColor: managerColors.border,
    backgroundColor: managerColors.surface,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    rowGap: 10,
  },
  brandBar: {
    minHeight: 54,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#011F91",
    paddingHorizontal: 12,
    paddingVertical: 8,
    columnGap: 10,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  brandCopy: {
    flex: 1,
    alignItems: "flex-end",
  },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },
  brandSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    marginTop: 1,
    textAlign: "right",
  },
  brandAction: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 4,
    borderRadius: 999,
    backgroundColor: "#FCBD05",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  brandActionText: {
    color: "#16245C",
    fontSize: 12,
    fontWeight: "800",
  },
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  searchBox: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 16,
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
  filterButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  filterButtonActive: {
    borderColor: "#011F91",
    backgroundColor: "#011F91",
  },
  filterCountBadge: {
    position: "absolute",
    top: -5,
    left: -5,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 2,
    borderColor: managerColors.surface,
    backgroundColor: "#FCBD05",
    paddingHorizontal: 3,
  },
  filterCountText: {
    color: "#16245C",
    fontSize: 10,
    fontWeight: "800",
  },
  activePillRow: {
    flexDirection: "row-reverse",
    gap: 6,
  },
  activePill: {
    height: 30,
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
    paddingHorizontal: 10,
  },
  activePillText: {
    maxWidth: 160,
    color: "#16245C",
    fontSize: 12,
    fontWeight: "700",
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(8, 16, 57, 0.42)",
  },
  filterSheet: {
    maxHeight: "86%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#FCFEFC",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 4,
    marginBottom: 18,
    backgroundColor: "#C7D0EA",
  },
  sheetTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  sheetTitle: {
    color: "#16245C",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "right",
  },
  sheetReset: {
    color: "#273B9A",
    fontSize: 13,
    fontWeight: "700",
  },
  sheetSectionTitle: {
    color: "#5E6A99",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 9,
    textAlign: "right",
  },
  bucketGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginBottom: 18,
  },
  bucketTile: {
    width: "48.5%",
    minHeight: 48,
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#F5F7FF",
    paddingHorizontal: 12,
  },
  bucketTileUrgent: {
    borderColor: "#FCD989",
    backgroundColor: "#FFF8E1",
  },
  bucketTileActive: {
    borderColor: "#011F91",
    backgroundColor: "#011F91",
  },
  bucketLabel: {
    flex: 1,
    color: "#16245C",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  bucketLabelActive: {
    color: "#FFFFFF",
  },
  bucketCount: {
    color: "#5E6A99",
    fontSize: 14,
    fontWeight: "800",
  },
  bucketCountActive: {
    color: "#FCBD05",
  },
  sheetChipRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  sheetLabelRow: {
    flexDirection: "row-reverse",
    gap: 8,
    paddingBottom: 2,
    marginBottom: 18,
  },
  sheetChip: {
    minHeight: 40,
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#F5F7FF",
    paddingHorizontal: 13,
  },
  sheetChipActive: {
    borderColor: "#011F91",
    backgroundColor: "#011F91",
  },
  sheetChipText: {
    color: "#5E6A99",
    fontSize: 12,
    fontWeight: "700",
  },
  sheetChipTextActive: {
    color: "#FFFFFF",
  },
  sheetDoneButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#011F91",
  },
  sheetDoneText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
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
    marginVertical: 5,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 18,
  },
  conversationCardDefault: {
    borderColor: "#E8ECFA",
  },
  conversationCardWaiting: {
    borderColor: "#FEDF89",
  },
  conversationCardLate: {
    borderColor: "#FECDCA",
  },
  conversationCardFlagged: {
    borderColor: "#FCD989",
  },
  conversationAccent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 5,
  },
  conversationAccentDefault: {
    backgroundColor: "#D0D5DD",
  },
  conversationAccentWaiting: {
    backgroundColor: "#F79009",
  },
  conversationAccentLate: {
    backgroundColor: "#F04438",
  },
  conversationAccentFlagged: {
    backgroundColor: "#FCBD05",
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
    marginBottom: 6,
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
  conversationNameUnread: {
    fontWeight: "800",
  },
  conversationPhone: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 12,
    color: "#667085",
  },
  conversationMeta: {
    alignItems: "flex-start",
    rowGap: 6,
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
  rowActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 6,
  },
  iconAction: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#F4F7FF",
  },
  iconActionFlagged: {
    backgroundColor: "#FFF4CC",
  },
  transferButton: {
    minHeight: 30,
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
  statusLine: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginBottom: 6,
  },
  statusLate: {
    backgroundColor: "#FEF3F2",
  },
  statusWaiting: {
    backgroundColor: "#FFFAEB",
  },
  statusTeam: {
    backgroundColor: "#ECFDF3",
  },
  statusBot: {
    backgroundColor: "#EEF2FF",
  },
  statusMuted: {
    backgroundColor: "#F2F4F7",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusTextLate: {
    color: "#B42318",
  },
  statusTextWaiting: {
    color: "#B54708",
  },
  statusTextTeam: {
    color: "#067647",
  },
  statusTextBot: {
    color: "#3730A3",
  },
  statusTextMuted: {
    color: "#667085",
  },
  previewText: {
    textAlign: "right",
    fontSize: 14,
    lineHeight: 22,
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
  followUpNote: {
    marginTop: 8,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    columnGap: 6,
    borderRadius: 12,
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  followUpNoteText: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: "#8A5A00",
  },
  conversationBadgeRow: {
    marginTop: 10,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 6,
    rowGap: 6,
  },
  windowBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    fontSize: 11,
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
  modeBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
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
    fontSize: 11,
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
  followUpAction: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCD989",
    backgroundColor: "#FFF8E1",
    padding: 12,
  },
  followUpActionText: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "#8A5A00",
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
