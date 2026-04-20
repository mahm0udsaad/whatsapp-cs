import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import {
  type CustomerDirectoryRow,
  deleteCustomer,
  findOrCreateConversationForPhone,
  listCustomersPaginated,
  updateCustomer,
} from "../../../lib/api";
import { ManagerCard, managerColors } from "../../../components/manager-ui";

/**
 * Mobile customer detail screen.
 *
 * We deliberately fetch a single-row page (page=1, pageSize=1, q=phone) instead
 * of inventing a `/customers/:id` GET — keeps the API surface tighter, and the
 * id is enough to resolve the row from the same paginated endpoint when paired
 * with a navigation-state hand-off (we just refetch using the cache below).
 */
export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  // Pull from any cached customers page to avoid an extra round-trip when
  // arriving from the list. Fall back to a quick API hit if the user deep-
  // links straight into the screen.
  const cached = qc.getQueriesData<{
    rows: CustomerDirectoryRow[];
  }>({ queryKey: ["customers"] });
  const initial = cached
    .flatMap(([, data]) => data?.rows ?? [])
    .find((r) => r?.id === id);

  const [row, setRow] = useState<CustomerDirectoryRow | null>(initial ?? null);
  const [name, setName] = useState<string>(initial?.full_name ?? "");
  const [optedOut, setOptedOut] = useState<boolean>(
    initial?.opted_out ?? false
  );

  const fetchQuery = useQuery({
    queryKey: ["customer-detail", id],
    enabled: !initial && !!id,
    queryFn: async () => {
      // Best-effort: hit the list filtered by phone wouldn't work without the
      // phone, so we just pull the first page and locate by id.
      const res = await listCustomersPaginated({ page: 1, pageSize: 200 });
      const found = res.rows.find((r) => r.id === id);
      if (!found) throw new Error("لم يتم العثور على العميل");
      return found;
    },
  });

  useEffect(() => {
    if (fetchQuery.data) {
      setRow(fetchQuery.data);
      setName(fetchQuery.data.full_name ?? "");
      setOptedOut(fetchQuery.data.opted_out);
    }
  }, [fetchQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCustomer(id!, {
        full_name: name.trim() || null,
        opted_out: optedOut,
      }),
    onSuccess: ({ customer }) => {
      setRow(customer);
      qc.invalidateQueries({ queryKey: ["customers"] });
      Alert.alert("تم الحفظ");
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "خطأ غير معروف"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      router.back();
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "خطأ غير معروف"),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      findOrCreateConversationForPhone(row!.phone_number),
    onSuccess: (conv) => {
      router.push({ pathname: "/inbox/[id]", params: { id: conv.id } });
    },
    onError: (e: unknown) =>
      Alert.alert(
        "تعذر فتح المحادثة",
        e instanceof Error ? e.message : "خطأ غير معروف"
      ),
  });

  if (!row) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F6F7F9]">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">
            معلومات العميل
          </Text>
          <View className="mt-3 flex-row-reverse items-center justify-between rounded-md bg-gray-50 px-3 py-2">
            <Text className="text-xs text-gray-500">الرقم</Text>
            <Text className="font-mono text-sm text-gray-950" style={{ textAlign: "left" }}>
              {row.phone_number}
            </Text>
          </View>
          <View className="mt-2 flex-row-reverse items-center justify-between rounded-md bg-gray-50 px-3 py-2">
            <Text className="text-xs text-gray-500">المصدر</Text>
            <Text className="text-sm text-gray-950">{row.source}</Text>
          </View>
          <View className="mt-2 flex-row-reverse items-center justify-between rounded-md bg-gray-50 px-3 py-2">
            <Text className="text-xs text-gray-500">آخر تواصل</Text>
            <Text className="text-sm text-gray-950">
              {row.last_seen_at
                ? format(new Date(row.last_seen_at), "yyyy-MM-dd HH:mm")
                : "—"}
            </Text>
          </View>
        </ManagerCard>

        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">
            الاسم
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="بدون اسم"
            placeholderTextColor={managerColors.muted}
            textAlign="right"
            className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
          />
          <View className="mt-3 flex-row-reverse items-center justify-between">
            <Text className="text-sm text-gray-700">ملغى الاشتراك</Text>
            <Switch value={optedOut} onValueChange={setOptedOut} />
          </View>
        </ManagerCard>

        <View className="mt-2 flex-row-reverse gap-2">
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 items-center rounded-lg bg-[#00A884] py-3"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-bold text-white">حفظ التعديلات</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => sendMutation.mutate()}
            disabled={sendMutation.isPending}
            className="flex-1 flex-row-reverse items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-3"
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color={managerColors.brand} />
            ) : (
              <>
                <Ionicons
                  name="chatbubble-ellipses"
                  size={16}
                  color={managerColors.brand}
                />
                <Text className="font-semibold text-emerald-900">
                  إرسال رسالة
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() =>
            Alert.alert(
              "حذف عميل",
              `هل أنت متأكد من حذف ${row.full_name ?? row.phone_number}؟`,
              [
                { text: "إلغاء", style: "cancel" },
                {
                  text: "حذف",
                  style: "destructive",
                  onPress: () => deleteMutation.mutate(),
                },
              ]
            )
          }
          className="mt-4 items-center rounded-lg border border-red-200 bg-red-50 py-3"
        >
          <Text className="font-semibold text-red-700">حذف العميل</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
