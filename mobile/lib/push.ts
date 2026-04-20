import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiFetch } from "./api";
import { getActiveConv } from "./active-conv";

export type PushRegistrationResult =
  | { status: "ok"; token: string }
  | { status: "skipped"; reason: string };

export async function registerForPushNotificationsAsync(
  restaurantId: string,
  deviceId: string
): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { status: "skipped", reason: "not-a-physical-device" };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("escalations", {
      name: "Escalations",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lightColor: "#25D366",
    });
    // New-booking channel. Lower importance than escalations so the owner
    // can tell them apart in do-not-disturb schedules; still high enough to
    // hit the lockscreen.
    await Notifications.setNotificationChannelAsync("reservations", {
      name: "Reservations",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      sound: "default",
      lightColor: "#25D366",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") {
    return { status: "skipped", reason: "permission-denied" };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  const token = (
    await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )
  ).data;

  await apiFetch("/api/mobile/push-token", {
    method: "POST",
    body: JSON.stringify({
      expoToken: token,
      deviceId,
      platform: Platform.OS,
      restaurantId,
    }),
  });

  return { status: "ok", token };
}

export async function disablePushToken(deviceId: string, restaurantId: string) {
  try {
    await apiFetch("/api/mobile/push-token/disable", {
      method: "POST",
      body: JSON.stringify({ deviceId, restaurantId }),
    });
  } catch (e) {
    console.warn("[push] disable failed", e);
  }
}

export const notificationHandler: Notifications.NotificationHandler = {
  handleNotification: async (notification) => {
    // Suppress the in-app banner + sound when a push arrives for the same
    // conversation the user is already viewing. The realtime subscription
    // has already appended the message to the chat — popping a banner over
    // it would be noise. Badge is still updated so the app icon count is
    // accurate regardless.
    const data = (notification.request.content.data ?? {}) as {
      conversationId?: string;
    };
    const active = getActiveConv();
    const isOnSameConv =
      !!data.conversationId && !!active && data.conversationId === active;

    return {
      shouldShowAlert: !isOnSameConv,
      shouldShowBanner: !isOnSameConv,
      shouldShowList: true,
      shouldPlaySound: !isOnSameConv,
      shouldSetBadge: true,
    };
  },
};
