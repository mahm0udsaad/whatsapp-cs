import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, RefreshControl } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "../../../components/tw";
import {
  createHubStaff,
  deleteHubStaff,
  listHubStaff,
  updateHubStaff,
  type HubStaff,
} from "../../../lib/hub-api";
import { getApiErrorMessage } from "../../../lib/api";
import { useHubRepairGuard } from "../../../hooks/use-hub";
import {
  ListSkeleton,
  StatusPill,
  managerColors,
  softShadow,
} from "../../../components/manager-ui";
import { EmptyState, ErrorState } from "../../../components/list-state";

export default function HubStaffScreen() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const query = useQuery({
    queryKey: ["hub", "staff"],
    queryFn: () => listHubStaff(),
  });
  useHubRepairGuard(query.error);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["hub", "staff"] });
  }

  const create = useMutation({
    mutationFn: () => createHubStaff({ name: name.trim(), phone: phone.trim() }),
    onSuccess: () => {
      invalidate();
      setName("");
      setPhone("");
      setAdding(false);
    },
    onError: (e) => Alert.alert("تعذّر الإضافة", getApiErrorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: (m: HubStaff) => updateHubStaff(m.id, { status: !m.status }),
    onSuccess: invalidate,
    onError: (e) => Alert.alert("تعذّر التحديث", getApiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteHubStaff(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert("تعذّر الحذف", getApiErrorMessage(e)),
  });

  function confirmRemove(m: HubStaff) {
    Alert.alert("حذف الموظف", `هل تريد حذف "${m.name ?? "الموظف"}"؟`, [
      { text: "تراجع", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => remove.mutate(m.id) },
    ]);
  }

  const canCreate = name.trim().length > 1 && phone.trim().length > 5;

  return (
    <View className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={query.refetch}
            tintColor={managerColors.brand}
          />
        }
        ListHeaderComponent={
          <View className="mb-2">
            {adding ? (
              <View
                className="rounded-[20px] border bg-white p-4"
                style={[{ borderColor: managerColors.border }, softShadow]}
              >
                <TextInput
                  className="mb-2 rounded-xl border px-3 py-2.5 text-right"
                  style={{ borderColor: managerColors.border, color: managerColors.ink }}
                  placeholder="اسم الموظف"
                  placeholderTextColor={managerColors.muted}
                  value={name}
                  onChangeText={setName}
                />
                <TextInput
                  className="mb-3 rounded-xl border px-3 py-2.5 text-right"
                  style={{ borderColor: managerColors.border, color: managerColors.ink }}
                  placeholder="رقم الهاتف"
                  placeholderTextColor={managerColors.muted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                <View className="flex-row-reverse gap-2">
                  <Pressable
                    onPress={() => create.mutate()}
                    disabled={!canCreate || create.isPending}
                    className="flex-1 items-center rounded-xl py-2.5"
                    style={{
                      backgroundColor: managerColors.brand,
                      opacity: !canCreate || create.isPending ? 0.5 : 1,
                    }}
                  >
                    {create.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="font-semibold text-white">حفظ</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => setAdding(false)}
                    className="flex-1 items-center rounded-xl border py-2.5"
                    style={{ borderColor: managerColors.border }}
                  >
                    <Text style={{ color: managerColors.muted }}>إلغاء</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setAdding(true)}
                className="items-center rounded-xl border border-dashed py-3"
                style={{ borderColor: managerColors.brand }}
              >
                <Text className="font-semibold" style={{ color: managerColors.brand }}>
                  + إضافة موظف
                </Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <ListSkeleton count={5} />
          ) : query.isError ? (
            <ErrorState onRetry={query.refetch} />
          ) : (
            <EmptyState
              icon="people-outline"
              title="لا يوجد موظفون"
              description="أضف أول موظف لفريق العمل."
            />
          )
        }
        renderItem={({ item }) => (
          <View
            className="rounded-[20px] border bg-white p-4"
            style={[{ borderColor: managerColors.border }, softShadow]}
          >
            <View className="flex-row-reverse items-center justify-between">
              <Text
                className="flex-1 text-right text-base font-bold"
                style={{ color: managerColors.ink }}
                numberOfLines={1}
              >
                {item.name ?? `موظف #${item.id}`}
              </Text>
              <StatusPill
                label={item.status === false ? "متوقف" : "نشط"}
                tone={item.status === false ? "neutral" : "success"}
              />
            </View>
            {item.phone ? (
              <Text
                className="mt-1 text-right text-xs"
                style={{ color: managerColors.muted }}
              >
                {item.phone}
              </Text>
            ) : null}
            <View className="mt-3 flex-row-reverse gap-2">
              <Pressable
                onPress={() => toggle.mutate(item)}
                disabled={toggle.isPending}
                className="rounded-lg border px-3 py-1.5"
                style={{ borderColor: managerColors.border }}
              >
                <Text className="text-xs font-semibold" style={{ color: managerColors.brand }}>
                  {item.status === false ? "تفعيل" : "إيقاف"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => confirmRemove(item)}
                disabled={remove.isPending}
                className="rounded-lg border px-3 py-1.5"
                style={{ borderColor: managerColors.danger }}
              >
                <Text className="text-xs font-semibold" style={{ color: managerColors.danger }}>
                  حذف
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
