import { useState } from "react";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "../../../components/tw";
import {
  getHubCustomer,
  getHubStatus,
  unpairHub,
  type HubCustomer,
} from "../../../lib/hub-api";
import { getApiErrorMessage } from "../../../lib/api";
import {
  persistActiveGateway,
  useSessionStore,
} from "../../../lib/session-store";
import { useHubRepairGuard } from "../../../hooks/use-hub";
import { Ionicons } from "@expo/vector-icons";
import {
  ManagerCard,
  SectionHeader,
  managerColors,
  softShadow,
} from "../../../components/manager-ui";

export default function HubMoreScreen() {
  const queryClient = useQueryClient();
  const setActiveGateway = useSessionStore((s) => s.setActiveGateway);
  const status = useQuery({ queryKey: ["hub", "status"], queryFn: getHubStatus });
  useHubRepairGuard(status.error);

  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<HubCustomer | null>(null);

  const lookup = useMutation({
    mutationFn: () => getHubCustomer(phone.trim()),
    onSuccess: (data) => setCustomer(data),
    onError: (e) => {
      setCustomer(null);
      Alert.alert("لم يُعثر على العميل", getApiErrorMessage(e));
    },
  });

  const unpair = useMutation({
    mutationFn: unpairHub,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hub"] });
      router.replace("/(hub)/pair");
    },
    onError: (e) => Alert.alert("تعذّر فك الربط", getApiErrorMessage(e)),
  });

  async function switchGateway() {
    await persistActiveGateway("bot");
    setActiveGateway("bot");
    router.replace("/(app)/overview");
  }

  function confirmUnpair() {
    Alert.alert(
      "فك ربط نِحجز هَب",
      "ستحتاج إلى رمز ربط جديد لإعادة الاتصال.",
      [
        { text: "تراجع", style: "cancel" },
        {
          text: "فك الربط",
          style: "destructive",
          onPress: () => unpair.mutate(),
        },
      ]
    );
  }

  const merchant = status.data?.merchant;
  const canLookup = phone.trim().length > 5;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      style={{ backgroundColor: managerColors.bg }}
    >
      <ManagerCard>
        <SectionHeader title="بيانات المتجر" />
        <Row label="الاسم" value={merchant?.name ?? "—"} />
        <Row label="الهاتف" value={merchant?.phone ?? "—"} />
        <Row label="المنطقة الزمنية" value={merchant?.timezone ?? "—"} />
      </ManagerCard>

      <ManagerCard>
        <SectionHeader title="بحث عن عميل" />
        <View className="mt-3 flex-row-reverse gap-2">
          <TextInput
            className="flex-1 rounded-xl border px-3 py-2.5 text-right"
            style={{ borderColor: managerColors.border, color: managerColors.ink }}
            placeholder="رقم الهاتف"
            placeholderTextColor={managerColors.muted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Pressable
            onPress={() => lookup.mutate()}
            disabled={!canLookup || lookup.isPending}
            className="items-center justify-center rounded-xl px-5"
            style={{
              backgroundColor: managerColors.brand,
              opacity: !canLookup || lookup.isPending ? 0.5 : 1,
            }}
          >
            {lookup.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">بحث</Text>
            )}
          </Pressable>
        </View>
        {customer ? (
          <View className="mt-3">
            <Row label="الاسم" value={customer.name ?? "—"} />
            <Row label="الهاتف" value={customer.phone ?? phone} />
            {typeof customer.bookings_count === "number" ? (
              <Row label="عدد الحجوزات" value={String(customer.bookings_count)} />
            ) : null}
          </View>
        ) : null}
      </ManagerCard>

      <Pressable
        onPress={switchGateway}
        className="mt-1 flex-row-reverse items-center gap-3 rounded-[24px] border p-4"
        style={[
          {
            borderColor: "#F4D774",
            backgroundColor: "#FFF7D8",
          },
          softShadow,
        ]}
      >
        <View
          className="h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: managerColors.bot }}
        >
          <Ionicons name="chatbubbles" size={22} color={managerColors.ink} />
        </View>
        <View className="flex-1">
          <Text
            className="text-right text-base font-bold"
            style={{ color: managerColors.ink }}
          >
            التبديل إلى نِحجز بوت
          </Text>
          <Text
            className="mt-1 text-right text-xs leading-5"
            style={{ color: "#8A5E00" }}
          >
            محادثات واتساب والحملات التسويقية وإدارة الفريق
          </Text>
        </View>
        <Ionicons name="chevron-back" size={22} color={managerColors.ink} />
      </Pressable>

      <Pressable
        onPress={confirmUnpair}
        disabled={unpair.isPending}
        className="items-center rounded-[20px] border py-3.5"
        style={{ borderColor: managerColors.danger, opacity: unpair.isPending ? 0.5 : 1 }}
      >
        {unpair.isPending ? (
          <ActivityIndicator color={managerColors.danger} />
        ) : (
          <Text className="font-semibold" style={{ color: managerColors.danger }}>
            فك ربط نِحجز هَب
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
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
