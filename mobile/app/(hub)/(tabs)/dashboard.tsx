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
import { Ionicons } from "@expo/vector-icons";
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
import { HubLineChart, type LinePoint } from "../../../components/hub-line-chart";
import { DateRangePicker } from "../../../components/date-range-picker";
import { ErrorState } from "../../../components/list-state";

type RangeKey = "prev" | "current" | "next" | "custom";

/** Resolve a month preset to an inclusive [from, to] pair. */
function monthBounds(key: "prev" | "current" | "next"): {
  from: Date;
  to: Date;
} {
  const base =
    key === "prev"
      ? subMonths(new Date(), 1)
      : key === "next"
        ? addMonths(new Date(), 1)
        : new Date();
  return { from: startOfMonth(base), to: endOfMonth(base) };
}

const RANGES: { key: "prev" | "current" | "next"; label: string }[] = [
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
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(
    null
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const { from, to } = useMemo(() => {
    if (rangeKey === "custom" && customRange) return customRange;
    return monthBounds(rangeKey === "custom" ? "current" : rangeKey);
  }, [rangeKey, customRange]);

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const query = useQuery({
    queryKey: ["hub", "dashboard", fromStr, toStr],
    queryFn: () => listAllHubBookings({ from: fromStr, to: toStr }),
  });
  useHubRepairGuard(query.error);

  const stats = useMemo(() => {
    const bookings = query.data ?? [];
    const byStatus = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    let revenue = 0;
    const perDay = new Map<string, { count: number; revenue: number }>();
    const perService = new Map<string, number>();
    const perStaff = new Map<string, number>();

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

      const staff = b.staff_name?.trim() || "بدون موظف";
      perStaff.set(staff, (perStaff.get(staff) ?? 0) + 1);
    }

    const days = eachDayOfInterval({ start: from, end: to });
    const ordersSeries: BarDatum[] = [];
    const revenueSeries: BarDatum[] = [];
    const cumulativeSeries: LinePoint[] = [];
    let running = 0;
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const label = format(d, "d/M");
      const cell = perDay.get(key);
      ordersSeries.push({
        key,
        label,
        value: cell?.count ?? 0,
        detail: `${cell?.count ?? 0} حجز`,
      });
      revenueSeries.push({
        key,
        label,
        value: Math.round(cell?.revenue ?? 0),
        detail: `${Math.round(cell?.revenue ?? 0)} ر.س`,
      });
      running += cell?.count ?? 0;
      cumulativeSeries.push({ key, label, value: running });
    }

    const topServices = [...perService.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const staffUtil = [...perStaff.entries()].sort((a, b) => b[1] - a[1]);

    return {
      total: bookings.length,
      byStatus,
      revenue,
      ordersSeries,
      revenueSeries,
      cumulativeSeries,
      topServices,
      staffUtil,
    };
  }, [query.data, from, to]);

  const barWidth = stats.ordersSeries.length <= 8 ? 44 : 32;
  const staffMax = Math.max(1, ...stats.staffUtil.map(([, c]) => c));

  return (
    <>
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
                  className="text-xs font-semibold"
                  style={{ color: active ? "#FFFFFF" : managerColors.muted }}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row-reverse items-center justify-between">
          <Pressable
            onPress={() => setPickerOpen(true)}
            className="flex-row-reverse items-center gap-1.5 rounded-full border px-3 py-1.5"
            style={{
              borderColor:
                rangeKey === "custom"
                  ? managerColors.brand
                  : managerColors.border,
              backgroundColor:
                rangeKey === "custom" ? managerColors.brandSoft : "#FFFFFF",
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={14}
              color={managerColors.brand}
            />
            <Text
              className="text-xs font-semibold"
              style={{ color: managerColors.brand }}
            >
              تخصيص
            </Text>
          </Pressable>
          <Text
            className="text-xs"
            style={{ color: managerColors.muted }}
          >
            {format(from, "yyyy/MM/dd")} — {format(to, "yyyy/MM/dd")}
          </Text>
        </View>

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
              <SectionHeader title="الحجوزات التراكمية" />
              <View className="mt-2">
                <HubLineChart data={stats.cumulativeSeries} />
              </View>
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
                <HubBarChart data={stats.revenueSeries} barWidth={barWidth} />
              </View>
            </ManagerCard>

            {stats.staffUtil.length > 0 ? (
              <ManagerCard>
                <SectionHeader title="توزيع الحجوزات على الفريق" />
                <View className="mt-2 gap-2.5">
                  {stats.staffUtil.map(([name, count]) => (
                    <View key={name}>
                      <View className="flex-row-reverse items-center justify-between">
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
                      <View
                        className="mt-1 h-2 overflow-hidden rounded-full"
                        style={{ backgroundColor: managerColors.surfaceTint }}
                      >
                        <View
                          style={{
                            height: "100%",
                            width: `${(count / staffMax) * 100}%`,
                            backgroundColor: managerColors.brand,
                            borderRadius: 999,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </ManagerCard>
            ) : null}

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

      {/* Mounted only while open so it always opens with the current range. */}
      {pickerOpen ? (
        <DateRangePicker
          visible
          initialFrom={from}
          initialTo={to}
          onClose={() => setPickerOpen(false)}
          onApply={(f, t) => {
            setCustomRange({ from: f, to: t });
            setRangeKey("custom");
            setPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
