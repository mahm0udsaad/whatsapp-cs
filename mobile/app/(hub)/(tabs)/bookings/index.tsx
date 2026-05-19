import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl } from "react-native";
import { Pressable, Text, View } from "../../../../components/tw";
import { listHubBookings, type HubBooking } from "../../../../lib/hub-api";
import { bookingStatusMeta, formatSlot } from "../../../../lib/hub-format";
import { useHubRepairGuard } from "../../../../hooks/use-hub";
import {
  ListSkeleton,
  StatusPill,
  managerColors,
  softShadow,
} from "../../../../components/manager-ui";
import { EmptyState, ErrorState } from "../../../../components/list-state";

const FILTERS: { key: string; label: string; status?: string }[] = [
  { key: "active", label: "النشطة", status: "pending,confirmed" },
  { key: "pending", label: "قيد الانتظار", status: "pending" },
  { key: "confirmed", label: "مؤكّدة", status: "confirmed" },
  { key: "completed", label: "مكتملة", status: "completed" },
  { key: "cancelled", label: "ملغاة", status: "cancelled" },
];

export default function HubBookingsListScreen() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const query = useQuery({
    queryKey: ["hub", "bookings", filter.key],
    queryFn: () => listHubBookings({ status: filter.status }),
  });
  useHubRepairGuard(query.error);

  return (
    <View className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={query.refetch}
            tintColor={managerColors.brand}
          />
        }
        ListHeaderComponent={
          <View className="mb-2 flex-row-reverse flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = f.key === filter.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f)}
                  className="rounded-full border px-3 py-1.5"
                  style={{
                    borderColor: managerColors.border,
                    backgroundColor: active ? managerColors.brand : "#FFFFFF",
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: active ? "#FFFFFF" : managerColors.muted }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <ListSkeleton count={6} />
          ) : query.isError ? (
            <ErrorState onRetry={query.refetch} />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="لا توجد حجوزات"
              description="لا توجد حجوزات ضمن هذا التصنيف."
            />
          )
        }
        renderItem={({ item }) => <BookingCard booking={item} />}
      />
    </View>
  );
}

function BookingCard({ booking }: { booking: HubBooking }) {
  const meta = bookingStatusMeta(booking.status as string | undefined);
  return (
    <Pressable
      onPress={() => router.push(`/(hub)/(tabs)/bookings/${booking.id}`)}
      className="rounded-[20px] border bg-white p-4"
      style={[{ borderColor: managerColors.border }, softShadow]}
    >
      <View className="flex-row-reverse items-center justify-between">
        <Text
          className="flex-1 text-right text-base font-bold"
          style={{ color: managerColors.ink }}
          numberOfLines={1}
        >
          {booking.customer_name?.trim() || booking.customer_phone || "عميل"}
        </Text>
        <StatusPill label={meta.label} tone={meta.tone} />
      </View>
      <Text
        className="mt-1.5 text-right text-xs"
        style={{ color: managerColors.muted }}
      >
        {formatSlot(booking.date, booking.time_from, booking.time_to)}
      </Text>
      {booking.service_title ? (
        <Text
          className="mt-1 text-right text-xs"
          style={{ color: managerColors.muted }}
          numberOfLines={1}
        >
          {booking.service_title}
        </Text>
      ) : null}
    </Pressable>
  );
}
