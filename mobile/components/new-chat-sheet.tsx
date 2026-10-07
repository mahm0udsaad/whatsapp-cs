import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { getApiErrorMessage, startNewChat } from "../lib/api";
import { managerColors } from "./manager-ui";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "./tw";

const E164 = /^\+[1-9]\d{1,14}$/;

/** Accepts +E.164, 00-prefixed, and Saudi local (05XXXXXXXX / 5XXXXXXXX). */
export function normalizePhone(raw: string): string {
  const digits = raw.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (/^05\d{8}$/.test(digits)) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  return digits;
}

/**
 * "New chat" bottom sheet: number + optional name → resolves/creates the
 * conversation and hands its id back so the caller can open the chat screen
 * (which then shows the template picker).
 */
export function NewChatSheet({
  visible,
  onClose,
  restaurantId,
  onStarted,
}: {
  visible: boolean;
  onClose: () => void;
  restaurantId: string;
  onStarted: (conversationId: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!visible) {
      setPhone("");
      setName("");
    }
  }, [visible]);

  const normalized = normalizePhone(phone);
  const valid = E164.test(normalized);

  const startMutation = useMutation({
    mutationFn: () =>
      startNewChat({
        restaurantId,
        phone_number: normalized,
        customer_name: name.trim() || null,
      }),
    onSuccess: (res) => onStarted(res.id),
    onError: (e: unknown) =>
      Alert.alert("تعذّر بدء المحادثة", getApiErrorMessage(e)),
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
            <View style={styles.grabber} />
            <View className="flex-row-reverse items-center justify-between">
              <Text className="text-right text-lg font-bold text-[#16245C]">
                محادثة جديدة
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={managerColors.muted} />
              </Pressable>
            </View>

            <Text className="mt-4 text-right text-xs font-bold text-[#5E6A99]">
              رقم الواتساب
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+9665XXXXXXXX"
              placeholderTextColor="#98A2B3"
              autoCapitalize="none"
              autoFocus
              keyboardType="phone-pad"
              className="mt-2 rounded-xl border border-[#D6DDF8] bg-white px-3 py-3 text-sm text-[#16245C]"
              style={{ textAlign: "left" }}
            />
            {phone.trim().length > 0 && !valid ? (
              <Text className="mt-1 text-right text-xs text-[#E11D48]">
                أدخل الرقم بالصيغة الدولية مثل ‎+9665XXXXXXXX
              </Text>
            ) : valid && normalized !== phone.trim() ? (
              <Text className="mt-1 text-right text-xs text-[#5E6A99]">
                سيتم استخدام ‎{normalized}
              </Text>
            ) : null}

            <Text className="mt-3 text-right text-xs font-bold text-[#5E6A99]">
              اسم العميل (اختياري)
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="مثال: أحمد"
              placeholderTextColor="#98A2B3"
              textAlign="right"
              className="mt-2 rounded-xl border border-[#D6DDF8] bg-white px-3 py-3 text-sm text-[#16245C]"
            />

            <Pressable
              onPress={() => startMutation.mutate()}
              disabled={!valid || startMutation.isPending}
              className="mt-5 h-12 flex-row-reverse items-center justify-center gap-2 rounded-2xl"
              style={{
                backgroundColor:
                  !valid || startMutation.isPending
                    ? "#B8C2E8"
                    : managerColors.brand,
              }}
            >
              {startMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="chatbubble-ellipses" size={16} color="#FFFFFF" />
                  <Text className="font-bold text-white">متابعة لاختيار القالب</Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D6DDF8",
    marginBottom: 10,
  },
});
