import type { ReactNode } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { getHubStatus } from "../lib/hub-api";
import { useSessionStore } from "../lib/session-store";
import { isManager } from "../lib/roles";
import { HR_HOME } from "../lib/navigation";
import { managerColors } from "./manager-ui";

/** The shared Hub remains usable even without merchant permissions/pairing. */
export function HubWelcome({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }} style={{ backgroundColor: managerColors.bg }}>
      <View style={{ backgroundColor: "white", borderRadius: 24, padding: 24, gap: 12 }}>
        <Text style={{ color: managerColors.brand, fontWeight: "800", fontSize: 16, textAlign: "right" }}>نِحجز هَب</Text>
        <Text accessibilityRole="header" style={{ color: managerColors.ink, fontWeight: "700", fontSize: 26, textAlign: "right" }}>{title}</Text>
        <Text style={{ color: managerColors.muted, fontSize: 16, lineHeight: 26, textAlign: "right" }}>{description}</Text>
        {children}
      </View>
      <HubAction testID="hub-open-attendance" label="الحضور والانصراف" onPress={() => router.push(HR_HOME)} />
    </ScrollView>
  );
}

export function HubAction({ label, onPress, testID, secondary = false }: { label: string; onPress: () => void; testID: string; secondary?: boolean }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 52, padding: 16, borderRadius: 16, alignItems: "center", backgroundColor: secondary ? managerColors.brandSoft : managerColors.brand }}><Text style={{ color: secondary ? managerColors.brand : "white", fontWeight: "700", fontSize: 16 }}>{label}</Text></Pressable>;
}

export function HubMerchantGate({ children }: { children: ReactNode }) {
  const member = useSessionStore((state) => state.activeMember);
  const manager = isManager(member);
  const status = useQuery({ queryKey: ["hub", "status", member?.id], queryFn: getHubStatus, enabled: manager, staleTime: 60_000 });

  if (!manager) return <HubWelcome title={`أهلاً، ${member?.full_name || "بك"}`} description="مساحتك للحضور والانصراف ومتابعة يومك. يمكنك الوصول إلى واتساب وإعدادات حسابك من المزيد." />;
  if (status.isPending) return <HubWelcome title="جاري تجهيز مساحة العمل" description="يمكنك فتح الحضور أثناء تحميل بيانات المتجر."><ActivityIndicator color={managerColors.brand} /></HubWelcome>;
  if (status.isError) return <HubWelcome title="تعذّر تحميل بيانات المتجر" description="تحقّق من الاتصال وحاول مجددًا. تبقى خدمات الحضور متاحة."><HubAction testID="hub-status-retry" label="حاول مجددًا" onPress={() => void status.refetch()} secondary /></HubWelcome>;
  if (!status.data.paired) return <HubWelcome title="اربط متجر نِحجز" description="اربط حساب المتجر لعرض الحجوزات والخدمات وفريق العمل. يمكنك استخدام الحضور دون ربط المتجر."><HubAction testID="hub-open-pairing" label="ربط المتجر" onPress={() => router.push("/(hub)/pair")} secondary /></HubWelcome>;
  return <>{children}</>;
}
