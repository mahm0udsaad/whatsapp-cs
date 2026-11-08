import { Tabs, router, useSegments } from "expo-router";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { managerColors } from "../../../components/manager-ui";

import { useSessionStore } from "../../../lib/session-store";
import { isManager } from "../../../lib/roles";

export default function HubTabsLayout() {
  const member = useSessionStore((state) => state.activeMember);
  const manager = isManager(member);
  const segments = useSegments() as string[];
  const hideTabs = segments.includes("hr") && ["scan", "activate", "first-scan", "waiting", "result"].some((screen) => segments.includes(screen));
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: managerColors.brand,
        tabBarInactiveTintColor: managerColors.muted,
        headerTintColor: managerColors.ink,
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
        headerStyle: { backgroundColor: managerColors.surface },
        headerShadowVisible: false,
        tabBarStyle: {
          display: hideTabs ? "none" : "flex",
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E7EBFB",
          height: 82,
          paddingBottom: 12,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        sceneStyle: { backgroundColor: managerColors.bg },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "نظرة عامة",
          tabBarLabel: "نظرة عامة",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "speedometer" : "speedometer-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          href: manager ? "/(hub)/(tabs)/bookings" : null,
          title: "الحجوزات",
          tabBarLabel: "الحجوزات",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="hr"
        options={{
          title: "الحضور",
          tabBarLabel: "الحضور",
          headerShown: false,
          tabBarButtonTestID: "hub-tab-hr",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "finger-print" : "finger-print-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          href: manager ? "/(hub)/(tabs)/staff" : null,
          title: "فريق العمل",
          tabBarLabel: "الفريق",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "المزيد",
          tabBarLabel: "المزيد",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "ellipsis-horizontal-circle" : "ellipsis-horizontal-circle-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen name="services" options={{ title: "الخدمات", href: null, headerLeft: () => <Pressable testID="hub-services-back" accessibilityRole="button" accessibilityLabel="العودة إلى المزيد" onPress={() => router.replace("/(hub)/(tabs)/more")} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}><Ionicons name="chevron-forward" size={24} color={managerColors.brand} /></Pressable> }} />
    </Tabs>
  );
}
