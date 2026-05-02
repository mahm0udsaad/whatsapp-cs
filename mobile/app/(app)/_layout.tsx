import { Redirect, Tabs, router, useSegments } from "expo-router";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSessionStore } from "../../lib/session-store";
import { isManager } from "../../lib/roles";
import { managerColors } from "../../components/manager-ui";
import { useInAppToasts } from "../../hooks/use-in-app-toasts";

export default function AppLayout() {
  // Guard: if the active member was cleared (e.g. by sign-out), bounce to
  // the login stack so the (app) group never renders without a session.
  const member = useSessionStore((s) => s.activeMember);
  const segments = useSegments();
  // Must run BEFORE any early return so hook order stays stable; no-op when
  // restaurantId is null.
  useInAppToasts(member?.restaurant_id ?? null);
  if (!member) {
    return <Redirect href="/(auth)/login" />;
  }
  const manager = isManager(member);
  const isConversationDetail =
    segments[1] === "inbox" && segments[2] !== undefined;

  const profileHeaderRight = () => (
    <Pressable
      onPress={() => router.push("/(app)/profile")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="حسابي"
      style={{ paddingHorizontal: 14 }}
    >
      <Ionicons
        name="person-circle-outline"
        size={28}
        color={managerColors.ink}
      />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: managerColors.brand,
        tabBarInactiveTintColor: managerColors.muted,
        headerTintColor: managerColors.ink,
        headerTitleStyle: {
          fontWeight: "700",
        },
        headerStyle: {
          backgroundColor: managerColors.surfaceTint,
        },
        tabBarStyle: {
          display: isConversationDetail ? "none" : "flex",
          backgroundColor: managerColors.surfaceTint,
          borderTopColor: managerColors.border,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
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
          headerRight: profileHeaderRight,
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

      {/* Customers — hidden from tab bar; linked from Campaigns screen. */}
      <Tabs.Screen
        name="customers"
        options={{
          title: "العملاء",
          href: null,
          headerShown: false,
        }}
      />

      {/* Campaigns — manager-only marketing surface (nested stack). */}
      <Tabs.Screen
        name="campaigns"
        options={{
          title: "الحملات",
          tabBarLabel: "الحملات",
          href: manager ? "/campaigns" : null,
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "megaphone" : "megaphone-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Approvals — manager-only, visible in tab bar as "الطلبات". */}
      <Tabs.Screen
        name="approvals"
        options={{
          title: "الطلبات",
          tabBarLabel: "الطلبات",
          href: manager ? "/approvals" : null,
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "shield-checkmark" : "shield-checkmark-outline"}
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
          headerRight: profileHeaderRight,
        }}
      />

      {/* Profile — hidden from tab bar; linked from Overview header. */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "حسابي",
          href: null,
        }}
      />
    </Tabs>
  );
}
