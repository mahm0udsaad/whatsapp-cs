import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  addDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
} from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import {
  addTeamMemberNote,
  deleteTeamMemberNote,
  forceOffline,
  getAgentPerformanceDetail,
  getTeamMemberGoals,
  getTeamPerformance,
  getTeamRoster,
  getWeeklyShifts,
  listTeamMemberNotes,
  setTeamMemberGoals,
  type AgentPerformanceDetail,
  type TeamMemberRosterRow,
  type TeamPerformanceRow,
  type WeeklyShiftRow,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { captureMessage } from "../../../lib/observability";
import { EmptyState, ErrorState } from "../../../components/list-state";
import {
  CardSkeleton,
  ListSkeleton,
  ManagerCard,
  ManagerMetric,
  managerColors,
} from "../../../components/manager-ui";

type Segment = "people" | "schedule" | "performance";

function initialsOf(name: string | null) {
  if (!name) return "؟";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

function formatIsoWeekStart(date: Date) {
  return format(startOfWeek(date, { weekStartsOn: 6 }), "yyyy-MM-dd");
}

export default function TeamScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const [segment, setSegment] = useState<Segment>("people");
  const [selectedMember, setSelectedMember] =
    useState<TeamMemberRosterRow | null>(null);
  const [weekStart, setWeekStart] = useState<string>(() =>
    formatIsoWeekStart(new Date())
  );
  const qc = useQueryClient();

  const rosterQuery = useQuery({
    queryKey: qk.teamRoster(restaurantId),
    enabled: !!restaurantId && segment === "people",
    queryFn: getTeamRoster,
    refetchInterval: 30_000,
  });

  const scheduleQuery = useQuery({
    queryKey: qk.weeklySchedule(restaurantId, weekStart),
    enabled: !!restaurantId && segment === "schedule",
    queryFn: () => getWeeklyShifts(weekStart),
  });

  const forceOfflineMutation = useMutation({
    mutationFn: (teamMemberId: string) => forceOffline(teamMemberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teamRoster(restaurantId) });
      setSelectedMember(null);
    },
    onError: (e: unknown) => {
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذر التحديث");
    },
  });

  if (!restaurantId) {
    return (
      <View className="flex-1" style={{ backgroundColor: managerColors.bg }}>
        <View className="flex-row-reverse gap-2 px-3 pt-3 pb-2">
          <CardSkeleton rows={1} className="flex-1" />
          <CardSkeleton rows={1} className="flex-1" />
        </View>
        <ListSkeleton count={5} showAvatar />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      {/* Segmented control */}
      <View className="flex-row-reverse gap-2 px-3 pt-3 pb-2">
        <SegButton
          label="الفريق"
          active={segment === "people"}
          onPress={() => setSegment("people")}
        />
        <SegButton
          label="المناوبات"
          active={segment === "schedule"}
          onPress={() => setSegment("schedule")}
        />
        <SegButton
          label="الأداء"
          active={segment === "performance"}
          onPress={() => setSegment("performance")}
        />
      </View>

      {segment === "people" ? (
        <PeopleSegment
          query={rosterQuery}
          onSelectMember={setSelectedMember}
        />
      ) : segment === "schedule" ? (
        <ScheduleSegment
          query={scheduleQuery}
          weekStart={weekStart}
          onChangeWeekStart={setWeekStart}
        />
      ) : (
        <PerformanceSegment restaurantId={restaurantId} />
      )}

      {/* Member action sheet */}
      <Modal
        visible={!!selectedMember}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMember(null)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setSelectedMember(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-[28px] p-4 pb-8"
            style={{ backgroundColor: managerColors.surface }}
          >
            <Text className="text-right text-lg font-bold text-gray-950">
              {selectedMember?.full_name ?? "موظف"}
            </Text>
            <Text className="text-right text-xs text-gray-500 mt-1">
              {selectedMember?.role === "admin" ? "مدير" : "موظف"} ·{" "}
              {selectedMember?.is_available ? "متاح" : "غير متاح"}
            </Text>
            <View className="mt-4">
              {selectedMember?.is_available ? (
                <Pressable
                  onPress={() =>
                    selectedMember
                      ? forceOfflineMutation.mutate(selectedMember.id)
                      : null
                  }
                  disabled={forceOfflineMutation.isPending}
                  className="flex-row-reverse items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3"
                >
                  <Text className="text-right text-sm font-semibold text-red-900">
                    إيقاف الاستلام الآن
                  </Text>
                  <Ionicons name="moon-outline" size={20} color="#991B1B" />
                </Pressable>
              ) : (
                <View className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <Text className="text-right text-sm text-gray-600">
                    الموظف غير متاح حالياً
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => setSelectedMember(null)}
                className="mt-3 items-center rounded-lg border border-gray-200 py-3"
              >
                <Text className="text-sm text-gray-700">إغلاق</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SegButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-lg border py-2 ${
        active ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"
      }`}
    >
      <Text
        className={`text-sm font-semibold ${
          active ? "text-emerald-900" : "text-gray-700"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PeopleSegment({
  query,
  onSelectMember,
}: {
  query: ReturnType<typeof useQuery<TeamMemberRosterRow[]>>;
  onSelectMember: (m: TeamMemberRosterRow) => void;
}) {
  // Defensive: coerce to array. If middleware/proxy ever serves an HTML page
  // with 200 (e.g. the /login shell for an unauthenticated redirect), apiFetch
  // will hand us a string whose .filter crashes the screen.
  const rows = useMemo<TeamMemberRosterRow[]>(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data]
  );
  const rawData = query.data as unknown;
  if (rawData !== undefined && !Array.isArray(rawData)) {
    captureMessage(
      "/api/mobile/team/roster returned non-array shape",
      "warning",
      {
        shape: typeof rawData,
        preview:
          typeof rawData === "string"
            ? (rawData as string).slice(0, 80)
            : rawData,
      }
    );
  }
  const isRefreshing = query.isFetching;
  const summary = useMemo(
    () => ({
      available: rows.filter((m) => m.is_available).length,
      onShift: rows.filter((m) => m.on_shift_now).length,
      overloaded: rows.filter((m) => m.active_conversations >= 5).length,
      missingPush: rows.filter((m) => !m.has_push_device).length,
    }),
    [rows]
  );

  if (query.isLoading) {
    return (
      <View className="flex-1">
        <View className="px-4 pt-3">
          <CardSkeleton rows={4} />
        </View>
        <ListSkeleton count={5} showAvatar />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ padding: 12 }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={() => query.refetch()} />
      }
      ListEmptyComponent={
        query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : (
          <EmptyState
            icon="people-outline"
            title="لا يوجد أعضاء في الفريق"
            description="أضيفي أعضاء من لوحة الإدارة على الويب لتظهري بياناتهم هنا."
          />
        )
      }
      ListHeaderComponent={
        rows.length > 0 ? (
          <ManagerCard className="mb-3">
            <Text className="text-right text-sm font-bold text-gray-950">
              حالة الفريق الآن
            </Text>
            <View className="mt-3 flex-row-reverse gap-2">
              <ManagerMetric
                label="متاح"
                value={summary.available}
                tone="success"
                compact
              />
              <ManagerMetric
                label="في المناوبة"
                value={summary.onShift}
                tone="info"
                compact
              />
            </View>
            <View className="mt-2 flex-row-reverse gap-2">
              <ManagerMetric
                label="ضغط عال"
                value={summary.overloaded}
                tone={summary.overloaded > 0 ? "warning" : "neutral"}
                compact
              />
              <ManagerMetric
                label="تنبيهات ناقصة"
                value={summary.missingPush}
                tone={summary.missingPush > 0 ? "danger" : "neutral"}
                compact
              />
            </View>
          </ManagerCard>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onSelectMember(item)}
          className="mb-2 flex-row-reverse items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
        >
          <View className="relative">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-gray-100">
              <Text className="font-bold text-gray-700">
                {initialsOf(item.full_name)}
              </Text>
            </View>
            <View
              className={`absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white ${
                item.is_available && item.on_shift_now
                  ? "bg-emerald-500"
                  : item.is_available
                  ? "bg-emerald-300"
                  : "bg-gray-300"
              }`}
            />
          </View>
          <View className="flex-1">
            <Text className="text-right text-base font-semibold text-gray-950">
              {item.full_name ?? "—"}
            </Text>
            <Text className="mt-0.5 text-right text-xs text-gray-500">
              {item.role === "admin" ? "مدير" : "موظف"}
              {item.on_shift_now ? " · في المناوبة" : ""}
              {item.active_conversations > 0
                ? ` · ${item.active_conversations} محادثة`
                : ""}
            </Text>
          </View>
          {!item.has_push_device ? (
            <Ionicons
              name="notifications-off-outline"
              size={18}
              color="#9CA3AF"
            />
          ) : null}
          <Ionicons name="chevron-back" size={18} color="#9CA3AF" />
        </Pressable>
      )}
    />
  );
}

function ScheduleSegment({
  query,
  weekStart,
  onChangeWeekStart,
}: {
  query: ReturnType<typeof useQuery<WeeklyShiftRow[]>>;
  weekStart: string;
  onChangeWeekStart: (s: string) => void;
}) {
  // Same defensive coercion as PeopleSegment — the schedule endpoint has the
  // same failure mode if the backend ever returns HTML instead of JSON.
  const shifts = useMemo<WeeklyShiftRow[]>(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data]
  );

  const weekStartDate = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)),
    [weekStartDate]
  );
  const [selectedDay, setSelectedDay] = useState<number>(0);

  const dayShifts = useMemo(() => {
    const target = days[selectedDay];
    const targetStr = format(target, "yyyy-MM-dd");
    return shifts.filter((s) => s.starts_at.startsWith(targetStr));
  }, [shifts, days, selectedDay]);

  function navigateWeek(deltaDays: number) {
    onChangeWeekStart(format(addDays(weekStartDate, deltaDays), "yyyy-MM-dd"));
    setSelectedDay(0);
  }

  return (
    <View className="flex-1">
      {/* Week header */}
      <View className="flex-row-reverse items-center justify-between px-3 pt-1 pb-2">
        <Pressable onPress={() => navigateWeek(7)} className="p-2">
          <Ionicons name="chevron-forward" size={22} color="#374151" />
        </Pressable>
        <Text className="text-sm font-semibold text-gray-950">
          {format(weekStartDate, "d MMM")} - {format(addDays(weekStartDate, 6), "d MMM")}
        </Text>
        <Pressable onPress={() => navigateWeek(-7)} className="p-2">
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </Pressable>
      </View>

      {/* Day chips */}
      <View className="flex-row-reverse gap-2 px-3 pb-2">
        {days.map((d, idx) => (
          <Pressable
            key={d.toISOString()}
            onPress={() => setSelectedDay(idx)}
            className={`flex-1 items-center rounded-lg border py-2 ${
              idx === selectedDay
                ? "border-emerald-200 bg-emerald-50"
                : "border-gray-100 bg-white"
            }`}
          >
            <Text className="text-[11px] text-gray-500">{format(d, "EEE")}</Text>
            <Text
              className={`mt-0.5 text-sm font-bold ${
                idx === selectedDay ? "text-emerald-900" : "text-gray-800"
              }`}
            >
              {format(d, "d")}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <View className="flex-1 px-4 pt-3">
          <CardSkeleton rows={1} />
          <View className="mt-3">
            <ListSkeleton count={4} />
          </View>
        </View>
      ) : (
        <FlatList
          data={dayShifts}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
            />
          }
          ListEmptyComponent={
            query.isError ? (
              <ErrorState onRetry={() => query.refetch()} />
            ) : (
              <View className="items-center py-16">
                <Text className="text-gray-500">
                  لا توجد مناوبات في هذا اليوم
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View className="mb-2 rounded-lg border border-gray-200 bg-white p-3">
              <Text className="text-right text-base font-semibold text-gray-950">
                {item.team_member_name ?? "—"}
              </Text>
              <Text className="mt-1 text-right text-sm text-gray-600">
                {format(new Date(item.starts_at), "HH:mm")} —{" "}
                {format(new Date(item.ends_at), "HH:mm")}
              </Text>
              {item.note ? (
                <Text className="mt-1 text-right text-xs text-gray-500">
                  {item.note}
                </Text>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            <Pressable
              onPress={() => {
                const base = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
                if (base) Linking.openURL(`${base}/dashboard/shifts`);
              }}
              className="mt-3 items-center rounded-lg border border-gray-200 bg-white py-3"
            >
              <Text className="text-sm text-gray-700">تعديل من الويب</Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Performance segment
// ---------------------------------------------------------------------------

type PeriodKey = "today" | "week" | "month" | "last_month";

interface PeriodRange {
  from: string; // ISO
  to: string; // ISO
  label: string;
}

function rangeFor(key: PeriodKey, now = new Date()): PeriodRange {
  if (key === "today") {
    return {
      from: startOfDay(now).toISOString(),
      to: endOfDay(now).toISOString(),
      label: "اليوم",
    };
  }
  if (key === "week") {
    const ws = startOfWeek(now, { weekStartsOn: 6 });
    return {
      from: ws.toISOString(),
      to: endOfDay(addDays(ws, 6)).toISOString(),
      label: "هذا الأسبوع",
    };
  }
  if (key === "month") {
    return {
      from: startOfMonth(now).toISOString(),
      to: endOfMonth(now).toISOString(),
      label: "هذا الشهر",
    };
  }
  const last = subMonths(now, 1);
  return {
    from: startOfMonth(last).toISOString(),
    to: endOfMonth(last).toISOString(),
    label: "الشهر الماضي",
  };
}

function formatSeconds(s: number): string {
  if (!s) return "—";
  if (s < 60) return `${s}ث`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}س ${rem}د` : `${h} س`;
}

function PerformanceSegment({ restaurantId }: { restaurantId: string }) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const range = useMemo(() => rangeFor(periodKey), [periodKey]);
  const [selected, setSelected] = useState<TeamPerformanceRow | null>(null);

  const perfQuery = useQuery({
    queryKey: qk.teamPerformance(restaurantId, range.from, range.to),
    enabled: !!restaurantId,
    queryFn: () => getTeamPerformance(range.from, range.to),
    staleTime: 60_000,
  });

  const rows = useMemo<TeamPerformanceRow[]>(
    () =>
      Array.isArray(perfQuery.data?.rows) ? perfQuery.data!.rows : [],
    [perfQuery.data]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          messages: a.messages + r.messages_sent,
          conversations: a.conversations + r.conversations_handled,
          breaches: a.breaches + r.sla_breaches,
        }),
        { messages: 0, conversations: 0, breaches: 0 }
      ),
    [rows]
  );

  const periodKeys: PeriodKey[] = ["today", "week", "month", "last_month"];

  const hasAnyActivity =
    totals.messages > 0 || totals.conversations > 0 || totals.breaches > 0;

  return (
    <View className="flex-1">
      {/* Period selector — compact row, fixed height, no huge ovals. */}
      <View
        className="flex-row-reverse gap-1.5 px-3 pb-2"
        style={{ height: 36 }}
      >
        {periodKeys.map((k) => {
          const r = rangeFor(k);
          const active = k === periodKey;
          return (
            <Pressable
              key={k}
              onPress={() => setPeriodKey(k)}
              className={`flex-1 items-center justify-center rounded-md border ${
                active
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <Text
                className={`text-[12px] font-semibold ${
                  active ? "text-emerald-900" : "text-gray-700"
                }`}
                numberOfLines={1}
              >
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {perfQuery.isLoading ? (
        <View className="px-4 pt-3">
          <CardSkeleton rows={3} />
          <View className="mt-3">
            <ListSkeleton count={4} showAvatar />
          </View>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.team_member_id}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={perfQuery.isFetching}
              onRefresh={() => perfQuery.refetch()}
            />
          }
          ListEmptyComponent={
            perfQuery.isError ? (
              <ErrorState onRetry={() => perfQuery.refetch()} />
            ) : (
              <EmptyState
                icon="bar-chart-outline"
                title="لا توجد بيانات في هذه الفترة"
                description="جربي تغيير الفترة أو التحقق لاحقاً"
              />
            )
          }
          ListHeaderComponent={
            <TotalsHeader
              label={rangeFor(periodKey).label}
              totals={totals}
              isEmpty={!hasAnyActivity}
            />
          }
          renderItem={({ item }) => (
            <PerformanceRow row={item} onPress={() => setSelected(item)} />
          )}
        />
      )}

      <AgentDetailModal
        restaurantId={restaurantId}
        row={selected}
        range={range}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

function TotalsHeader({
  label,
  totals,
  isEmpty,
}: {
  label: string;
  totals: { messages: number; conversations: number; breaches: number };
  isEmpty: boolean;
}) {
  const tiles: Array<{
    key: string;
    label: string;
    value: number;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    bg: string;
  }> = [
    {
      key: "messages",
      label: "رسائل",
      value: totals.messages,
      icon: "chatbubbles",
      color: "#3730A3",
      bg: "#EEF2FF",
    },
    {
      key: "conversations",
      label: "محادثات",
      value: totals.conversations,
      icon: "people",
      color: "#047857",
      bg: "#ECFDF5",
    },
    {
      key: "breaches",
      label: "تجاوز SLA",
      value: totals.breaches,
      icon: "warning",
      color: totals.breaches > 0 ? "#B45309" : "#6B7280",
      bg: totals.breaches > 0 ? "#FFFBEB" : "#F3F4F6",
    },
  ];
  return (
    <View className="mb-3 rounded-lg border border-gray-200 bg-white p-4">
      <View className="flex-row-reverse items-center justify-between">
        <Text className="text-right text-sm font-bold text-gray-950">
          إجمالي {label}
        </Text>
        {isEmpty ? (
          <Text className="text-[11px] text-gray-500">لا يوجد نشاط بعد</Text>
        ) : null}
      </View>
      <View className="mt-3 flex-row-reverse gap-2">
        {tiles.map((t) => (
          <View
            key={t.key}
            className="flex-1 items-center rounded-lg py-3"
            style={{ backgroundColor: t.bg }}
          >
            <Ionicons name={t.icon} size={16} color={t.color} />
            <Text
              className="mt-1 text-lg font-bold"
              style={{ color: t.color }}
            >
              {t.value}
            </Text>
            <Text className="text-[11px] text-gray-600">{t.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PerformanceRow({
  row,
  onPress,
}: {
  row: TeamPerformanceRow;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 rounded-lg border border-gray-200 bg-white p-3"
    >
      <View className="flex-row-reverse items-center justify-between">
        <Text className="text-right text-base font-semibold text-gray-950">
          {row.full_name ?? "—"}
        </Text>
        <View className="flex-row-reverse items-center gap-2">
          {row.is_available ? (
            <View className="h-2 w-2 rounded-full bg-emerald-500" />
          ) : null}
          <Text className="text-xs text-gray-500">
            {row.role === "admin" ? "مدير" : "موظف"}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row-reverse flex-wrap gap-2">
        <StatPill label="رسائل" value={row.messages_sent.toString()} />
        <StatPill
          label="محادثات"
          value={row.conversations_handled.toString()}
        />
        <StatPill
          label="الرد المعتاد"
          value={formatSeconds(row.first_response_p50_sec)}
        />
        <StatPill
          label="أبطأ رد"
          value={formatSeconds(row.first_response_p90_sec)}
          tone={row.first_response_p90_sec > 600 ? "warn" : "neutral"}
        />
        <StatPill label="نشطة الآن" value={row.active_now.toString()} />
        {row.sla_breaches > 0 ? (
          <StatPill
            label="تجاوز"
            value={row.sla_breaches.toString()}
            tone="warn"
          />
        ) : null}
        {row.takeovers_from_bot > 0 ? (
          <StatPill
            label="استلام من البوت"
            value={row.takeovers_from_bot.toString()}
          />
        ) : null}
        {row.labels_applied > 0 ? (
          <StatPill label="تسميات" value={row.labels_applied.toString()} />
        ) : null}
        <StatPill
          label="ساعات"
          value={row.approx_hours_worked > 0 ? `~${row.approx_hours_worked}` : "—"}
        />
      </View>
    </Pressable>
  );
}

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn";
}) {
  const cls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : "border-gray-200 bg-gray-50";
  const valueCls = tone === "warn" ? "text-amber-900" : "text-gray-950";
  return (
    <View className={`rounded-md border px-2 py-1 ${cls}`}>
      <Text className={`text-right text-[11px] font-bold ${valueCls}`}>
        {value}
      </Text>
      <Text className="text-right text-[10px] text-gray-500">{label}</Text>
    </View>
  );
}

// ---- Agent detail (notes + goals + sparkline + heatmap) -------------------

function AgentDetailModal({
  restaurantId,
  row,
  range,
  onClose,
}: {
  restaurantId: string;
  row: TeamPerformanceRow | null;
  range: PeriodRange;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const visible = !!row;
  const tmId = row?.team_member_id ?? "";

  const detailQuery = useQuery({
    queryKey: qk.agentPerformanceDetail(tmId, range.from, range.to),
    enabled: visible && !!tmId,
    queryFn: () => getAgentPerformanceDetail(tmId, range.from, range.to),
  });
  const notesQuery = useQuery({
    queryKey: qk.teamMemberNotes(tmId),
    enabled: visible && !!tmId,
    queryFn: () => listTeamMemberNotes(tmId),
  });
  const goalsQuery = useQuery({
    queryKey: qk.teamMemberGoals(tmId),
    enabled: visible && !!tmId,
    queryFn: () => getTeamMemberGoals(tmId),
  });

  const [noteDraft, setNoteDraft] = useState("");
  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const text = noteDraft.trim();
      if (!text) throw new Error("لا يمكن حفظ ملاحظة فارغة");
      return addTeamMemberNote(tmId, text);
    },
    onSuccess: () => {
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: qk.teamMemberNotes(tmId) });
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر حفظ الملاحظة"),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deleteTeamMemberNote(tmId, noteId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.teamMemberNotes(tmId) }),
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر الحذف"),
  });

  // Goals editor state — seeded from query, persisted on blur.
  const [goalFrt, setGoalFrt] = useState<string>("");
  const [goalMpd, setGoalMpd] = useState<string>("");
  useMemo(() => {
    setGoalFrt(
      goalsQuery.data?.target_first_response_sec
        ? String(goalsQuery.data.target_first_response_sec)
        : ""
    );
    setGoalMpd(
      goalsQuery.data?.target_messages_per_day
        ? String(goalsQuery.data.target_messages_per_day)
        : ""
    );
  }, [goalsQuery.data]);

  const saveGoalsMutation = useMutation({
    mutationFn: async () => {
      const frt = goalFrt.trim() === "" ? null : Number(goalFrt);
      const mpd = goalMpd.trim() === "" ? null : Number(goalMpd);
      return setTeamMemberGoals(tmId, {
        target_first_response_sec: frt,
        target_messages_per_day: mpd,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.teamMemberGoals(tmId) }),
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  if (!row) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="max-h-[90%] rounded-t-2xl bg-white"
        >
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <Text className="text-right text-lg font-bold text-gray-950">
              {row.full_name ?? "موظف"}
            </Text>
            <Text className="mt-0.5 text-right text-xs text-gray-500">
              {range.label} · {row.role === "admin" ? "مدير" : "موظف"}
            </Text>

            <View className="mt-3 rounded-md bg-gray-50 px-3 py-2">
              <Text className="text-right text-[11px] leading-4 text-gray-600">
                &quot;الرد المعتاد&quot; = الوقت الذي يستغرقه الرد في معظم
                المحادثات. &quot;أبطأ رد&quot; = في أسوأ ١٠٪ من الحالات.
              </Text>
            </View>

            <View className="mt-4 flex-row-reverse flex-wrap gap-2">
              <StatPill
                label="الرد الأول المعتاد"
                value={formatSeconds(row.first_response_p50_sec)}
              />
              <StatPill
                label="أبطأ رد أول"
                value={formatSeconds(row.first_response_p90_sec)}
                tone={row.first_response_p90_sec > 600 ? "warn" : "neutral"}
              />
              <StatPill
                label="سرعة الرد"
                value={formatSeconds(row.reply_latency_p50_sec)}
              />
              <StatPill
                label="رسائل"
                value={row.messages_sent.toString()}
              />
              <StatPill
                label="محادثات"
                value={row.conversations_handled.toString()}
              />
              <StatPill
                label="ساعات"
                value={
                  row.approx_hours_worked > 0
                    ? `~${row.approx_hours_worked}`
                    : "—"
                }
              />
              <StatPill
                label="استلام من بوت"
                value={row.takeovers_from_bot.toString()}
              />
              <StatPill
                label="إعادة تعيين (تلقّى)"
                value={row.reassigns_received.toString()}
              />
              <StatPill
                label="إعادة تعيين (أعطى)"
                value={row.reassigns_given.toString()}
              />
              <StatPill
                label="تجاوز SLA"
                value={row.sla_breaches.toString()}
                tone={row.sla_breaches > 0 ? "warn" : "neutral"}
              />
              <StatPill
                label="تسميات"
                value={row.labels_applied.toString()}
              />
            </View>

            {/* Sparkline */}
            <View className="mt-6">
              <Text className="text-right text-sm font-bold text-gray-950">
                النشاط اليومي
              </Text>
              {detailQuery.isLoading ? (
                <View className="mt-2">
                  <ActivityIndicator />
                </View>
              ) : (
                <Sparkline daily={detailQuery.data?.daily ?? []} />
              )}
            </View>

            {/* Heatmap */}
            <View className="mt-6">
              <Text className="text-right text-sm font-bold text-gray-950">
                ساعات النشاط
              </Text>
              {detailQuery.isLoading ? (
                <View className="mt-2">
                  <ActivityIndicator />
                </View>
              ) : (
                <Heatmap cells={detailQuery.data?.heatmap ?? []} />
              )}
            </View>

            {/* Goals */}
            <View className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <Text className="text-right text-sm font-bold text-gray-950">
                الأهداف
              </Text>
              <Text className="mt-1 text-right text-[11px] text-gray-500">
                اتركي الحقل فارغًا لإلغاء الهدف.
              </Text>
              <View className="mt-3 flex-row-reverse gap-2">
                <View className="flex-1">
                  <Text className="text-right text-[11px] text-gray-500">
                    رد أولي (ثانية)
                  </Text>
                  <TextInput
                    value={goalFrt}
                    onChangeText={setGoalFrt}
                    keyboardType="number-pad"
                    placeholder="مثال: 180"
                    textAlign="right"
                    className="mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-right text-sm"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-right text-[11px] text-gray-500">
                    رسائل/يوم
                  </Text>
                  <TextInput
                    value={goalMpd}
                    onChangeText={setGoalMpd}
                    keyboardType="number-pad"
                    placeholder="مثال: 50"
                    textAlign="right"
                    className="mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-right text-sm"
                  />
                </View>
              </View>
              <Pressable
                onPress={() => saveGoalsMutation.mutate()}
                disabled={saveGoalsMutation.isPending}
                className="mt-3 items-center rounded-md bg-[#00A884] py-2"
              >
                {saveGoalsMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-semibold text-white">حفظ الأهداف</Text>
                )}
              </Pressable>
            </View>

            {/* Notes */}
            <View className="mt-6">
              <Text className="text-right text-sm font-bold text-gray-950">
                ملاحظات المدير
              </Text>
              <View className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="اكتبي ملاحظة خاصة..."
                  multiline
                  textAlign="right"
                  maxLength={4000}
                  className="min-h-[60px] rounded-md border border-gray-200 bg-white px-3 py-2 text-right text-sm"
                />
                <Pressable
                  onPress={() => addNoteMutation.mutate()}
                  disabled={
                    addNoteMutation.isPending || noteDraft.trim().length === 0
                  }
                  className={`mt-2 items-center rounded-md py-2 ${
                    noteDraft.trim().length === 0
                      ? "bg-[#B6E5D6]"
                      : "bg-[#00A884]"
                  }`}
                >
                  {addNoteMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="font-semibold text-white">
                      إضافة ملاحظة
                    </Text>
                  )}
                </Pressable>
              </View>

              <View className="mt-3">
                {notesQuery.isLoading ? (
                  <ActivityIndicator />
                ) : (notesQuery.data ?? []).length === 0 ? (
                  <Text className="text-right text-xs text-gray-500">
                    لا توجد ملاحظات بعد.
                  </Text>
                ) : (
                  (notesQuery.data ?? []).map((n) => (
                    <View
                      key={n.id}
                      className="mb-2 rounded-lg border border-gray-100 bg-white p-3"
                    >
                      <Text className="text-right text-sm text-gray-950">
                        {n.body}
                      </Text>
                      <View className="mt-2 flex-row-reverse items-center justify-between">
                        <Text className="text-[10px] text-gray-400">
                          {format(new Date(n.created_at), "yyyy-MM-dd HH:mm")}
                        </Text>
                        <Pressable
                          onPress={() =>
                            Alert.alert(
                              "حذف الملاحظة",
                              "سيتم الحذف نهائياً",
                              [
                                { text: "إلغاء", style: "cancel" },
                                {
                                  text: "حذف",
                                  style: "destructive",
                                  onPress: () =>
                                    deleteNoteMutation.mutate(n.id),
                                },
                              ]
                            )
                          }
                        >
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color="#EF4444"
                          />
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>

            <Pressable
              onPress={onClose}
              className="mt-6 items-center rounded-lg border border-gray-200 py-3"
            >
              <Text className="text-sm text-gray-700">إغلاق</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---- Sparkline + Heatmap (no external chart lib; plain Views) -------------

function Sparkline({ daily }: { daily: AgentPerformanceDetail["daily"] }) {
  if (daily.length === 0) {
    return (
      <Text className="mt-2 text-right text-xs text-gray-500">
        لا يوجد نشاط.
      </Text>
    );
  }
  const max = Math.max(1, ...daily.map((d) => d.messages));
  return (
    <View className="mt-2 rounded-lg border border-gray-100 bg-white p-3">
      <View className="flex-row items-end" style={{ height: 80, gap: 3 }}>
        {daily.map((d) => {
          const h = Math.max(2, (d.messages / max) * 72);
          return (
            <View key={d.day} style={{ flex: 1 }}>
              <View
                style={{ height: h, borderRadius: 2 }}
                className="bg-emerald-400"
              />
            </View>
          );
        })}
      </View>
      <View className="mt-1 flex-row-reverse items-center justify-between">
        <Text className="text-[10px] text-gray-500">
          {format(new Date(daily[0].day), "MM-dd")}
        </Text>
        <Text className="text-[10px] text-gray-500">
          {format(new Date(daily[daily.length - 1].day), "MM-dd")}
        </Text>
      </View>
    </View>
  );
}

function Heatmap({
  cells,
}: {
  cells: AgentPerformanceDetail["heatmap"];
}) {
  // Matrix[weekday][hour] — weekday 0=Sun .. 6=Sat.
  const matrix = useMemo(() => {
    const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    let max = 0;
    for (const c of cells) {
      m[c.weekday][c.hour] = c.messages;
      if (c.messages > max) max = c.messages;
    }
    return { m, max };
  }, [cells]);

  if (matrix.max === 0) {
    return (
      <Text className="mt-2 text-right text-xs text-gray-500">
        لا يوجد نشاط.
      </Text>
    );
  }

  const dayNames = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  return (
    <View className="mt-2 rounded-lg border border-gray-100 bg-white p-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {matrix.m.map((row, weekday) => (
            <View key={weekday} className="flex-row items-center">
              <Text
                className="w-12 text-right text-[10px] text-gray-500"
                numberOfLines={1}
              >
                {dayNames[weekday]}
              </Text>
              <View className="flex-row">
                {row.map((n, hour) => {
                  const intensity = matrix.max > 0 ? n / matrix.max : 0;
                  const opacity = intensity === 0 ? 0.04 : 0.1 + intensity * 0.9;
                  return (
                    <View
                      key={hour}
                      style={{
                        width: 10,
                        height: 14,
                        marginRight: 1,
                        marginVertical: 1,
                        backgroundColor: `rgba(0,168,132,${opacity})`,
                        borderRadius: 2,
                      }}
                    />
                  );
                })}
              </View>
            </View>
          ))}
          <View className="mt-1 flex-row justify-between" style={{ paddingRight: 48 }}>
            <Text className="text-[9px] text-gray-400">0</Text>
            <Text className="text-[9px] text-gray-400">12</Text>
            <Text className="text-[9px] text-gray-400">23</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
