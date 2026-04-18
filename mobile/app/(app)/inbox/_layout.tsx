import { Stack } from "expo-router";

export default function InboxLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "محادثة", headerShown: false }} />
    </Stack>
  );
}
