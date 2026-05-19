import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "../../../../components/tw";
import {
  cancelHubBooking,
  confirmHubBooking,
  getHubBooking,
  rescheduleHubBooking,
} from "../../../../lib/hub-api";
import { getApiErrorMessage } from "../../../../lib/api";
import { bookingStatusMeta, formatSlot } from "../../../../lib/hub-format";
import { useHubRepairGuard } from "../../../../hooks/use-hub";
import {
  CardSkeleton,
  ManagerCard,
  SectionHeader,
  StatusPill,
  managerColors,
} from "../../../../components/manager-ui";
import { ErrorState } from "../../../../components/list-state";

export default function HubBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["hub", "booking", id],
    queryFn: () => getHubBooking(id),
    enabled: !!id,
  });
  useHubRepairGuard(query.error);

  const [date, setDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["hub", "booking", id] });
    queryClient.invalidateQueries({ queryKey: ["hub", "bookings"] });
    queryClient.invalidateQueries({ queryKey: ["hub", "dashboard"] });
  }

  const confirm = useMutation({
    mutationFn: () => confirmHubBooking(id),
    onSuccess: invalidate,
    onError: (e) =>
      Alert.alert("تعذّر التأكيد", getApiErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => cancelHubBooking(id, reason),
    onSuccess: invalidate,
    onError: (e) => Alert.alert("تعذّر الإلغاء", getApiErrorMessage(e)),
  });

  const reschedule = useMutation({
    mutationFn: () =>
      rescheduleHubBooking(id, {
        date: date.trim(),
        time_from: timeFrom.trim(),
        time_to: timeTo.trim(),
      }),
    onSuccess: () => {
      invalidate();
      setDate("");
      setTimeFrom("");
      setTimeTo("");
      Alert.alert("تم", "تم تغيير موعد الحجز.");
    },
    onError: (e) =>
      Alert.alert("تعذّر تغيير الموعد", getApiErrorMessage(e)),
  });

  function onCancelPress() {
    Alert.prompt?.(
      "إلغاء الحجز",
      "اكتب سبب الإلغاء",
      [
        { text: "تراجع", style: "cancel" },
        {
          text: "إلغاء الحجز",
          style: "destructive",
          onPress: (reason?: string) =>
            cancel.mutate(reason?.trim() || "ألغيت بواسطة الموظف"),
        },
      ],
      "plain-text"
    );
    // Android has no Alert.prompt — fall back to a fixed reason.
    if (!Alert.prompt) {
      cancel.mutate("ألغيت بواسطة الموظف");
    }
  }

  if (query.isLoading) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <CardSkeleton rows={4} />
        <CardSkeleton rows={2} />
      </ScrollView>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState onRetry={query.refetch} />;
  }

  const b = query.data;
  const meta = bookingStatusMeta(b.status as string | undefined);
  const status = String(b.status ?? "");
  const canConfirm = status === "pending";
  const canCancel = status === "pending" || status === "confirmed";
  const busy = confirm.isPending || cancel.isPending || reschedule.isPending;
  const canSaveReschedule =
    date.trim() !== "" && timeFrom.trim() !== "" && timeTo.trim() !== "";

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      style={{ backgroundColor: managerColors.bg }}
    >
      <ManagerCard>
        <View className="flex-row-reverse items-center justify-between">
          <Text
            className="flex-1 text-right text-lg font-bold"
            style={{ color: managerColors.ink }}
          >
            {b.customer_name?.trim() || b.customer_phone || "عميل"}
          </Text>
          <StatusPill label={meta.label} tone={meta.tone} />
        </View>
        <Field label="الهاتف" value={b.customer_phone ?? "—"} />
        <Field
          label="الموعد"
          value={formatSlot(b.date, b.time_from, b.time_to)}
        />
        <Field label="الخدمة" value={b.service_title ?? "—"} />
        <Field label="الموظف" value={b.staff_name ?? "—"} />
        {typeof b.price === "number" ? (
          <Field
            label="السعر"
            value={`${b.price} ${b.currency ?? "ر.س"}`}
          />
        ) : null}
      </ManagerCard>

      {(canConfirm || canCancel) && (
        <View className="flex-row-reverse gap-3">
          {canConfirm ? (
            <Pressable
              onPress={() => confirm.mutate()}
              disabled={busy}
              className="flex-1 items-center rounded-xl py-3.5"
              style={{ backgroundColor: managerColors.brand, opacity: busy ? 0.5 : 1 }}
            >
              {confirm.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="font-semibold text-white">تأكيد الحجز</Text>
              )}
            </Pressable>
          ) : null}
          {canCancel ? (
            <Pressable
              onPress={onCancelPress}
              disabled={busy}
              className="flex-1 items-center rounded-xl border py-3.5"
              style={{ borderColor: managerColors.danger, opacity: busy ? 0.5 : 1 }}
            >
              {cancel.isPending ? (
                <ActivityIndicator color={managerColors.danger} />
              ) : (
                <Text className="font-semibold" style={{ color: managerColors.danger }}>
                  إلغاء الحجز
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      )}

      {canCancel ? (
        <ManagerCard>
          <SectionHeader title="تغيير الموعد" />
          <TextInput
            className="mt-3 rounded-xl border px-3 py-2.5 text-right"
            style={{ borderColor: managerColors.border, color: managerColors.ink }}
            placeholder="التاريخ (2026-05-20)"
            placeholderTextColor={managerColors.muted}
            value={date}
            onChangeText={setDate}
          />
          <View className="mt-2 flex-row-reverse gap-2">
            <TextInput
              className="flex-1 rounded-xl border px-3 py-2.5 text-center"
              style={{ borderColor: managerColors.border, color: managerColors.ink }}
              placeholder="من (12:00)"
              placeholderTextColor={managerColors.muted}
              value={timeFrom}
              onChangeText={setTimeFrom}
            />
            <TextInput
              className="flex-1 rounded-xl border px-3 py-2.5 text-center"
              style={{ borderColor: managerColors.border, color: managerColors.ink }}
              placeholder="إلى (13:00)"
              placeholderTextColor={managerColors.muted}
              value={timeTo}
              onChangeText={setTimeTo}
            />
          </View>
          <Pressable
            onPress={() => reschedule.mutate()}
            disabled={busy || !canSaveReschedule}
            className="mt-3 items-center rounded-xl py-3"
            style={{
              backgroundColor: managerColors.brand,
              opacity: busy || !canSaveReschedule ? 0.5 : 1,
            }}
          >
            {reschedule.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">حفظ الموعد الجديد</Text>
            )}
          </Pressable>
        </ManagerCard>
      ) : null}

      <Pressable
        onPress={() => router.back()}
        className="items-center py-3"
      >
        <Text style={{ color: managerColors.muted }}>رجوع</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-2.5 flex-row-reverse items-center justify-between">
      <Text className="text-xs" style={{ color: managerColors.muted }}>
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
