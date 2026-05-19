import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "../../components/tw";
import { pairHub } from "../../lib/hub-api";
import { getApiErrorMessage } from "../../lib/api";
import { managerColors, softShadow } from "../../components/manager-ui";

export default function HubPairScreen() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const canSubmit = email.trim().length > 3 && code.trim().length >= 4;

  async function onSubmit() {
    if (!canSubmit || loading) return;
    setErr(null);
    setLoading(true);
    try {
      await pairHub(email.trim(), code.trim());
      await queryClient.invalidateQueries({ queryKey: ["hub", "status"] });
      router.replace("/(hub)/(tabs)/dashboard");
    } catch (e) {
      setErr(getApiErrorMessage(e, "فشل الربط. أنشئ رمزًا جديدًا وحاول مجددًا."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      <View className="flex-row-reverse items-center px-4 py-3">
        <Pressable onPress={() => router.replace("/(gateway)/select")} hitSlop={8}>
          <Ionicons name="chevron-forward" size={26} color={managerColors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-8 items-center">
          <Image
            source={require("../../assets/logo.png")}
            style={{ width: 76, height: 76, marginBottom: 14 }}
            resizeMode="contain"
          />
          <Text className="text-2xl font-bold" style={{ color: managerColors.ink }}>
            ربط نِحجز هَب
          </Text>
        </View>

        <View
          className="rounded-[24px] border bg-white p-5"
          style={[{ borderColor: managerColors.border }, softShadow]}
        >
          <Text
            className="mb-4 text-right text-xs leading-6"
            style={{ color: managerColors.muted }}
          >
            من لوحة تحكم نِحجز، أنشئ رمز ربط مكوّن من 6 أرقام، ثم أدخل بريدك
            الإلكتروني والرمز هنا. الرمز صالح لمدة 5 دقائق ويُستخدم مرة واحدة.
          </Text>

          <TextInput
            className="mb-3 rounded-xl border px-4 py-3 text-right"
            style={{ borderColor: managerColors.border, color: managerColors.ink }}
            placeholder="البريد الإلكتروني"
            placeholderTextColor={managerColors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            className="mb-4 rounded-xl border px-4 py-3 text-center text-lg tracking-[8px]"
            style={{ borderColor: managerColors.border, color: managerColors.ink }}
            placeholder="رمز الربط"
            placeholderTextColor={managerColors.muted}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
          />

          {err ? (
            <Text className="mb-3 text-center text-sm" style={{ color: managerColors.danger }}>
              {err}
            </Text>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit || loading}
            className="items-center rounded-xl py-4"
            style={{
              backgroundColor: managerColors.brand,
              opacity: !canSubmit || loading ? 0.5 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-semibold text-white">ربط الحساب</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
