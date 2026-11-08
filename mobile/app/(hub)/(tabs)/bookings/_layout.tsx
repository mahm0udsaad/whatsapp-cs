import { HubMerchantGate } from "../../../../components/hub-merchant-gate";
import { Stack } from "expo-router";
import { managerColors } from "../../../../components/manager-ui";

export default function HubBookingsLayout() {
  return (
    <HubMerchantGate>
    <Stack
      screenOptions={{
        headerTintColor: managerColors.ink,
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
        headerStyle: { backgroundColor: managerColors.surface },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: managerColors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "الحجوزات" }} />
      <Stack.Screen
        name="day/[date]"
        options={{ title: "حجوزات اليوم", presentation: "modal" }}
      />
      <Stack.Screen name="[id]" options={{ title: "تفاصيل الحجز" }} />
    </Stack>
    </HubMerchantGate>
  );
}
