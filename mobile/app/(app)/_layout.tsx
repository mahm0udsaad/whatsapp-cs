import { Redirect, Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSessionStore } from "../../lib/session-store";
import { isManager } from "../../lib/roles";

export default function AppLayout() {
  // Guard: if the active member was cleared (e.g. by sign-out), bounce to
  // the login stack so the (app) group never renders without a session.
  const member = useSessionStore((s) => s.activeMember);
  const segments = useSegments();
  if (!member) {
    return <Redirect href="/(auth)/login" />;
  }
  const manager = isManager(member);
  const isConversationDetail =
    segments[1] === "inbox" && segments[2] !== undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#25D366",
        tabBarInactiveTintColor: "#6B7280",
        headerTintColor: "#111827",
        headerTitleStyle: {
          fontWeight: "700",
        },
        headerStyle: {
          backgroundColor: "#FFFFFF",
        },
        tabBarStyle: {
          display: isConversationDetail ? "none" : "flex",
          backgroundColor: "#FFFFFF",
          borderTopColor: "#D1D5DB",
          height: 68,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      {/* Overview — manager home */}
      <Tabs.Screen
        name="overview"
        options={{
          title: "نظرة عامة",
          tabBarLabel: "نظرة عامة",
          href: manager ? "/overview" : null,
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
        name="inbox"
        options={{
          title: "المحادثات",
          tabBarLabel: "المحادثات",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Team — manager supervision surface (folder with team/index.tsx). */}
      <Tabs.Screen
        name="team/index"
        options={{
          title: "الفريق",
          tabBarLabel: "الفريق",
          href: manager ? "/team" : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Shifts — agent-only; managers see shifts under Team */}
      <Tabs.Screen
        name="shifts"
        options={{
          title: "مناوباتي",
          tabBarLabel: "مناوباتي",
          href: manager ? null : "/shifts",
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
        name="profile"
        options={{
          title: "حسابي",
          tabBarLabel: "حسابي",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Approvals — manager-only, hidden from tab bar (linked from Overview) */}
      <Tabs.Screen
        name="approvals"
        options={{
          title: "في انتظار الموافقة",
          href: null,
        }}
      />
    </Tabs>
  );
}
