import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiFetch } from "./api";

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
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
};
