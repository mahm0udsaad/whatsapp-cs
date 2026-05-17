import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
      <View style={styles.screen}>
        <View style={styles.segmentRow}>
          <CardSkeleton rows={1} className="flex-1" />
          <CardSkeleton rows={1} className="flex-1" />
        </View>
        <ListSkeleton count={5} showAvatar />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.segmentRow}>
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
          style={styles.modalBackdrop}
          onPress={() => setSelectedMember(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={styles.sheet}
          >
            <Text style={styles.sheetTitle}>
              {selectedMember?.full_name ?? "موظف"}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {selectedMember?.role === "admin" ? "مدير" : "موظف"} ·{" "}
              {selectedMember?.is_available ? "متاح" : "غير متاح"}
            </Text>
            <View style={styles.sheetActions}>
              {selectedMember?.is_available ? (
                <Pressable
                  onPress={() =>
                    selectedMember
                      ? forceOfflineMutation.mutate(selectedMember.id)
                      : null
                  }
                  disabled={forceOfflineMutation.isPending}
                  style={styles.sheetDangerAction}
                >
                  <Text style={styles.sheetDangerActionText}>
                    إيقاف الاستلام الآن
                  </Text>
                  <Ionicons name="moon-outline" size={20} color="#991B1B" />
                </Pressable>
              ) : (
                <View style={styles.sheetInfoBox}>
                  <Text style={styles.sheetInfoText}>
                    الموظف غير متاح حالياً
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => setSelectedMember(null)}
                style={styles.sheetCloseButton}
              >
                <Text style={styles.sheetCloseButtonText}>إغلاق</Text>
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
      style={[
        styles.segmentButton,
        active ? styles.segmentButtonActive : styles.segmentButtonIdle,
      ]}
    >
      <Text style={[styles.segmentButtonText, active ? styles.segmentButtonTextActive : styles.segmentButtonTextIdle]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: managerColors.bg,
  },
  segmentRow: {
    flexDirection: "row-reverse",
    columnGap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
  },
  segmentButtonActive: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  segmentButtonIdle: {
    borderColor: "#E2E7FA",
    backgroundColor: "#F8FAFF",
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  segmentButtonTextActive: {
    color: "#16245C",
  },
  segmentButtonTextIdle: {
    color: "#5E6A99",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: managerColors.surface,
    padding: 16,
    paddingBottom: 32,
  },
  sheetTitle: {
    textAlign: "right",
    fontSize: 18,
    fontWeight: "700",
    color: "#16245C",
  },
  sheetSubtitle: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    color: "#7A88B8",
  },
  sheetActions: {
    marginTop: 16,
  },
  sheetDangerAction: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    padding: 12,
  },
  sheetDangerActionText: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "#7F1D1D",
  },
  sheetInfoBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#F8FAFF",
    padding: 12,
  },
  sheetInfoText: {
    textAlign: "right",
    fontSize: 14,
    color: "#5E6A99",
  },
  sheetCloseButton: {
    marginTop: 12,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    paddingVertical: 12,
  },
  sheetCloseButtonText: {
    fontSize: 14,
    color: "#5E6A99",
  },
});

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
      <View style={teamStyles.loadingShell}>
        <View style={teamStyles.loadingHeader}>
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
      contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
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
            description="أضف أعضاء من لوحة الإدارة على الويب لتظهر بياناتهم هنا."
          />
        )
      }
      ListHeaderComponent={
        rows.length > 0 ? (
          <View style={teamStyles.headerStack}>
            <View style={teamStyles.summaryCard}>
              <View style={teamStyles.summaryHero}>
                <View style={teamStyles.summaryHeroCopy}>
                  <Text style={teamStyles.summaryEyebrow}>لوحة الفريق</Text>
                  <Text style={teamStyles.summaryTitle}>
                    حالة الفريق الآن
                  </Text>
                  <Text style={teamStyles.summaryDescription}>
                    متابعة سريعة للتوفر والتنبيهات قبل الدخول في تفاصيل كل عضو.
                  </Text>
                </View>
                <View style={teamStyles.summaryHeroBadge}>
                  <Ionicons name="people" size={18} color="#FFFFFF" />
                  <Text style={teamStyles.summaryHeroBadgeValue}>
                    {rows.length}
                  </Text>
                </View>
              </View>

              <View style={teamStyles.metricGrid}>
                <TeamPulseMetric
                  label="متاح الآن"
                  value={summary.available}
                  tone="blue"
                  icon="flash"
                />
                <TeamPulseMetric
                  label="في المناوبة"
                  value={summary.onShift}
                  tone="gold"
                  icon="time"
                />
                <TeamPulseMetric
                  label="ضغط مرتفع"
                  value={summary.overloaded}
                  tone={summary.overloaded > 0 ? "rose" : "slate"}
                  icon="warning"
                />
                <TeamPulseMetric
                  label="تنبيهات ناقصة"
                  value={summary.missingPush}
                  tone={summary.missingPush > 0 ? "rose" : "slate"}
                  icon="notifications-off"
                />
              </View>
            </View>

            <View style={teamStyles.sectionHeadingRow}>
              <Text style={teamStyles.sectionHeading}>
                أعضاء الفريق
              </Text>
              <Text style={teamStyles.sectionCaption}>
                {rows.length} عضو
              </Text>
            </View>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onSelectMember(item)}
          style={teamStyles.memberRow}
        >
          <Ionicons name="chevron-back" size={18} color="#A0ABC8" />
          <View style={teamStyles.memberLeading}>
            {!item.has_push_device ? (
              <View style={teamStyles.memberAlertPill}>
                <Ionicons
                  name="notifications-off-outline"
                  size={14}
                  color="#B45309"
                />
              </View>
            ) : null}
            <View style={teamStyles.memberContent}>
              <View style={teamStyles.memberTopRow}>
                <Text style={teamStyles.memberName}>
                  {item.full_name ?? "—"}
                </Text>
                <View
                  style={[
                    teamStyles.availabilityPill,
                    item.is_available
                      ? teamStyles.availabilityPillLive
                      : teamStyles.availabilityPillIdle,
                  ]}
                >
                  <View
                    style={[
                      teamStyles.availabilityDot,
                      item.is_available
                        ? teamStyles.availabilityDotLive
                        : teamStyles.availabilityDotIdle,
                    ]}
                  />
                  <Text
                    style={[
                      teamStyles.availabilityText,
                      item.is_available
                        ? teamStyles.availabilityTextLive
                        : teamStyles.availabilityTextIdle,
                    ]}
                  >
                    {item.is_available ? "متاح" : "غير متاح"}
                  </Text>
                </View>
              </View>
              <Text style={teamStyles.memberMeta}>
                {item.role === "admin" ? "مدير" : "موظف"}
                {item.on_shift_now ? " · في المناوبة" : " · خارج المناوبة"}
              </Text>
              <View style={teamStyles.memberStatsRow}>
                <View style={teamStyles.memberStatChip}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color="#273B9A" />
                  <Text style={teamStyles.memberStatText}>
                    {item.active_conversations} محادثة
                  </Text>
                </View>
                <View style={teamStyles.memberStatChip}>
                  <Ionicons
                    name={item.has_push_device ? "phone-portrait-outline" : "warning-outline"}
                    size={14}
                    color={item.has_push_device ? "#5E6A99" : "#B45309"}
                  />
                  <Text
                    style={[
                      teamStyles.memberStatText,
                      !item.has_push_device && teamStyles.memberStatTextWarning,
                    ]}
                  >
                    {item.has_push_device ? "التنبيهات مفعلة" : "تنبيهات ناقصة"}
                  </Text>
                </View>
              </View>
            </View>
            <View style={teamStyles.avatarWrap}>
              <View style={teamStyles.avatar}>
                <Text style={teamStyles.avatarText}>
                  {initialsOf(item.full_name)}
                </Text>
              </View>
              <View
                style={[
                  teamStyles.statusDot,
                  item.is_available && item.on_shift_now
                    ? teamStyles.statusDotLive
                    : item.is_available
                    ? teamStyles.statusDotAvailable
                    : teamStyles.statusDotOffline,
                ]}
              />
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

function TeamPulseMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "gold" | "rose" | "slate";
}) {
  const toneStyle =
    tone === "blue"
      ? {
          card: teamStyles.metricCardBlue,
          iconWrap: teamStyles.metricIconWrapBlue,
          value: teamStyles.metricValueBlue,
        }
      : tone === "gold"
      ? {
          card: teamStyles.metricCardGold,
          iconWrap: teamStyles.metricIconWrapGold,
          value: teamStyles.metricValueGold,
        }
      : tone === "rose"
      ? {
          card: teamStyles.metricCardRose,
          iconWrap: teamStyles.metricIconWrapRose,
          value: teamStyles.metricValueRose,
        }
      : {
          card: teamStyles.metricCardSlate,
          iconWrap: teamStyles.metricIconWrapSlate,
          value: teamStyles.metricValueSlate,
        };

  return (
    <View style={[teamStyles.metricCard, toneStyle.card]}>
      <View style={teamStyles.metricHeader}>
        <View style={[teamStyles.metricIconWrap, toneStyle.iconWrap]}>
          <Ionicons
            name={icon}
            size={15}
            color={tone === "gold" ? "#A16207" : tone === "rose" ? "#BE123C" : tone === "slate" ? "#64748B" : "#273B9A"}
          />
        </View>
        <Text style={[teamStyles.metricValue, toneStyle.value]}>{value}</Text>
      </View>
      <Text style={teamStyles.metricLabel}>{label}</Text>
    </View>
  );
}

const teamStyles = StyleSheet.create({
  loadingShell: {
    flex: 1,
  },
  loadingHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerStack: {
    marginBottom: 12,
    rowGap: 12,
  },
  summaryCard: {
    overflow: "hidden",
    borderRadius: 30,
    backgroundColor: "#10288F",
    padding: 18,
    shadowColor: "#273B9A",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  summaryHero: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 12,
  },
  summaryHeroCopy: {
    flex: 1,
  },
  summaryEyebrow: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.68)",
  },
  summaryTitle: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 21,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  summaryDescription: {
    marginTop: 6,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 22,
    color: "rgba(255,255,255,0.78)",
  },
  summaryHeroBadge: {
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    rowGap: 4,
  },
  summaryHeroBadgeValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  metricGrid: {
    marginTop: 18,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 10,
  },
  metricCard: {
    minWidth: "47%",
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metricCardBlue: {
    backgroundColor: "#F5F7FF",
  },
  metricCardGold: {
    backgroundColor: "#FFF7D6",
  },
  metricCardRose: {
    backgroundColor: "#FFF1F2",
  },
  metricCardSlate: {
    backgroundColor: "#F8FAFC",
  },
  metricHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricIconWrap: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  metricIconWrapBlue: {
    backgroundColor: "#E3EAFF",
  },
  metricIconWrapGold: {
    backgroundColor: "#FDE68A",
  },
  metricIconWrapRose: {
    backgroundColor: "#FFE4E6",
  },
  metricIconWrapSlate: {
    backgroundColor: "#E2E8F0",
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "700",
  },
  metricValueBlue: {
    color: "#16245C",
  },
  metricValueGold: {
    color: "#8A5E00",
  },
  metricValueRose: {
    color: "#9F1239",
  },
  metricValueSlate: {
    color: "#475569",
  },
  metricLabel: {
    marginTop: 10,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: "#5E6A99",
  },
  sectionHeadingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  sectionHeading: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "700",
    color: "#16245C",
  },
  sectionCaption: {
    fontSize: 12,
    color: "#7A88B8",
  },
  summaryRow: {
    marginTop: 12,
    flexDirection: "row-reverse",
    columnGap: 8,
  },
  summaryRowSecond: {
    marginTop: 8,
    flexDirection: "row-reverse",
    columnGap: 8,
  },
  memberRow: {
    marginBottom: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 12,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: "#273B9A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  memberLeading: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 12,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#F4F7FF",
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#273B9A",
  },
  statusDot: {
    position: "absolute",
    left: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  statusDotLive: {
    backgroundColor: "#22C55E",
  },
  statusDotAvailable: {
    backgroundColor: "#86EFAC",
  },
  statusDotOffline: {
    backgroundColor: "#CBD5E1",
  },
  memberContent: {
    flex: 1,
  },
  memberTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 10,
  },
  memberName: {
    textAlign: "right",
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#16245C",
  },
  memberMeta: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 20,
    color: "#7A88B8",
  },
  availabilityPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    columnGap: 6,
  },
  availabilityPillLive: {
    backgroundColor: "#E8FFF1",
  },
  availabilityPillIdle: {
    backgroundColor: "#F1F5F9",
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  availabilityDotLive: {
    backgroundColor: "#22C55E",
  },
  availabilityDotIdle: {
    backgroundColor: "#94A3B8",
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: "700",
  },
  availabilityTextLive: {
    color: "#15803D",
  },
  availabilityTextIdle: {
    color: "#64748B",
  },
  memberStatsRow: {
    marginTop: 10,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 8,
  },
  memberStatChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
    paddingVertical: 7,
    columnGap: 6,
  },
  memberStatText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5E6A99",
  },
  memberStatTextWarning: {
    color: "#B45309",
  },
  memberAlertPill: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
  },
  performanceRow: {
    marginBottom: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    padding: 14,
    shadowColor: "#273B9A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});

const scheduleStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  weekHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
  },
  weekNavButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#F8FAFF",
  },
  weekHeaderText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  dayChipsRow: {
    flexDirection: "row-reverse",
    columnGap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  dayChip: {
    flex: 1,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
  },
  dayChipActive: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  dayChipIdle: {
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
  },
  dayChipWeekday: {
    fontSize: 11,
    color: "#7A88B8",
  },
  dayChipDate: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "700",
  },
  dayChipDateActive: {
    color: "#16245C",
  },
  dayChipDateIdle: {
    color: "#445179",
  },
  loadingShell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingListWrap: {
    marginTop: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyStateText: {
    color: "#7A88B8",
  },
  shiftCard: {
    marginBottom: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    padding: 14,
    shadowColor: "#273B9A",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  shiftName: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "700",
    color: "#16245C",
  },
  shiftTime: {
    marginTop: 6,
    textAlign: "right",
    fontSize: 13,
    color: "#5E6A99",
  },
  shiftNote: {
    marginTop: 6,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 20,
    color: "#7A88B8",
  },
  webButton: {
    marginTop: 12,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
  },
  webButtonText: {
    fontSize: 14,
    color: "#5E6A99",
  },
});

const performanceStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  periodRow: {
    flexDirection: "row-reverse",
    columnGap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    height: 40,
  },
  periodButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  periodButtonActive: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  periodButtonIdle: {
    borderColor: "#E2E7FA",
    backgroundColor: "#F8FAFF",
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  periodButtonTextActive: {
    color: "#16245C",
  },
  periodButtonTextIdle: {
    color: "#5E6A99",
  },
  loadingShell: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingListWrap: {
    marginTop: 12,
  },
  totalsCard: {
    marginBottom: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  totalsHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalsTitle: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#16245C",
  },
  totalsEmptyHint: {
    fontSize: 11,
    color: "#7A88B8",
  },
  totalsGrid: {
    marginTop: 12,
    flexDirection: "row-reverse",
    columnGap: 8,
  },
  totalsTile: {
    flex: 1,
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 12,
  },
  totalsTileValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
  },
  totalsTileLabel: {
    fontSize: 11,
    color: "#5E6A99",
  },
  rowHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowName: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "700",
    color: "#16245C",
  },
  rowMeta: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  rowAvailabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  rowRole: {
    fontSize: 12,
    color: "#7A88B8",
  },
  rowStats: {
    marginTop: 12,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 8,
  },
  statPill: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statPillNeutral: {
    borderColor: "#E7EBFB",
    backgroundColor: "#F8FAFF",
  },
  statPillWarn: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },
  statPillValue: {
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
  },
  statPillValueNeutral: {
    color: "#16245C",
  },
  statPillValueWarn: {
    color: "#92400E",
  },
  statPillLabel: {
    textAlign: "right",
    fontSize: 10,
    color: "#7A88B8",
  },
});

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
    <View style={scheduleStyles.screen}>
      {/* Week header */}
      <View style={scheduleStyles.weekHeader}>
        <Pressable onPress={() => navigateWeek(7)} style={scheduleStyles.weekNavButton}>
          <Ionicons name="chevron-forward" size={22} color="#5E6A99" />
        </Pressable>
        <Text style={scheduleStyles.weekHeaderText}>
          {format(weekStartDate, "d MMM")} - {format(addDays(weekStartDate, 6), "d MMM")}
        </Text>
        <Pressable onPress={() => navigateWeek(-7)} style={scheduleStyles.weekNavButton}>
          <Ionicons name="chevron-back" size={22} color="#5E6A99" />
        </Pressable>
      </View>

      {/* Day chips */}
      <View style={scheduleStyles.dayChipsRow}>
        {days.map((d, idx) => (
          <Pressable
            key={d.toISOString()}
            onPress={() => setSelectedDay(idx)}
            style={[
              scheduleStyles.dayChip,
              idx === selectedDay
                ? scheduleStyles.dayChipActive
                : scheduleStyles.dayChipIdle,
            ]}
          >
            <Text style={scheduleStyles.dayChipWeekday}>{format(d, "EEE")}</Text>
            <Text
              style={[
                scheduleStyles.dayChipDate,
                idx === selectedDay
                  ? scheduleStyles.dayChipDateActive
                  : scheduleStyles.dayChipDateIdle,
              ]}
            >
              {format(d, "d")}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <View style={scheduleStyles.loadingShell}>
          <CardSkeleton rows={1} />
          <View style={scheduleStyles.loadingListWrap}>
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
              <View style={scheduleStyles.emptyState}>
                <Text style={scheduleStyles.emptyStateText}>
                  لا توجد مناوبات في هذا اليوم
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={scheduleStyles.shiftCard}>
              <Text style={scheduleStyles.shiftName}>
                {item.team_member_name ?? "—"}
              </Text>
              <Text style={scheduleStyles.shiftTime}>
                {format(new Date(item.starts_at), "HH:mm")} —{" "}
                {format(new Date(item.ends_at), "HH:mm")}
              </Text>
              {item.note ? (
                <Text style={scheduleStyles.shiftNote}>
                  {item.note}
                </Text>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            // Hidden on iOS — see comment in profile.tsx for the rationale
            // (App Store guideline 4.2 / 4.3: avoid signaling that core
            // functionality lives on a website).
            Platform.OS !== "ios" ? (
              <Pressable
                onPress={() => {
                  const base = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
                  if (base) Linking.openURL(`${base}/dashboard/shifts`);
                }}
                style={scheduleStyles.webButton}
              >
                <Text style={scheduleStyles.webButtonText}>تعديل من الويب</Text>
              </Pressable>
            ) : null
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
    <View style={performanceStyles.screen}>
      {/* Period selector — compact row, fixed height, no huge ovals. */}
      <View
        style={performanceStyles.periodRow}
      >
        {periodKeys.map((k) => {
          const r = rangeFor(k);
          const active = k === periodKey;
          return (
            <Pressable
              key={k}
              onPress={() => setPeriodKey(k)}
              style={[
                performanceStyles.periodButton,
                active
                  ? performanceStyles.periodButtonActive
                  : performanceStyles.periodButtonIdle,
              ]}
            >
              <Text
                style={[
                  performanceStyles.periodButtonText,
                  active
                    ? performanceStyles.periodButtonTextActive
                    : performanceStyles.periodButtonTextIdle,
                ]}
                numberOfLines={1}
              >
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {perfQuery.isLoading ? (
        <View style={performanceStyles.loadingShell}>
          <CardSkeleton rows={3} />
          <View style={performanceStyles.loadingListWrap}>
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
                description="جرّب تغيير الفترة أو التحقق لاحقاً"
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
    <View style={performanceStyles.totalsCard}>
      <View style={performanceStyles.totalsHeader}>
        <Text style={performanceStyles.totalsTitle}>
          إجمالي {label}
        </Text>
        {isEmpty ? (
          <Text style={performanceStyles.totalsEmptyHint}>لا يوجد نشاط بعد</Text>
        ) : null}
      </View>
      <View style={performanceStyles.totalsGrid}>
        {tiles.map((t) => (
          <View
            key={t.key}
            style={[performanceStyles.totalsTile, { backgroundColor: t.bg }]}
          >
            <Ionicons name={t.icon} size={16} color={t.color} />
            <Text
              style={[performanceStyles.totalsTileValue, { color: t.color }]}
            >
              {t.value}
            </Text>
            <Text style={performanceStyles.totalsTileLabel}>{t.label}</Text>
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
      style={teamStyles.performanceRow}
    >
      <View style={performanceStyles.rowHeader}>
        <Text style={performanceStyles.rowName}>
          {row.full_name ?? "—"}
        </Text>
        <View style={performanceStyles.rowMeta}>
          {row.is_available ? (
            <View style={performanceStyles.rowAvailabilityDot} />
          ) : null}
          <Text style={performanceStyles.rowRole}>
            {row.role === "admin" ? "مدير" : "موظف"}
          </Text>
        </View>
      </View>

      <View style={performanceStyles.rowStats}>
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
      : "border-[#E7EBFB] bg-[#F8FAFF]";
  const valueCls = tone === "warn" ? "text-amber-900" : "text-[#16245C]";
  return (
    <View
      style={[
        performanceStyles.statPill,
        tone === "warn"
          ? performanceStyles.statPillWarn
          : performanceStyles.statPillNeutral,
      ]}
    >
      <Text
        style={[
          performanceStyles.statPillValue,
          tone === "warn"
            ? performanceStyles.statPillValueWarn
            : performanceStyles.statPillValueNeutral,
        ]}
      >
        {value}
      </Text>
      <Text style={performanceStyles.statPillLabel}>{label}</Text>
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
          className="max-h-[90%] rounded-t-[30px] bg-white"
        >
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <Text className="text-right text-[22px] font-bold text-[#16245C]">
              {row.full_name ?? "موظف"}
            </Text>
            <Text className="mt-1 text-right text-sm text-[#7A88B8]">
              {range.label} · {row.role === "admin" ? "مدير" : "موظف"}
            </Text>

            <View className="mt-4 rounded-[18px] bg-[#F7F9FF] px-3 py-3">
              <Text className="text-right text-[11px] leading-5 text-[#5E6A99]">
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
              <Text className="text-right text-sm font-bold text-[#16245C]">
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
              <Text className="text-right text-sm font-bold text-[#16245C]">
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
            <View className="mt-6 rounded-[22px] border border-[#E7EBFB] bg-[#F8FAFF] p-3.5">
              <Text className="text-right text-sm font-bold text-[#16245C]">
                الأهداف
              </Text>
              <Text className="mt-1 text-right text-[11px] text-[#7A88B8]">
                اترك الحقل فارغًا لإلغاء الهدف.
              </Text>
              <View className="mt-3 flex-row-reverse gap-2">
                <View className="flex-1">
                  <Text className="text-right text-[11px] text-[#7A88B8]">
                    رد أولي (ثانية)
                  </Text>
                  <TextInput
                    value={goalFrt}
                    onChangeText={setGoalFrt}
                    keyboardType="number-pad"
                    placeholder="مثال: 180"
                    textAlign="right"
                    className="mt-1 rounded-[16px] border border-[#E2E7FA] bg-white px-3 py-2.5 text-right text-sm text-[#16245C]"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-right text-[11px] text-[#7A88B8]">
                    رسائل/يوم
                  </Text>
                  <TextInput
                    value={goalMpd}
                    onChangeText={setGoalMpd}
                    keyboardType="number-pad"
                    placeholder="مثال: 50"
                    textAlign="right"
                    className="mt-1 rounded-[16px] border border-[#E2E7FA] bg-white px-3 py-2.5 text-right text-sm text-[#16245C]"
                  />
                </View>
              </View>
              <Pressable
                onPress={() => saveGoalsMutation.mutate()}
                disabled={saveGoalsMutation.isPending}
                className="mt-3 items-center rounded-[16px] py-3"
                style={{ backgroundColor: managerColors.brand }}
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
              <Text className="text-right text-sm font-bold text-[#16245C]">
                ملاحظات المدير
              </Text>
              <View className="mt-2 rounded-[22px] border border-[#E7EBFB] bg-[#F8FAFF] p-3.5">
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="اكتب ملاحظة خاصة..."
                  multiline
                  textAlign="right"
                  maxLength={4000}
                  className="min-h-[72px] rounded-[16px] border border-[#E2E7FA] bg-white px-3 py-2.5 text-right text-sm text-[#16245C]"
                />
                <Pressable
                  onPress={() => addNoteMutation.mutate()}
                  disabled={
                    addNoteMutation.isPending || noteDraft.trim().length === 0
                  }
                  className={`mt-3 items-center rounded-[16px] py-3 ${
                    noteDraft.trim().length === 0
                      ? "bg-[#B6E5D6]"
                      : "bg-[#273B9A]"
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
                  <Text className="text-right text-xs text-[#7A88B8]">
                    لا توجد ملاحظات بعد.
                  </Text>
                ) : (
                  (notesQuery.data ?? []).map((n) => (
                    <View
                      key={n.id}
                      className="mb-2 rounded-[18px] border border-[#EEF2FF] bg-white p-3"
                    >
                      <Text className="text-right text-sm leading-6 text-[#16245C]">
                        {n.body}
                      </Text>
                      <View className="mt-2 flex-row-reverse items-center justify-between">
                        <Text className="text-[10px] text-[#98A2B3]">
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
              className="mt-6 items-center rounded-[18px] border border-[#E2E7FA] py-3"
            >
              <Text className="text-sm text-[#5E6A99]">إغلاق</Text>
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
      <Text className="mt-2 text-right text-xs text-[#7A88B8]">
        لا يوجد نشاط.
      </Text>
    );
  }
  const max = Math.max(1, ...daily.map((d) => d.messages));
  return (
    <View className="mt-2 rounded-[18px] border border-[#E7EBFB] bg-white p-3">
      <View className="flex-row items-end" style={{ height: 80, gap: 3 }}>
        {daily.map((d) => {
          const h = Math.max(2, (d.messages / max) * 72);
          return (
            <View key={d.day} style={{ flex: 1 }}>
              <View
                style={{ height: h, borderRadius: 2, backgroundColor: "#273B9A" }}
              />
            </View>
          );
        })}
      </View>
      <View className="mt-1 flex-row-reverse items-center justify-between">
        <Text className="text-[10px] text-[#7A88B8]">
          {format(new Date(daily[0].day), "MM-dd")}
        </Text>
        <Text className="text-[10px] text-[#7A88B8]">
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
      <Text className="mt-2 text-right text-xs text-[#7A88B8]">
        لا يوجد نشاط.
      </Text>
    );
  }

  const dayNames = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  return (
    <View className="mt-2 rounded-[18px] border border-[#E7EBFB] bg-white p-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {matrix.m.map((row, weekday) => (
            <View key={weekday} className="flex-row items-center">
              <Text
                className="w-12 text-right text-[10px] text-[#7A88B8]"
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
                        backgroundColor: `rgba(39,59,154,${opacity})`,
                        borderRadius: 2,
                      }}
                    />
                  );
                })}
              </View>
            </View>
          ))}
          <View className="mt-1 flex-row justify-between" style={{ paddingRight: 48 }}>
            <Text className="text-[9px] text-[#7A88B8]">0</Text>
            <Text className="text-[9px] text-[#7A88B8]">12</Text>
            <Text className="text-[9px] text-[#7A88B8]">23</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
