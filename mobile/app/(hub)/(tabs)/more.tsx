import { useState } from "react";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "../../../components/tw";
import { getHubCustomer, getHubStatus, unpairHub, type HubCustomer } from "../../../lib/hub-api";
import { getApiErrorMessage } from "../../../lib/api";
import { clearActiveGateway, clearActiveTenant, getOrCreateDeviceId, useSessionStore } from "../../../lib/session-store";
import { signOut } from "../../../lib/auth";
import { disablePushToken } from "../../../lib/push";
import { isManager } from "../../../lib/roles";
import { whatsappHome } from "../../../lib/navigation";
import { HubAction } from "../../../components/hub-merchant-gate";
import { ManagerCard, SectionHeader, managerColors } from "../../../components/manager-ui";

export default function HubMoreScreen() {
  const member = useSessionStore((state) => state.activeMember);
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const manager = isManager(member);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (member) {
        const deviceId = await getOrCreateDeviceId();
        // Revoke notifications while the app session can still authorize it.
        await disablePushToken(deviceId, member.restaurant_id).catch(() => undefined);
      }
      await signOut();
      await Promise.all([clearActiveTenant(), clearActiveGateway()]).catch(() => undefined);
      queryClient.clear();
      useSessionStore.setState({ activeMember: null, activeGateway: null });
      router.replace("/(auth)/login");
    } catch (error) {
      Alert.alert("تعذّر تسجيل الخروج", getApiErrorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16 }} style={{ backgroundColor: managerColors.bg }}>
      <ManagerCard>
        <SectionHeader title="حسابي" />
        <Text className="mt-3 text-right text-lg font-bold" style={{ color: managerColors.ink }}>{member?.full_name || "نِحجز هَب"}</Text>
        <Text className="mt-1 text-right text-sm" style={{ color: managerColors.muted }}>{member?.restaurant?.name || "مساحة العمل"}</Text>
      </ManagerCard>
      <HubAction testID="hub-open-whatsapp" label="واتساب — المحادثات والحملات" onPress={() => { useSessionStore.getState().setActiveGateway("bot"); router.replace(whatsappHome(member)); }} />
      <HubAction testID="hub-open-profile" label="إعدادات الحساب والملف الشخصي" onPress={() => router.push("/(app)/profile")} secondary />
      {manager ? <>
        <HubAction testID="hub-open-services" label="الخدمات" onPress={() => router.push("/(hub)/(tabs)/services")} secondary />
        <MerchantSettings />
      </> : null}
      <Pressable testID="hub-logout" accessibilityRole="button" accessibilityLabel="تسجيل الخروج" disabled={loggingOut} onPress={() => void logout()} style={{ borderWidth: 1, borderColor: managerColors.danger, padding: 16, minHeight: 52, borderRadius: 16, alignItems: "center" }}>
        {loggingOut ? <ActivityIndicator color={managerColors.danger} /> : <Text style={{ color: managerColors.danger, fontWeight: "700", fontSize: 16 }}>تسجيل الخروج</Text>}
      </Pressable>
    </ScrollView>
  );
}

function MerchantSettings() {
  const member = useSessionStore((state) => state.activeMember);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["hub", "status", member?.id], queryFn: getHubStatus });
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<HubCustomer | null>(null);
  const lookup = useMutation({
    mutationFn: () => getHubCustomer(phone.trim()),
    onSuccess: setCustomer,
    onError: (error) => { setCustomer(null); Alert.alert("لم يُعثر على العميل", getApiErrorMessage(error)); },
  });
  const unpair = useMutation({
    mutationFn: unpairHub,
    onSuccess: async () => { queryClient.removeQueries({ queryKey: ["hub"] }); await queryClient.invalidateQueries({ queryKey: ["hub"] }); },
    onError: (error) => Alert.alert("تعذّر فك الربط", getApiErrorMessage(error)),
  });

  if (status.isPending) return <ActivityIndicator color={managerColors.brand} />;
  if (status.isError) return <ManagerCard><Text style={{ color: managerColors.muted, textAlign: "right", marginBottom: 12 }}>تعذّر تحميل بيانات المتجر</Text><HubAction testID="hub-more-status-retry" label="حاول مجددًا" onPress={() => void status.refetch()} secondary /></ManagerCard>;
  if (!status.data.paired) return <HubAction testID="hub-more-pair" label="ربط متجر نِحجز" onPress={() => router.push("/(hub)/pair")} secondary />;
  const merchant = status.data.merchant;
  const canLookup = phone.trim().length > 5;

  return <>
    <ManagerCard>
      <SectionHeader title="بيانات المتجر" />
      <Row label="الاسم" value={merchant?.name ?? "—"} />
      <Row label="الهاتف" value={merchant?.phone ?? "—"} />
      <Row label="المنطقة الزمنية" value={merchant?.timezone ?? "—"} />
    </ManagerCard>
    <ManagerCard>
      <SectionHeader title="بحث عن عميل" />
      <View className="mt-3 gap-3">
        <TextInput testID="hub-customer-phone" accessibilityLabel="رقم هاتف العميل" className="rounded-xl border px-3 py-3 text-right" style={{ borderColor: managerColors.border, color: managerColors.ink }} placeholder="رقم الهاتف" placeholderTextColor={managerColors.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        <Pressable testID="hub-customer-search" accessibilityRole="button" accessibilityLabel="بحث عن عميل" onPress={() => lookup.mutate()} disabled={!canLookup || lookup.isPending} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: managerColors.brand, opacity: !canLookup || lookup.isPending ? 0.5 : 1 }}>
          {lookup.isPending ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">بحث</Text>}
        </Pressable>
      </View>
      {customer ? <View className="mt-3"><Row label="الاسم" value={customer.name ?? "—"} /><Row label="الهاتف" value={customer.phone ?? phone} />{typeof customer.bookings_count === "number" ? <Row label="عدد الحجوزات" value={String(customer.bookings_count)} /> : null}</View> : null}
    </ManagerCard>
    <Pressable testID="hub-unpair" accessibilityRole="button" accessibilityLabel="فك ربط المتجر" disabled={unpair.isPending} onPress={() => Alert.alert("فك ربط نِحجز هَب", "ستحتاج إلى رمز ربط جديد لإعادة الاتصال. لن يتغير تسجيل هاتف الحضور.", [{ text: "تراجع", style: "cancel" }, { text: "فك الربط", style: "destructive", onPress: () => unpair.mutate() }])} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: managerColors.danger }}>فك ربط المتجر</Text>
    </Pressable>
  </>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View className="mt-2.5 flex-row-reverse items-center justify-between"><Text className="text-xs" style={{ color: managerColors.muted }}>{label}</Text><Text className="flex-1 text-right text-sm font-medium" style={{ color: managerColors.ink }} numberOfLines={1}>{value}</Text></View>;
}
