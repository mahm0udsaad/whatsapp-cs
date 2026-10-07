import { Stack } from "expo-router";
import { managerColors } from "../../../components/manager-ui";

export default function InboxLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="new"
        options={{
          title: "محادثة جديدة بقالب",
          headerStyle: { backgroundColor: managerColors.surface },
          headerTintColor: managerColors.ink,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />
      <Stack.Screen name="[id]" options={{ title: "محادثة", headerShown: false }} />
    </Stack>
  );
}
