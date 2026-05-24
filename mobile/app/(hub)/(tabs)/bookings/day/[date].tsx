import { useMemo } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshControl } from "react-native";
import { Pressable, ScrollView, Text, View } from "../../../../../components/tw";
import { EmptyState, ErrorState } from "../../../../../components/list-state";
import {
  ManagerCard,
  SectionHeader,
  StatusPill,
  managerColors,
  softShadow,
} from "../../../../../components/manager-ui";
import { useHubRepairGuard } from "../../../../../hooks/use-hub";
import {
  compareHubBookingsByTime,
  getHubDayTitle,
  toHubDayKey,
} from "../../../../../lib/hub-bookings-calendar";
import { listAllHubBookings } from "../../../../../lib/hub-api";
import { bookingStatusMeta, formatSlot } from "../../../../../lib/hub-format";

export default function HubBookingDayModalScreen() {
  const params = useLocalSearchParams<{
    date?: string;
    from?: string;
    to?: string;
    status?: string;
    filterKey?: string;
  }>();

  const dateKey = params.date ?? "";
  const from = params.from ?? dateKey;
  const to = params.to ?? dateKey;
  const status = params.status?.trim() ? params.status : undefined;
  const filterKey = params.filterKey?.trim() || "all";

  const query = useQuery({
    queryKey: ["hub", "bookings", "board", from, to, filterKey],
    queryFn: () => listAllHubBookings({ from, to, status }),
    enabled: !!dateKey,
  });
  useHubRepairGuard(query.error);

  const bookings = useMemo(
    () =>
      [...(query.data ?? [])]
        .filter((booking) => toHubDayKey(booking.date) === dateKey)
        .sort(compareHubBookingsByTime),
    [dateKey, query.data]
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
      style={{ backgroundColor: managerColors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={query.refetch}
          tintColor={managerColors.brand}
        />
      }
    >
      <ManagerCard>
        <Text className="text-right text-xs font-semibold" style={{ color: managerColors.muted }}>
          تفاصيل اليوم
        </Text>
        <Text className="mt-1 text-right text-2xl font-bold" style={{ color: managerColors.ink }}>
          {getHubDayTitle(dateKey)}
        </Text>
        <Text className="mt-1 text-right text-sm leading-6" style={{ color: managerColors.muted }}>
          {bookings.length} حجوزات ضمن اليوم المحدد. اضغط على أي حجز لفتح تفاصيله.
        </Text>
      </ManagerCard>

      {query.isError ? (
        <ErrorState onRetry={query.refetch} />
      ) : bookings.length === 0 && !query.isLoading ? (
        <EmptyState
          icon="calendar-outline"
          title="لا توجد حجوزات"
          description="لا توجد حجوزات لهذا اليوم ضمن الفلتر الحالي."
        />
      ) : (
        <View className="gap-3">
          {bookings.map((booking) => {
            const meta = bookingStatusMeta(booking.status as string | undefined);
            return (
              <Pressable
                key={booking.id}
                onPress={() => router.push(`/(hub)/(tabs)/bookings/${booking.id}`)}
                className="rounded-[22px] border bg-white p-4"
                style={[{ borderColor: managerColors.border }, softShadow]}
              >
                <View className="flex-row-reverse items-center justify-between gap-3">
                  <View className="flex-1 items-end">
                    <Text
                      className="text-right text-lg font-bold"
                      style={{ color: managerColors.ink }}
                      numberOfLines={1}
                    >
                      {booking.customer_name?.trim() || booking.customer_phone || "عميل"}
                    </Text>
                    <Text
                      className="mt-1 text-right text-sm"
                      style={{ color: managerColors.muted }}
                    >
                      {formatSlot(booking.date, booking.time_from, booking.time_to)}
                    </Text>
                  </View>
                  <StatusPill label={meta.label} tone={meta.tone} />
                </View>

                <View className="mt-3 gap-2">
                  {booking.service_title ? (
                    <Field label="الخدمة" value={booking.service_title} />
                  ) : null}
                  {booking.staff_name ? (
                    <Field label="الموظف" value={booking.staff_name} />
                  ) : null}
                  {booking.branch_name ? (
                    <Field label="الفرع" value={booking.branch_name} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <ManagerCard>
        <SectionHeader title="إجراء سريع" />
        <Pressable
          onPress={() => router.back()}
          className="mt-3 items-center rounded-[18px] py-3"
          style={{ backgroundColor: managerColors.brand }}
        >
          <Text className="font-semibold text-white">إغلاق النافذة</Text>
        </Pressable>
      </ManagerCard>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row-reverse items-center justify-between rounded-2xl bg-[#F7F9FF] px-3 py-2.5">
      <Text className="text-xs font-semibold" style={{ color: managerColors.muted }}>
        {label}
      </Text>
      <Text
        className="flex-1 text-right text-sm font-medium"
        style={{ color: managerColors.ink }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
