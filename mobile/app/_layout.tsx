import "../global.css";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nManager } from "react-native";
import { StatusBar } from "expo-status-bar";
import { notificationHandler } from "../lib/push";

// Force RTL at launch. Requires an app restart the first time — Expo dev client
// or EAS build handles this automatically on next launch.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

Notifications.setNotificationHandler(notificationHandler);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as {
        type?: string;
        conversationId?: string;
        orderId?: string;
      };
      if (data?.type === "new_conversation" && data.conversationId) {
        router.push(`/inbox/${data.conversationId}`);
      } else if (data?.type === "sla_breach") {
        if (data.conversationId) {
          router.push(`/inbox/${data.conversationId}`);
        } else {
          router.push({
            pathname: "/(app)/inbox",
            params: { filter: "unassigned" },
          });
        }
      } else if (data?.type === "approval_needed") {
        router.push("/(app)/approvals");
      } else if (data?.orderId) {
        router.push(`/inbox/${data.orderId}`);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
