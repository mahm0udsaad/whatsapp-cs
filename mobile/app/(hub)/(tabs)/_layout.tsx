import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { managerColors } from "../../../components/manager-ui";

export default function HubTabsLayout() {
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
        name="services"
        options={{
          title: "الخدمات",
          tabBarLabel: "الخدمات",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "pricetags" : "pricetags-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
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
    </Tabs>
  );
}
