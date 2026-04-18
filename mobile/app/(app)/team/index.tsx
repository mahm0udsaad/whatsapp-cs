import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import {
  forceOffline,
  getTeamRoster,
  getWeeklyShifts,
  type TeamMemberRosterRow,
  type WeeklyShiftRow,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import {
  CardSkeleton,
  ListSkeleton,
  ManagerCard,
  ManagerMetric,
} from "../../../components/manager-ui";

type Segment = "people" | "schedule";

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
      <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
        <View className="flex-row-reverse gap-2 px-3 pt-3 pb-2">
          <CardSkeleton rows={1} className="flex-1" />
          <CardSkeleton rows={1} className="flex-1" />
        </View>
        <ListSkeleton count={5} showAvatar />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
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
      </View>

      {segment === "people" ? (
        <PeopleSegment
          query={rosterQuery}
          onSelectMember={setSelectedMember}
        />
      ) : (
        <ScheduleSegment
          query={scheduleQuery}
          weekStart={weekStart}
          onChangeWeekStart={setWeekStart}
        />
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
            className="rounded-t-lg bg-white p-4 pb-8"
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
    </SafeAreaView>
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
    console.warn(
      "[team] /api/mobile/team/roster returned non-array shape:",
      typeof rawData,
      typeof rawData === "string" ? (rawData as string).slice(0, 80) : rawData
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
        <View className="items-center py-20">
          <Text className="text-gray-500">لا يوجد أعضاء في الفريق</Text>
        </View>
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
            key={idx}
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
            <View className="items-center py-16">
              <Text className="text-gray-500">لا توجد مناوبات في هذا اليوم</Text>
            </View>
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
