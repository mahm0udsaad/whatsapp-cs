import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
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
              "هل أنت متأكد من حذف الحساب؟ سيتم تسجيل خروجك فوراً.",
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
                          "حاول مرة أخرى أو راسل الدعم."
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
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      {manager ? (
        <View
          style={[
            styles.card,
            aiQuery.data?.enabled ? styles.cardActive : styles.cardDanger,
          ]}
        >
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
              <Text style={styles.cardEyebrow}>
                المساعد الذكي
              </Text>
              {aiQuery.isLoading ? (
                <View style={styles.skeletonAlign}>
                  <SkeletonBlock className="h-6 w-24 rounded-lg" />
                </View>
              ) : (
                <Text
                  style={[
                    styles.cardTitle,
                    aiQuery.data?.enabled ? styles.titleActive : styles.titleDanger,
                  ]}
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
            <View style={styles.descriptionSkeleton}>
              <SkeletonBlock className="h-3 w-64 rounded-lg" />
              <SkeletonBlock className="h-3 w-44 rounded-lg" />
            </View>
          ) : (
            <Text style={styles.descriptionText}>
              {aiQuery.data?.enabled
                ? "يرد المساعد تلقائياً على الرسائل الجديدة عندما يكون في وضع البوت."
                : "تم إيقاف الرد التلقائي لجميع المحادثات. الموظفون فقط يردون."}
            </Text>
          )}
        </View>
      ) : null}

      <View
        style={[
          styles.card,
          available ? styles.cardActive : styles.cardNeutral,
        ]}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardContent}>
            <Text style={styles.cardEyebrow}>
              حالتك الآن
            </Text>
            <Text
              style={[
                styles.cardTitle,
                available ? styles.titleActive : styles.titleMuted,
              ]}
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
        <Text style={styles.descriptionText}>
          {available
            ? "ستصلك إشعارات المحادثات الجديدة ويمكن توجيه العملاء إليك."
            : "لن يتم توجيه محادثات جديدة إليك أثناء إيقاف الاستلام."}
        </Text>
      </View>

      <View style={[styles.card, styles.cardNeutral]}>
        <Text style={styles.cardEyebrow}>المتجر</Text>
        <Text style={styles.storeName}>
          {member?.restaurant?.name ?? member?.restaurant_id ?? "—"}
        </Text>
        <Text style={styles.storeMeta}>
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
          style={styles.dashboardButton}
        >
          <Text style={styles.dashboardButtonText}>فتح لوحة التحكم</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onLogout}
        disabled={loggingOut || deleting}
        style={styles.logoutButton}
      >
        {loggingOut ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
        )}
      </Pressable>

      <Pressable
        onPress={onDeleteAccount}
        disabled={loggingOut || deleting}
        style={styles.deleteButton}
      >
        {deleting ? (
          <ActivityIndicator color="#dc2626" />
        ) : (
          <Text style={styles.deleteButtonText}>حذف الحساب</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F7F9",
    padding: 16,
  },
  card: {
    marginBottom: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  cardActive: {
    borderColor: "#D6DDF8",
    backgroundColor: "#EDF2FF",
  },
  cardDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  cardNeutral: {
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
  },
  cardRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardEyebrow: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "500",
    color: "#7A88B8",
  },
  skeletonAlign: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  cardTitle: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 20,
    fontWeight: "700",
  },
  titleActive: {
    color: "#16245C",
  },
  titleDanger: {
    color: "#7F1D1D",
  },
  titleMuted: {
    color: "#445179",
  },
  descriptionSkeleton: {
    marginTop: 12,
    alignItems: "flex-end",
    rowGap: 8,
  },
  descriptionText: {
    marginTop: 12,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 24,
    color: "#5E6A99",
  },
  storeName: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 18,
    fontWeight: "600",
    color: "#16245C",
  },
  storeMeta: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 14,
    color: "#5E6A99",
  },
  dashboardButton: {
    marginBottom: 12,
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
  },
  dashboardButtonText: {
    fontSize: 14,
    color: "#5E6A99",
  },
  logoutButton: {
    marginTop: 16,
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#DC2626",
    paddingVertical: 16,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  deleteButton: {
    marginTop: 12,
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#DC2626",
  },
});
