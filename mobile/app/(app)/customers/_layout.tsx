import { Stack } from "expo-router";
import { managerColors } from "../../../components/manager-ui";

export default function CustomersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: managerColors.surface },
        headerTintColor: managerColors.ink,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "العملاء" }} />
      <Stack.Screen name="new" options={{ title: "إضافة عميل" }} />
      <Stack.Screen name="[id]" options={{ title: "عميل" }} />
    </Stack>
  );
}
