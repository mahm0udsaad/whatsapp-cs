import { useMemo, useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { RefreshControl } from "react-native";
import { Pressable, ScrollView, Text, View } from "../../../../components/tw";
import { EmptyState, ErrorState } from "../../../../components/list-state";
import {
  CardSkeleton,
  ManagerCard,
  ManagerMetric,
  SectionHeader,
  StatusPill,
  managerColors,
  premiumShadow,
  softShadow,
} from "../../../../components/manager-ui";
import { useHubRepairGuard } from "../../../../hooks/use-hub";
import {
  compareHubBookingsByTime,
  getHubDayTitle,
  getHubMonthTitle,
  hubWeekdaysShort,
  parseHubDate,
  toHubDayKey,
} from "../../../../lib/hub-bookings-calendar";
import { listAllHubBookings, type HubBooking } from "../../../../lib/hub-api";
import { bookingStatusMeta, formatSlot } from "../../../../lib/hub-format";

const FILTERS: { key: string; label: string; status?: string }[] = [
  { key: "active", label: "النشطة", status: "pending,confirmed" },
  { key: "pending", label: "قيد الانتظار", status: "pending" },
  { key: "confirmed", label: "مؤكّدة", status: "confirmed" },
  { key: "completed", label: "مكتملة", status: "completed" },
  { key: "cancelled", label: "ملغاة", status: "cancelled" },
];

type DaySummary = {
  key: string;
  dayNumber: string;
  bookings: HubBooking[];
  byStatus: Record<string, number>;
};

const STATUS_SWATCH: Record<string, string> = {
  pending: "#F4D774",
  confirmed: "#2D5BFF",
  completed: "#76B7FF",
  cancelled: "#F5A5B7",
};

export default function HubBookingsBoardScreen() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));

  const from = startOfMonth(viewMonth);
  const to = endOfMonth(viewMonth);
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const query = useQuery({
    queryKey: ["hub", "bookings", "board", fromStr, toStr, filter.key],
    queryFn: () =>
      listAllHubBookings({
        from: fromStr,
        to: toStr,
        status: filter.status,
      }),
  });
  useHubRepairGuard(query.error);

  const board = useMemo(() => {
    const bookings = [...(query.data ?? [])].sort(compareHubBookingsByTime);
    const byDay = new Map<string, DaySummary>();
    const totals = {
      total: bookings.length,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const booking of bookings) {
      const key = toHubDayKey(booking.date);
      if (!key) continue;
      const status = String(booking.status ?? "");
      const entry = byDay.get(key) ?? {
        key,
        dayNumber: format(parseHubDate(booking.date) ?? new Date(), "d"),
        bookings: [],
        byStatus: {},
      };
      entry.bookings.push(booking);
      entry.byStatus[status] = (entry.byStatus[status] ?? 0) + 1;
      byDay.set(key, entry);
      if (status in totals) {
        totals[status as keyof typeof totals]++;
      }
    }

    const days = eachDayOfInterval({ start: from, end: to }).map((day) => {
      const key = format(day, "yyyy-MM-dd");
      return (
        byDay.get(key) ?? {
          key,
          dayNumber: format(day, "d"),
          bookings: [],
          byStatus: {},
        }
      );
    });

    return {
      days,
      totals,
      busyDays: days.filter((day) => day.bookings.length > 0).length,
      topDays: days
        .filter((day) => day.bookings.length > 0)
        .sort((a, b) => b.bookings.length - a.bookings.length)
        .slice(0, 3),
    };
  }, [from, query.data, to]);

  const lead = getDay(from);
  const monthLabel = getHubMonthTitle(viewMonth);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}
      style={{ backgroundColor: managerColors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={query.refetch}
          tintColor={managerColors.brand}
        />
      }
    >
      <View
        className="rounded-[30px] px-4 pb-4 pt-5"
        style={[
          {
            backgroundColor: managerColors.brand,
          },
          premiumShadow,
        ]}
      >
        <View className="flex-row-reverse items-start justify-between gap-3">
          <View className="flex-1 items-end">
            <Text className="text-right text-xs font-semibold text-white/70">
              لوحة الحجوزات
            </Text>
            <Text className="mt-1 text-right text-2xl font-bold text-white">
              {monthLabel}
            </Text>
            <Text className="mt-1 text-right text-sm leading-6 text-white/80">
              اضغط على أي يوم لفتح قائمة الحجوزات في نافذة مستقلة.
            </Text>
          </View>
          <View
            className="rounded-[22px] px-4 py-3"
            style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
          >
            <Text
              className="text-center text-[28px] font-bold text-white"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {board.totals.total}
            </Text>
            <Text className="mt-1 text-center text-xs font-semibold text-white/80">
              إجمالي الحجوزات
            </Text>
          </View>
        </View>

        <View className="mt-4 flex-row-reverse gap-2">
          <Pressable
            onPress={() => setViewMonth((current) => subMonths(current, 1))}
            className="h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
          >
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => setViewMonth(startOfMonth(new Date()))}
            className="flex-1 items-center justify-center rounded-2xl px-4"
            style={{
              backgroundColor: isSameMonth(viewMonth, new Date())
                ? "rgba(255,255,255,0.22)"
                : "rgba(255,255,255,0.14)",
            }}
          >
            <Text className="text-sm font-semibold text-white">هذا الشهر</Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMonth((current) => addMonths(current, 1))}
            className="h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View className="flex-row-reverse flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = item.key === filter.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item)}
              className="rounded-full border px-4 py-2"
              style={{
                borderColor: active ? managerColors.brand : managerColors.border,
                backgroundColor: active ? managerColors.brand : "#FFFFFF",
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: active ? "#FFFFFF" : managerColors.muted }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {query.isLoading ? (
        <>
          <CardSkeleton rows={2} />
          <CardSkeleton rows={4} />
        </>
      ) : query.isError ? (
        <ErrorState onRetry={query.refetch} />
      ) : (
        <>
          <View className="flex-row-reverse gap-2">
            <ManagerMetric label="أيام مشغولة" value={board.busyDays} compact />
            <ManagerMetric
              label="قيد الانتظار"
              value={board.totals.pending}
              tone="warning"
              compact
            />
            <ManagerMetric
              label="مؤكّدة"
              value={board.totals.confirmed}
              tone="success"
              compact
            />
          </View>

          <ManagerCard>
            <View className="flex-row-reverse items-center justify-between">
              <SectionHeader title="تقويم الشهر" />
              <View className="flex-row-reverse items-center gap-3">
                {Object.entries(STATUS_SWATCH).map(([status, color]) => (
                  <View key={status} className="flex-row-reverse items-center gap-1.5">
                    <Text
                      className="text-[11px] font-medium"
                      style={{ color: managerColors.muted }}
                    >
                      {bookingStatusMeta(status).label}
                    </Text>
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-4 flex-row-reverse flex-wrap">
              {hubWeekdaysShort.map((day) => (
                <Text
                  key={day}
                  className="mb-2 text-center text-[11px] font-semibold"
                  style={{ width: `${100 / 7}%`, color: managerColors.muted }}
                >
                  {day}
                </Text>
              ))}
            </View>

            <View className="flex-row-reverse flex-wrap">
              {Array.from({ length: lead }).map((_, index) => (
                <View
                  key={`blank-${index}`}
                  style={{ width: `${100 / 7}%`, aspectRatio: 0.9, padding: 4 }}
                />
              ))}

              {board.days.map((day) => {
                const hasBookings = day.bookings.length > 0;
                const topStatuses = Object.entries(day.byStatus)
                  .sort((left, right) => right[1] - left[1])
                  .slice(0, 3);

                return (
                  <Pressable
                    key={day.key}
                    onPress={() => {
                      if (!hasBookings) return;
                      router.push({
                        pathname: "/(hub)/(tabs)/bookings/day/[date]",
                        params: {
                          date: day.key,
                          from: fromStr,
                          to: toStr,
                          status: filter.status ?? "",
                          filterKey: filter.key,
                        },
                      });
                    }}
                    disabled={!hasBookings}
                    style={{ width: `${100 / 7}%`, aspectRatio: 0.9, padding: 4 }}
                  >
                    <View
                      className="h-full rounded-[18px] border p-2"
                      style={[
                        {
                          borderColor: hasBookings
                            ? managerColors.brandSoft
                            : managerColors.border,
                          backgroundColor: hasBookings
                            ? "#F8FAFF"
                            : managerColors.surface,
                          opacity: hasBookings ? 1 : 0.72,
                        },
                        hasBookings ? softShadow : undefined,
                      ]}
                    >
                      <View className="flex-row-reverse items-start justify-between">
                        <Text
                          className="text-sm font-bold"
                          style={{
                            color: hasBookings
                              ? managerColors.brand
                              : managerColors.muted,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {day.dayNumber}
                        </Text>
                        {hasBookings ? (
                          <View
                            className="rounded-full px-2 py-0.5"
                            style={{ backgroundColor: managerColors.brandSoft }}
                          >
                            <Text
                              className="text-[10px] font-bold"
                              style={{
                                color: managerColors.brand,
                                fontVariant: ["tabular-nums"],
                              }}
                            >
                              {day.bookings.length}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {hasBookings ? (
                        <>
                          <View className="mt-auto flex-row-reverse items-center gap-1">
                            {topStatuses.map(([status]) => (
                              <View
                                key={`${day.key}-${status}`}
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    STATUS_SWATCH[status] ?? managerColors.border,
                                }}
                              />
                            ))}
                          </View>
                          <Text
                            className="mt-1 text-right text-[10px] font-medium"
                            style={{ color: managerColors.muted }}
                            numberOfLines={1}
                          >
                            {day.bookings[0]?.customer_name?.trim() ||
                              day.bookings[0]?.customer_phone ||
                              "حجوزات اليوم"}
                          </Text>
                        </>
                      ) : (
                        <Text
                          className="mt-auto text-center text-[10px] font-medium"
                          style={{ color: "#AAB3D8" }}
                        >
                          —
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ManagerCard>

          <ManagerCard>
            <SectionHeader title="أيام تحتاج متابعة" />
            {board.topDays.length === 0 ? (
              <View className="pt-3">
                <EmptyState
                  icon="calendar-outline"
                  title="الشهر هادئ"
                  description="لا توجد حجوزات ضمن هذا التصنيف في الشهر الحالي."
                />
              </View>
            ) : (
              <View className="mt-3 gap-2.5">
                {board.topDays.map((day) => (
                  <Pressable
                    key={`top-${day.key}`}
                    onPress={() =>
                      router.push({
                        pathname: "/(hub)/(tabs)/bookings/day/[date]",
                        params: {
                          date: day.key,
                          from: fromStr,
                          to: toStr,
                          status: filter.status ?? "",
                          filterKey: filter.key,
                        },
                      })
                    }
                    className="rounded-[20px] border bg-white p-3.5"
                    style={[{ borderColor: managerColors.border }, softShadow]}
                  >
                    <View className="flex-row-reverse items-center justify-between">
                      <View className="flex-row-reverse items-center gap-2">
                        <View
                          className="rounded-full px-2.5 py-1"
                          style={{ backgroundColor: managerColors.brandSoft }}
                        >
                          <Text
                            className="text-xs font-bold"
                            style={{
                              color: managerColors.brand,
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {day.bookings.length}
                          </Text>
                        </View>
                        <Text
                          className="text-xs font-medium"
                          style={{ color: managerColors.muted }}
                        >
                          حجوزات
                        </Text>
                      </View>
                      <Text
                        className="text-right text-sm font-bold"
                        style={{ color: managerColors.ink }}
                      >
                        {getHubDayTitle(day.key)}
                      </Text>
                    </View>
                    <View className="mt-2 flex-row-reverse flex-wrap gap-2">
                      {day.bookings.slice(0, 2).map((booking) => (
                        <StatusPill
                          key={booking.id}
                          label={
                            booking.customer_name?.trim() ||
                            booking.customer_phone ||
                            "عميل"
                          }
                        />
                      ))}
                    </View>
                    <Text
                      className="mt-2 text-right text-xs"
                      style={{ color: managerColors.muted }}
                    >
                      {formatSlot(
                        day.bookings[0]?.date,
                        day.bookings[0]?.time_from,
                        day.bookings[0]?.time_to
                      )}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ManagerCard>
        </>
      )}
    </ScrollView>
  );
}
