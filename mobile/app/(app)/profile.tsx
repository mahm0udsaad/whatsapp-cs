import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAccount, signOut } from "../../lib/auth";
import { getAiStatus, setAvailability, toggleAi } from "../../lib/api";
import { disablePushToken } from "../../lib/push";
import {
  clearActiveTenant,
  getOrCreateDeviceId,
  useSessionStore,
} from "../../lib/session-store";
import { isManager } from "../../lib/roles";
import { qk } from "../../lib/query-keys";
import { SkeletonBlock } from "../../components/manager-ui";
import { captureException } from "../../lib/observability";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ProfileScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const setActiveMember = useSessionStore((s) => s.setActiveMember);
  const [available, setAvailableLocal] = useState(member?.is_available ?? true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const manager = isManager(member);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();

  const aiQuery = useQuery({
    queryKey: qk.aiStatus(restaurantId),
    enabled: manager && !!restaurantId,
    queryFn: getAiStatus,
  });

  const toggleAiMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleAi(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.aiStatus(restaurantId) });
    },
    onError: (e: unknown) => {
      Alert.alert("خطأ", getErrorMessage(e, "تعذر التحديث"));
    },
  });

  function confirmToggleAi(target: boolean) {
    if (target === false) {
      Alert.alert(
        "إيقاف المساعد الذكي",
        "هل أنت متأكد؟ سيتوقف الرد التلقائي لجميع المحادثات.",
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "إيقاف",
            style: "destructive",
            onPress: () => toggleAiMutation.mutate(false),
          },
        ]
      );
    } else {
      toggleAiMutation.mutate(true);
    }
  }

  async function onToggle(val: boolean) {
    setAvailableLocal(val);
    setSaving(true);
    try {
      await setAvailability(val);
      if (member) setActiveMember({ ...member, is_available: val });
    } catch (e: unknown) {
      setAvailableLocal(!val);
      Alert.alert("خطأ", getErrorMessage(e, "تعذر التحديث"));
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    // Sign-out must never block on the network: best-effort teardown runs in
    // the background, local state and navigation happen synchronously so the
    // user always leaves the app even if the backend is unreachable.
    setLoggingOut(true);
    const memberSnapshot = member;

    // 1. Local state + navigation first — guaranteed to unblock the UI.
    setActiveMember(null);
    try {
      await clearActiveTenant();
    } catch {
      // SecureStore errors are non-fatal for sign-out.
    }
    router.replace("/(auth)/login");

    // 2. Fire-and-forget: revoke the Supabase session and disable the push
    //    token. Timeouts are enforced at the fetch layer (apiFetch) and on
    //    signOut() by racing against a short deadline.
    void (async () => {
      try {
        if (memberSnapshot) {
          const deviceId = await getOrCreateDeviceId();
          await disablePushToken(deviceId, memberSnapshot.restaurant_id);
        }
      } catch (e) {
        captureException(e, { source: "logout-disable-push" });
      }
      try {
        await Promise.race([
          signOut(),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("signOut timeout")),
              10_000
            )
          ),
        ]);
      } catch (e) {
        captureException(e, { source: "logout-supabase-signout" });
      }
    })();
  }

  // Account deletion is required by Apple App Store guideline 5.1.1(v) for
  // every app that lets users create an account. We confirm twice — once for
  // the destructive intent, once as a final "are you sure" — then call the
  // backend to hard-delete the account. The local client follows up with a
  // sign-out so no stale token remains.
  function onDeleteAccount() {
    Alert.alert(
      "حذف الحساب",
      "سيتم حذف حسابك وجميع بياناتك بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "متابعة",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "تأكيد نهائي",
              "هل أنتِ متأكدة من حذف الحساب؟ سيتم تسجيل خروجك فوراً.",
              [
                { text: "إلغاء", style: "cancel" },
                {
                  text: "حذف نهائي",
                  style: "destructive",
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await deleteAccount();
                    } catch (e) {
                      captureException(e, { source: "delete-account" });
                      setDeleting(false);
                      Alert.alert(
                        "تعذّر حذف الحساب",
                        getErrorMessage(
                          e,
                          "حاولي مرة أخرى أو راسلي الدعم."
                        )
                      );
                      return;
                    }
                    setActiveMember(null);
                    try {
                      await clearActiveTenant();
                    } catch {
                      // Non-fatal — local store will be reset on next launch.
                    }
                    router.replace("/(auth)/login");
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9] p-4" edges={["bottom"]}>
      {manager ? (
        <View
          className={`mb-3 rounded-[22px] border p-4 ${
            aiQuery.data?.enabled
              ? "border-[#D6DDF8] bg-[#EDF2FF]"
              : "border-red-200 bg-red-50"
          }`}
        >
          <View className="flex-row-reverse items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-right text-xs font-medium text-[#7A88B8]">
                المساعد الذكي
              </Text>
              {aiQuery.isLoading ? (
                <View className="mt-2 items-end">
                  <SkeletonBlock className="h-6 w-24 rounded-lg" />
                </View>
              ) : (
                <Text
                  className={`mt-1 text-right text-xl font-bold ${
                    aiQuery.data?.enabled ? "text-[#16245C]" : "text-red-900"
                  }`}
                >
                  {aiQuery.data?.enabled ? "مُفعّل" : "متوقف"}
                </Text>
              )}
            </View>
            {toggleAiMutation.isPending ? (
              <ActivityIndicator />
            ) : (
              <Switch
                value={!!aiQuery.data?.enabled}
                onValueChange={(v) => confirmToggleAi(v)}
              />
            )}
          </View>
          {aiQuery.isLoading ? (
            <View className="mt-3 items-end gap-2">
              <SkeletonBlock className="h-3 w-64 rounded-lg" />
              <SkeletonBlock className="h-3 w-44 rounded-lg" />
            </View>
          ) : (
            <Text className="mt-3 text-right text-sm leading-6 text-[#5E6A99]">
              {aiQuery.data?.enabled
                ? "يرد المساعد تلقائياً على الرسائل الجديدة عندما يكون في وضع البوت."
                : "تم إيقاف الرد التلقائي لجميع المحادثات. الموظفون فقط يردون."}
            </Text>
          )}
        </View>
      ) : null}

      <View
        className={`mb-3 rounded-[22px] border p-4 ${
          available
            ? "border-[#D6DDF8] bg-[#EDF2FF]"
            : "border-[#E7EBFB] bg-white"
        }`}
      >
        <View className="flex-row-reverse items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-right text-xs font-medium text-[#7A88B8]">
              حالتك الآن
            </Text>
            <Text
              className={`mt-1 text-right text-xl font-bold ${
                available ? "text-[#16245C]" : "text-[#445179]"
              }`}
            >
              {available ? "متاح لاستلام المحادثات" : "غير متاح للاستلام"}
            </Text>
          </View>
          {saving ? (
            <ActivityIndicator />
          ) : (
            <Switch value={available} onValueChange={onToggle} />
          )}
        </View>
        <Text className="mt-3 text-right text-sm leading-6 text-[#5E6A99]">
          {available
            ? "ستصلك إشعارات المحادثات الجديدة ويمكن توجيه العملاء إليك."
            : "لن يتم توجيه محادثات جديدة إليك أثناء إيقاف الاستلام."}
        </Text>
      </View>

      <View className="mb-3 rounded-[22px] border border-[#E7EBFB] bg-white p-4">
        <Text className="text-right text-xs font-medium text-[#7A88B8]">المتجر</Text>
        <Text className="mt-1 text-right text-lg font-semibold text-[#16245C]">
          {member?.restaurant?.name ?? member?.restaurant_id ?? "—"}
        </Text>
        <Text className="mt-2 text-right text-sm text-[#5E6A99]">
          {member?.full_name ?? ""} - {member?.role === "admin" ? "مدير" : "موظف"}
        </Text>
      </View>

      {/*
        The "Open Web Dashboard" shortcut is hidden on iOS to keep the App
        Store build from looking like a thin wrapper around a website
        (rejection vector under guideline 4.2 Minimum Functionality / 4.3
        Spam). Managers on iOS can still reach the dashboard through any
        browser. On Android we keep the shortcut.
      */}
      {manager && Platform.OS !== "ios" ? (
        <Pressable
          onPress={() => {
            const base = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
            if (base) Linking.openURL(`${base}/dashboard`);
          }}
          className="mb-3 items-center rounded-[22px] border border-[#E7EBFB] bg-white py-3"
        >
          <Text className="text-sm text-[#5E6A99]">فتح لوحة التحكم</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onLogout}
        disabled={loggingOut || deleting}
        className="mt-4 items-center rounded-[22px] bg-red-600 py-4"
      >
        {loggingOut ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold">تسجيل الخروج</Text>
        )}
      </Pressable>

      <Pressable
        onPress={onDeleteAccount}
        disabled={loggingOut || deleting}
        className="mt-3 items-center rounded-[22px] border border-red-200 bg-white py-3"
      >
        {deleting ? (
          <ActivityIndicator color="#dc2626" />
        ) : (
          <Text className="text-sm font-medium text-red-600">حذف الحساب</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
