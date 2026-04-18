import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { signOut } from "../../lib/auth";
import { setAvailability } from "../../lib/api";
import { disablePushToken } from "../../lib/push";
import {
  clearActiveTenant,
  getOrCreateDeviceId,
  useSessionStore,
} from "../../lib/session-store";

export default function ProfileScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const setActiveMember = useSessionStore((s) => s.setActiveMember);
  const [available, setAvailableLocal] = useState(member?.is_available ?? true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function onToggle(val: boolean) {
    setAvailableLocal(val);
    setSaving(true);
    try {
      await setAvailability(val);
      if (member) setActiveMember({ ...member, is_available: val });
    } catch (e: any) {
      setAvailableLocal(!val);
      Alert.alert("خطأ", e?.message ?? "تعذر التحديث");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    setLoggingOut(true);
    try {
      if (member) {
        const deviceId = await getOrCreateDeviceId();
        await disablePushToken(deviceId, member.restaurant_id);
      }
      await signOut();
      await clearActiveTenant();
      setActiveMember(null);
      router.replace("/(auth)/login");
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "تعذر تسجيل الخروج");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 p-4" edges={["bottom"]}>
      <View className="bg-white rounded-2xl p-4 mb-3 border border-gray-100">
        <Text className="text-xs text-gray-500 text-right">المطعم</Text>
        <Text className="text-lg font-semibold text-right mt-1">
          {member?.restaurant?.name ?? member?.restaurant_id ?? "—"}
        </Text>
        <Text className="text-sm text-gray-600 text-right mt-2">
          {member?.full_name ?? ""} — {member?.role === "admin" ? "مدير" : "موظف"}
        </Text>
      </View>

      <View className="bg-white rounded-2xl p-4 mb-3 border border-gray-100 flex-row justify-between items-center">
        <View className="flex-1">
          <Text className="text-base font-semibold text-right">متاح للاستلام</Text>
          <Text className="text-xs text-gray-500 text-right mt-1">
            عند الإطفاء لن تصلك إشعارات الاستفسارات
          </Text>
        </View>
        {saving ? (
          <ActivityIndicator />
        ) : (
          <Switch value={available} onValueChange={onToggle} />
        )}
      </View>

      <Pressable
        onPress={onLogout}
        disabled={loggingOut}
        className="bg-red-600 rounded-xl py-4 items-center mt-4"
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
