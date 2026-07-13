import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
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
import { managerColors, softShadow } from "../../components/manager-ui";

const colors = {
  ink: managerColors.ink,
  muted: managerColors.muted,
  subtle: "#7A88B8",
  brand: managerColors.brand,
  line: managerColors.border,
  input: managerColors.surfaceMuted,
  error: managerColors.danger,
  errorBg: "#FFF1F2",
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<TeamMemberRow[] | null>(null);
  const setActiveMember = useSessionStore((s) => s.setActiveMember);

  async function onSubmit() {
    if (loading) return;
    setErr(null);
    setLoading(true);
    try {
      const session = await signInWithPassword(email, password);
      if (!session?.user) throw new Error("لا توجد جلسة");
      const ms = await loadTeamMemberships(session.user.id);
      if (ms.length === 0) {
        setErr("حسابك غير مفعّل كموظف. اطلب من المالك تفعيل حسابك في لوحة الإدارة.");
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

  async function finalize(member: TeamMemberRow) {
    setActiveMember(member);
    await persistActiveTenant(member.id);
    try {
      const deviceId = await getOrCreateDeviceId();
      const result = await registerForPushNotificationsAsync(member.restaurant_id, deviceId);
      if (result.status === "skipped") {
        captureMessage("Push registration skipped", "info", {
          reason: result.reason,
          teamMemberId: member.id,
        });
      }
    } catch (e) {
      captureException(e, { source: "push-registration", teamMemberId: member.id });
    }
    router.replace("/(gateway)/select");
  }

  if (memberships) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: managerColors.bg }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 24, gap: 16 }}
        >
          <View style={{ gap: 6, marginBottom: 8 }}>
            <Text style={{ color: colors.brand, fontSize: 13, fontWeight: "800", textAlign: "right" }}>
              خطوة أخيرة
            </Text>
            <Text selectable style={{ color: colors.ink, fontSize: 29, fontWeight: "800", textAlign: "right" }}>
              اختر متجرك
            </Text>
            <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: "right" }}>
              لديك صلاحية للوصول إلى أكثر من متجر.
            </Text>
          </View>
          {memberships.map((member) => (
            <Pressable
              key={member.id}
              onPress={() => finalize(member)}
              disabled={loading}
              style={({ pressed }) => ({
                minHeight: 76,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: pressed ? colors.brand : colors.line,
                backgroundColor: managerColors.surface,
                padding: 17,
                ...softShadow,
                opacity: loading ? 0.65 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <Text selectable style={{ color: colors.ink, fontSize: 17, fontWeight: "700", textAlign: "right" }}>
                {member.restaurant?.name ?? member.restaurant_id}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, textAlign: "right" }}>
                {member.role === "admin" ? "مدير" : "موظف"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: managerColors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        >
          <View style={{ width: "100%", maxWidth: 430, alignSelf: "center" }}>
            <View style={{ alignItems: "center", marginBottom: 28, gap: 14 }}>
              <View style={{ width: 116, height: 116, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: managerColors.brandSoft, borderWidth: 1, borderColor: managerColors.border, ...softShadow }}>
                <View style={{ width: 92, height: 92, borderRadius: 28, overflow: "hidden", backgroundColor: colors.brand }}>
                  <Image source={require("../../assets/logo.png")} style={{ width: 92, height: 92 }} resizeMode="contain" />
                </View>
                <View style={{ position: "absolute", right: 4, bottom: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: managerColors.bot, borderWidth: 4, borderColor: managerColors.bg }} />
              </View>
              <View style={{ alignItems: "center", gap: 5 }}>
                <Text style={{ color: colors.brand, fontSize: 13, fontWeight: "800" }}>لوحة الموظفين</Text>
                <Text selectable style={{ color: colors.ink, fontSize: 31, fontWeight: "800", letterSpacing: -0.5, textAlign: "center" }}>
                  أهلاً بعودتك
                </Text>
                <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: "center" }}>
                  أدخل بياناتك للوصول إلى مساحة عملك.
                </Text>
              </View>
            </View>

            <View style={{ backgroundColor: managerColors.surface, borderRadius: 28, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 18, ...softShadow }}>
              {err ? (
                <Text selectable accessibilityRole="alert" style={{ color: colors.error, backgroundColor: colors.errorBg, borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 20, textAlign: "right" }}>
                  {err}
                </Text>
              ) : null}

              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700", textAlign: "right" }}>البريد الإلكتروني</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="أدخل بريدك الإلكتروني"
                  placeholderTextColor={colors.subtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  editable={!loading}
                  style={{ height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.input, paddingHorizontal: 15, color: colors.ink, fontSize: 16, textAlign: "right" }}
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700", textAlign: "right" }}>كلمة المرور</Text>
                <View>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="أدخل كلمة المرور"
                    placeholderTextColor={colors.subtle}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    editable={!loading}
                    style={{ height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.input, paddingHorizontal: 15, paddingLeft: 70, color: colors.ink, fontSize: 16, textAlign: "right" }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((visible) => !visible)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    hitSlop={8}
                    style={{ position: "absolute", left: 8, top: 4, minWidth: 56, height: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "700" }}>{showPassword ? "إخفاء" : "إظهار"}</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={onSubmit}
                disabled={loading || !email.trim() || !password}
                accessibilityRole="button"
                accessibilityLabel="تسجيل الدخول"
                style={({ pressed }) => ({ height: 52, borderRadius: 13, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", opacity: loading || !email.trim() || !password ? 0.55 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
              >
                {loading ? (
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 9 }}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>جارٍ التحقق...</Text>
                  </View>
                ) : (
                  <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>تسجيل الدخول</Text>
                )}
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={{ color: colors.subtle, fontSize: 12, textAlign: "center" }}>
                {loading ? "يتم تجهيز مساحة العمل الخاصة بك" : "دخول آمن ومشفّر"}
              </Text>
            </View>

            <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 22 }}>
              تحتاج إلى دعوة من مالك المتجر لتسجيل الدخول.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
