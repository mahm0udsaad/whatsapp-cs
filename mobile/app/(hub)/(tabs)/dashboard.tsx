import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshControl } from "react-native";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  parse,
  startOfMonth,
  subMonths,
} from "date-fns";
import { Pressable, ScrollView, Text, View } from "../../../components/tw";
import { listAllHubBookings, type HubBooking } from "../../../lib/hub-api";
import { useHubRepairGuard } from "../../../hooks/use-hub";
import {
  CardSkeleton,
  ManagerCard,
  ManagerMetric,
  SectionHeader,
  managerColors,
} from "../../../components/manager-ui";
import { HubBarChart, type BarDatum } from "../../../components/hub-bar-chart";
import { ErrorState } from "../../../components/list-state";

type RangeKey = "prev" | "current" | "next";

/** Resolve a preset to an inclusive [from, to] pair spanning a whole month. */
function rangeBounds(key: RangeKey): { from: Date; to: Date } {
  const base =
    key === "prev"
      ? subMonths(new Date(), 1)
      : key === "next"
        ? addMonths(new Date(), 1)
        : new Date();
  return { from: startOfMonth(base), to: endOfMonth(base) };
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "prev", label: "الشهر الماضي" },
  { key: "current", label: "هذا الشهر" },
  { key: "next", label: "الشهر القادم" },
];

function bookingDayKey(b: HubBooking): string | null {
  if (!b.date) return null;
  const parsed = parse(b.date, "dd-MM-yyyy", new Date());
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "yyyy-MM-dd");
}

export default function HubDashboardScreen() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("current");
  const { from, to } = useMemo(() => rangeBounds(rangeKey), [rangeKey]);

  const query = useQuery({
    queryKey: ["hub", "dashboard", rangeKey],
    queryFn: () =>
      listAllHubBookings({
        from: format(from, "yyyy-MM-dd"),
        to: format(to, "yyyy-MM-dd"),
      }),
  });
  useHubRepairGuard(query.error);

  const stats = useMemo(() => {
    const bookings = query.data ?? [];
    const byStatus = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    let revenue = 0;
    const perDay = new Map<string, { count: number; revenue: number }>();
    const perService = new Map<string, number>();

    for (const b of bookings) {
      const status = String(b.status ?? "");
      if (status in byStatus) byStatus[status as keyof typeof byStatus]++;
      revenue += b.payment_amount ?? 0;

      const key = bookingDayKey(b);
      if (key) {
        const cur = perDay.get(key) ?? { count: 0, revenue: 0 };
        cur.count++;
        cur.revenue += b.payment_amount ?? 0;
        perDay.set(key, cur);
      }
      const svc = b.service_title?.trim();
      if (svc) perService.set(svc, (perService.get(svc) ?? 0) + 1);
    }

    const days = eachDayOfInterval({ start: from, end: to });
    const ordersSeries: BarDatum[] = days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const cell = perDay.get(key);
      return {
        key,
        label: format(d, "d/M"),
        value: cell?.count ?? 0,
        detail: `${cell?.count ?? 0} حجز`,
      };
    });
    const revenueSeries: BarDatum[] = days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const cell = perDay.get(key);
      return {
        key,
        label: format(d, "d/M"),
        value: Math.round(cell?.revenue ?? 0),
        detail: `${Math.round(cell?.revenue ?? 0)} ر.س`,
      };
    });
    const topServices = [...perService.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total: bookings.length,
      byStatus,
      revenue,
      ordersSeries,
      revenueSeries,
      topServices,
    };
  }, [query.data, from, to]);

  const barWidth = stats.ordersSeries.length <= 8 ? 44 : 32;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      style={{ backgroundColor: managerColors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={query.refetch}
          tintColor={managerColors.brand}
        />
      }
    >
      <View className="flex-row-reverse gap-2">
        {RANGES.map((r) => {
          const active = r.key === rangeKey;
          return (
            <Pressable
              key={r.key}
              onPress={() => setRangeKey(r.key)}
              className="flex-1 items-center rounded-full border py-2"
              style={{
                borderColor: managerColors.border,
                backgroundColor: active ? managerColors.brand : "#FFFFFF",
              }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: active ? "#FFFFFF" : managerColors.muted }}
              >
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="text-right text-xs" style={{ color: managerColors.muted }}>
        {format(from, "yyyy/MM/dd")} — {format(to, "yyyy/MM/dd")}
      </Text>

      {query.isLoading ? (
        <>
          <CardSkeleton rows={2} />
          <CardSkeleton rows={3} />
        </>
      ) : query.isError ? (
        <ErrorState onRetry={query.refetch} />
      ) : (
        <>
          <View className="flex-row-reverse gap-2">
            <ManagerMetric label="إجمالي الحجوزات" value={stats.total} compact />
            <ManagerMetric
              label="مؤكّدة"
              value={stats.byStatus.confirmed}
              tone="success"
              compact
            />
            <ManagerMetric
              label="مكتملة"
              value={stats.byStatus.completed}
              tone="info"
              compact
            />
          </View>
          <View className="flex-row-reverse gap-2">
            <ManagerMetric
              label="قيد الانتظار"
              value={stats.byStatus.pending}
              tone="warning"
              compact
            />
            <ManagerMetric
              label="ملغاة"
              value={stats.byStatus.cancelled}
              tone="danger"
              compact
            />
          </View>

          <ManagerCard>
            <SectionHeader title="الإيرادات" />
            <Text
              className="mt-2 text-right text-3xl font-bold"
              style={{ color: managerColors.ink }}
            >
              {stats.revenue.toLocaleString("ar")} ر.س
            </Text>
          </ManagerCard>

          <ManagerCard>
            <SectionHeader title="حجم الحجوزات اليومي" />
            <View className="mt-3">
              <HubBarChart data={stats.ordersSeries} barWidth={barWidth} />
            </View>
          </ManagerCard>

          <ManagerCard>
            <SectionHeader title="الإيرادات اليومية" />
            <View className="mt-3">
              <HubBarChart
                data={stats.revenueSeries}
                barWidth={barWidth}
              />
            </View>
          </ManagerCard>

          {stats.topServices.length > 0 ? (
            <ManagerCard>
              <SectionHeader title="الخدمات الأكثر حجزًا" />
              <View className="mt-2 gap-2">
                {stats.topServices.map(([name, count]) => (
                  <View
                    key={name}
                    className="flex-row-reverse items-center justify-between"
                  >
                    <Text
                      className="flex-1 text-right text-sm"
                      style={{ color: managerColors.ink }}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Text
                      className="text-sm font-bold"
                      style={{ color: managerColors.brand }}
                    >
                      {count}
                    </Text>
                  </View>
                ))}
              </View>
            </ManagerCard>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
