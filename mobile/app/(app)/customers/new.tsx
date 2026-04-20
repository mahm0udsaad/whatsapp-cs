import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { createCustomer } from "../../../lib/api";
import { ManagerCard, managerColors } from "../../../components/manager-ui";

const E164 = /^\+[1-9]\d{1,14}$/;

export default function NewCustomerScreen() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");

  const createMutation = useMutation({
    mutationFn: () => {
      if (!E164.test(phone.trim())) throw new Error("الرقم يجب أن يكون E.164");
      return createCustomer({
        phone_number: phone.trim(),
        full_name: name.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      router.back();
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "خطأ غير معروف"),
  });

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      <View className="p-3">
        <ManagerCard>
          <Text className="text-right text-xs font-bold text-gray-500">
            رقم الهاتف (E.164)
          </Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+9665XXXXXXXX"
            placeholderTextColor={managerColors.muted}
            autoCapitalize="none"
            keyboardType="phone-pad"
            className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
            style={{ textAlign: "left" }}
          />
          <Text className="mt-3 text-right text-xs font-bold text-gray-500">
            الاسم (اختياري)
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="مثال: عميل وفي"
            placeholderTextColor={managerColors.muted}
            textAlign="right"
            className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
          />
        </ManagerCard>

        <View className="mt-4 flex-row-reverse gap-2">
          <Pressable
            disabled={createMutation.isPending || !phone.trim()}
            onPress={() => createMutation.mutate()}
            className={`flex-1 items-center rounded-lg py-3 ${
              !phone.trim() ? "bg-[#B6E5D6]" : "bg-[#00A884]"
            }`}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-bold text-white">حفظ</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            className="flex-1 items-center rounded-lg border border-gray-200 py-3"
          >
            <Text className="font-semibold text-gray-700">إلغاء</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
