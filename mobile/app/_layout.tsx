import "../global.css";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nManager } from "react-native";
import { StatusBar } from "expo-status-bar";
import { notificationHandler } from "../lib/push";
import { ErrorBoundary } from "../components/error-boundary";
import {
  captureException,
  captureMessage,
  initObservability,
  wrap,
} from "../lib/observability";

// Force RTL at launch. Requires an app restart the first time — Expo dev client
// or EAS build handles this automatically on next launch.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

initObservability();
Notifications.setNotificationHandler(notificationHandler);

// Don't retry 4xx — the response won't get better. Retry 5xx / network errors
// with exponential backoff + jitter so a flaky cell connection or a Vercel
// cold-start gets a second chance without hammering the server.
function shouldRetry(failureCount: number, error: unknown, max: number) {
  if (failureCount >= max) return false;
  const status = (error as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return true;
}

function backoffDelay(attempt: number) {
  const base = 500 * 2 ** attempt; // 500, 1000, 2000…
  const jitter = Math.random() * 250;
  return Math.min(base + jitter, 8_000);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      retry: (count, err) => shouldRetry(count, err, 2),
      retryDelay: backoffDelay,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // One retry, only on network/5xx — guards against the cold-start
      // window without making double-writes likely on the happy path.
      retry: (count, err) => shouldRetry(count, err, 1),
      retryDelay: backoffDelay,
    },
  },
});

async function checkForOTAUpdate() {
  if (!Updates.isEnabled || __DEV__) return;
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (!isAvailable) return;
    await Updates.fetchUpdateAsync();
    captureMessage("OTA update fetched, reloading", "info");
    await Updates.reloadAsync();
  } catch (err) {
    captureException(err, { source: "expo-updates" });
  }
}

function RootLayout() {
  useEffect(() => {
    checkForOTAUpdate();
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as {
        type?: string;
        conversationId?: string;
        orderId?: string;
      };
      if (data?.type === "new_conversation" && data.conversationId) {
        router.push(`/inbox/${data.conversationId}`);
      } else if (data?.type === "assigned_message" && data.conversationId) {
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
      } else if (data?.type === "template_decision") {
        router.push("/(app)/campaigns/templates");
      } else if (data?.orderId) {
        router.push(`/inbox/${data.orderId}`);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default wrap(RootLayout);
