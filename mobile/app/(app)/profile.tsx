import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut } from "../../lib/auth";
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ProfileScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const setActiveMember = useSessionStore((s) => s.setActiveMember);
  const [available, setAvailableLocal] = useState(member?.is_available ?? true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
        console.warn("[logout] disablePushToken failed", e);
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
        console.warn("[logout] supabase signOut failed", e);
      }
    })();
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F4F3EF] p-4" edges={["bottom"]}>
      {manager ? (
        <View
          className={`mb-3 rounded-lg border p-4 ${
            aiQuery.data?.enabled
              ? "border-indigo-100 bg-indigo-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <View className="flex-row-reverse items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-right text-xs font-medium text-gray-500">
                المساعد الذكي
              </Text>
              {aiQuery.isLoading ? (
                <View className="mt-2 items-end">
                  <SkeletonBlock className="h-6 w-24 rounded-lg" />
                </View>
              ) : (
                <Text
                  className={`mt-1 text-right text-xl font-bold ${
                    aiQuery.data?.enabled ? "text-indigo-900" : "text-red-900"
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
            <Text className="mt-3 text-right text-sm leading-6 text-gray-600">
              {aiQuery.data?.enabled
                ? "يرد المساعد تلقائياً على الرسائل الجديدة عندما يكون في وضع البوت."
                : "تم إيقاف الرد التلقائي لجميع المحادثات. الموظفون فقط يردون."}
            </Text>
          )}
        </View>
      ) : null}

      <View
        className={`mb-3 rounded-lg border p-4 ${
          available
            ? "border-emerald-100 bg-emerald-50"
            : "border-gray-100 bg-white"
        }`}
      >
        <View className="flex-row-reverse items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-right text-xs font-medium text-gray-500">
              حالتك الآن
            </Text>
            <Text
              className={`mt-1 text-right text-xl font-bold ${
                available ? "text-emerald-900" : "text-gray-950"
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
        <Text className="mt-3 text-right text-sm leading-6 text-gray-600">
          {available
            ? "ستصلك إشعارات المحادثات الجديدة ويمكن توجيه العملاء إليك."
            : "لن يتم توجيه محادثات جديدة إليك أثناء إيقاف الاستلام."}
        </Text>
      </View>

      <View className="mb-3 rounded-lg border border-stone-200 bg-[#FFFDF8] p-4">
        <Text className="text-right text-xs font-medium text-gray-500">المتجر</Text>
        <Text className="mt-1 text-right text-lg font-semibold text-gray-950">
          {member?.restaurant?.name ?? member?.restaurant_id ?? "—"}
        </Text>
        <Text className="mt-2 text-right text-sm text-gray-600">
          {member?.full_name ?? ""} - {member?.role === "admin" ? "مدير" : "موظف"}
        </Text>
      </View>

      {manager ? (
        <Pressable
          onPress={() => {
            const base = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";
            if (base) Linking.openURL(`${base}/dashboard`);
          }}
          className="mb-3 items-center rounded-lg border border-stone-200 bg-[#FFFDF8] py-3"
        >
          <Text className="text-sm text-gray-700">فتح لوحة التحكم</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onLogout}
        disabled={loggingOut}
        className="mt-4 items-center rounded-lg bg-red-600 py-4"
      >
        {loggingOut ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold">تسجيل الخروج</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
