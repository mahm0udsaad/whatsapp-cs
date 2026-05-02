import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInWithPassword, loadTeamMemberships } from "../../lib/auth";
import {
  getOrCreateDeviceId,
  persistActiveTenant,
  useSessionStore,
} from "../../lib/session-store";
import { registerForPushNotificationsAsync } from "../../lib/push";
import type { TeamMemberRow } from "../../lib/supabase";
import { captureException, captureMessage } from "../../lib/observability";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<TeamMemberRow[] | null>(null);
  const setActiveMember = useSessionStore((s) => s.setActiveMember);

  async function onSubmit() {
    setErr(null);
    setLoading(true);
    try {
      const session = await signInWithPassword(email, password);
      if (!session?.user) throw new Error("لا توجد جلسة");
      const ms = await loadTeamMemberships(session.user.id);
      if (ms.length === 0) {
        setErr(
          "حسابك غير مفعّل كموظف. اطلب من المالك تفعيل حسابك في لوحة الإدارة."
        );
        return;
      }
      if (ms.length === 1) {
        await finalize(ms[0]);
      } else {
        setMemberships(ms);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  async function finalize(m: TeamMemberRow) {
    setActiveMember(m);
    await persistActiveTenant(m.id);
    try {
      const deviceId = await getOrCreateDeviceId();
      const result = await registerForPushNotificationsAsync(
        m.restaurant_id,
        deviceId
      );
      if (result.status === "skipped") {
        captureMessage("Push registration skipped", "info", {
          reason: result.reason,
          teamMemberId: m.id,
        });
        if (result.reason === "permission-denied") {
          // Push is the only way the agent learns about new conversations
          // when the app is backgrounded — make this visible, not silent.
          Alert.alert(
            "الإشعارات معطّلة",
            "لن تصلك تنبيهات بالمحادثات الجديدة. يمكنكِ تفعيل الإشعارات من إعدادات النظام.",
            [
              { text: "ليس الآن", style: "cancel" },
              {
                text: "فتح الإعدادات",
                onPress: () => Linking.openSettings(),
              },
            ]
          );
        }
      }
    } catch (e) {
      captureException(e, {
        source: "push-registration",
        teamMemberId: m.id,
      });
    }
    router.replace("/(app)/inbox");
  }

  if (memberships) {
    return (
      <SafeAreaView className="flex-1 bg-white p-6">
        <Text className="text-2xl font-bold mb-4 text-right">اختر المتجر</Text>
        {memberships.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => finalize(m)}
            className="border border-gray-200 rounded-xl p-4 mb-3"
          >
            <Text className="text-lg text-right">
              {m.restaurant?.name ?? m.restaurant_id}
            </Text>
            <Text className="text-sm text-gray-500 text-right">
              {m.role === "admin" ? "مدير" : "موظف"}
            </Text>
          </Pressable>
        ))}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white p-6 justify-center">
      <Text className="text-3xl font-bold text-center mb-2">لوحة الموظفين</Text>
      <Text className="text-center text-gray-500 mb-8">
        تسجيل دخول الموظفات
      </Text>

      <TextInput
        className="border border-gray-300 rounded-xl px-4 py-3 mb-3 text-right"
        placeholder="البريد الإلكتروني"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="border border-gray-300 rounded-xl px-4 py-3 mb-4 text-right"
        placeholder="كلمة المرور"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {err && (
        <Text className="text-red-600 text-center mb-3 text-sm">{err}</Text>
      )}

      <Pressable
        onPress={onSubmit}
        disabled={loading}
        className="bg-brand rounded-xl py-4 items-center"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold text-lg">دخول</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
