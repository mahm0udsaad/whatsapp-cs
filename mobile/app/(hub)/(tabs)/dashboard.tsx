import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshControl } from "react-native";
import { Pressable, ScrollView, Text, View } from "../../../components/tw";
import {
  getHubDashboardSummary,
  type DashboardRange,
} from "../../../lib/hub-api";
import { useHubRepairGuard } from "../../../hooks/use-hub";
import {
  CardSkeleton,
  ManagerCard,
  ManagerMetric,
  SectionHeader,
  managerColors,
} from "../../../components/manager-ui";
import { ErrorState } from "../../../components/list-state";

const RANGES: { key: DashboardRange; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "الأسبوع" },
  { key: "month", label: "الشهر" },
];

export default function HubDashboardScreen() {
  const [range, setRange] = useState<DashboardRange>("today");
  const query = useQuery({
    queryKey: ["hub", "dashboard", range],
    queryFn: () => getHubDashboardSummary(range),
  });
  useHubRepairGuard(query.error);

  const s = query.data;
  const currency = s?.currency ?? "ر.س";

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
          const active = r.key === range;
          return (
            <Pressable
              key={r.key}
              onPress={() => setRange(r.key)}
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

      {query.isLoading ? (
        <>
          <CardSkeleton rows={2} />
          <CardSkeleton rows={3} />
        </>
      ) : query.isError ? (
        <ErrorState onRetry={query.refetch} />
      ) : (
        <>
          <View className="flex-row-reverse gap-3">
            <ManagerMetric
              label="إجمالي الحجوزات"
              value={s?.bookings_total ?? 0}
            />
            <ManagerMetric
              label="قيد الانتظار"
              value={s?.bookings_pending ?? 0}
              tone="warning"
            />
          </View>
          <View className="flex-row-reverse gap-3">
            <ManagerMetric
              label="مؤكّدة"
              value={s?.bookings_confirmed ?? 0}
              tone="success"
            />
            <ManagerMetric
              label="ملغاة"
              value={s?.bookings_cancelled ?? 0}
              tone="danger"
            />
          </View>

          <ManagerCard>
            <SectionHeader title="الإيرادات" />
            <Text
              className="mt-2 text-right text-3xl font-bold"
              style={{ color: managerColors.ink }}
            >
              {(s?.revenue ?? 0).toLocaleString("ar")} {currency}
            </Text>
            {typeof s?.customers_total === "number" ? (
              <Text
                className="mt-1 text-right text-xs"
                style={{ color: managerColors.muted }}
              >
                {s.customers_total} عميل
              </Text>
            ) : null}
          </ManagerCard>
        </>
      )}
    </ScrollView>
  );
}
