import { Tabs } from "expo-router";

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#25D366",
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{ title: "الصندوق", tabBarLabel: "الصندوق" }}
      />
      <Tabs.Screen
        name="shifts"
        options={{ title: "مناوباتي", tabBarLabel: "مناوباتي" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "حسابي", tabBarLabel: "حسابي" }}
      />
    </Tabs>
  );
}
