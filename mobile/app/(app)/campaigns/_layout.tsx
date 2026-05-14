import { Stack } from "expo-router";
import { managerColors } from "../../../components/manager-ui";

export default function CampaignsLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: managerColors.ink,
        headerStyle: { backgroundColor: managerColors.surface },
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "التسويق" }}
      />
      <Stack.Screen
        name="whatsapp"
        options={{ title: "حملات WhatsApp" }}
      />
      <Stack.Screen
        name="meta"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="compose"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="new-campaign"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="new"
        options={{ title: "اختر نوع القالب", presentation: "modal" }}
      />
      <Stack.Screen
        name="new-edit"
        options={{ title: "بيانات الحملة" }}
      />
      <Stack.Screen
        name="[id]"
        options={{ title: "تفاصيل الحملة" }}
      />
      <Stack.Screen
        name="templates"
        options={{ title: "قوالب الرسائل" }}
      />
    </Stack>
  );
}
