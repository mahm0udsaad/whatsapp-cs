import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { format } from "date-fns";
import {
  type CustomerDirectoryRow,
  findOrCreateConversationForPhone,
  listCustomersPaginated,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors } from "../../../components/manager-ui";

const PAGE_SIZE = 30;
const SELECTED_PHONES_STORAGE_KEY =
  "whatsapp-cs:campaign-prefill-phones";

type FilterMode = "all" | "active" | "opted_out";

export default function CustomersListScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [page, setPage] = useState(1);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filter]);

  const customersQuery = useQuery({
    queryKey: qk.customers(restaurantId, debouncedQ, page, filter),
    enabled: !!restaurantId,
    queryFn: () =>
      listCustomersPaginated({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
        optedOut:
          filter === "active" ? false : filter === "opted_out" ? true : null,
      }),
  });

  const rows: CustomerDirectoryRow[] = customersQuery.data?.rows ?? [];
  const total = customersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openConversationMutation = useMutation({
    mutationFn: (row: CustomerDirectoryRow) =>
      findOrCreateConversationForPhone(row.phone_number),
    onSuccess: (conv) => {
      router.push({ pathname: "/inbox/[id]", params: { id: conv.id } });
    },
    onError: (e: unknown) =>
      Alert.alert(
        "تعذر فتح المحادثة",
        e instanceof Error ? e.message : "خطأ غير معروف"
      ),
  });

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const beginSelectMode = (firstId: string) => {
    setSelecting(true);
    setSelected(new Set([firstId]));
  };

  const cancelSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const launchCampaign = () => {
    const phones = rows
      .filter((r) => selected.has(r.id))
      .map((r) => r.phone_number);
    if (phones.length === 0) return;
    if (typeof globalThis !== "undefined") {
      // Use a global runtime cache; React Native lacks sessionStorage, but the
      // campaign-new screen can read from it before it's overwritten.
      (globalThis as unknown as Record<string, unknown>)[
        SELECTED_PHONES_STORAGE_KEY
      ] = phones;
    }
    cancelSelect();
    router.push("/campaigns/new");
  };

  const selectedCount = useMemo(() => selected.size, [selected]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }} edges={["top"]}>
      {/* Search + filter bar */}
      <View
        className="border-b px-3 pb-2 pt-3"
        style={{ borderBottomColor: managerColors.border, backgroundColor: managerColors.surface }}
      >
        <View
          className="flex-row-reverse items-center rounded-[18px] border px-3"
          style={{ borderColor: managerColors.border, backgroundColor: managerColors.surfaceMuted }}
        >
          <Ionicons name="search" size={16} color={managerColors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="ابحث بالاسم أو الرقم"
            placeholderTextColor={managerColors.muted}
            textAlign="right"
            className="flex-1 px-2 py-2 text-sm text-gray-950"
          />
          {q.length > 0 ? (
            <Pressable onPress={() => setQ("")}>
              <Ionicons name="close-circle" size={16} color={managerColors.muted} />
            </Pressable>
          ) : null}
        </View>
        <View className="mt-2 flex-row-reverse gap-2">
          <FilterChip
            label="الكل"
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterChip
            label="نشط"
            active={filter === "active"}
            onPress={() => setFilter("active")}
          />
          <FilterChip
            label="ملغى"
            active={filter === "opted_out"}
            onPress={() => setFilter("opted_out")}
          />
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={customersQuery.isFetching}
            onRefresh={() => customersQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View className="mb-2 flex-row-reverse items-center justify-between">
            <Text className="text-xs text-gray-500">
              {total.toLocaleString()} عميل · صفحة {page}/{totalPages}
            </Text>
            {selecting ? (
              <Pressable
                onPress={cancelSelect}
                className="rounded-full border border-gray-200 px-3 py-1"
              >
                <Text className="text-[11px] text-gray-700">إلغاء التحديد</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          customersQuery.isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator />
            </View>
          ) : customersQuery.isError ? (
            <View className="items-center px-6 py-16">
              <Ionicons name="cloud-offline-outline" size={48} color="#DC2626" />
              <Text className="mt-3 text-center text-sm text-red-700">
                تعذر تحميل العملاء
              </Text>
              <Text className="mt-1 text-center text-[11px] text-gray-500">
                {customersQuery.error instanceof Error
                  ? customersQuery.error.message
                  : "تأكد من اتصالك ثم حاول مرة أخرى"}
              </Text>
              <Pressable
                onPress={() => customersQuery.refetch()}
                className="mt-3 rounded-full border border-gray-200 px-4 py-2"
              >
                <Text className="text-xs text-gray-700">إعادة المحاولة</Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-16">
              <Ionicons name="people-outline" size={48} color="#9CA3AF" />
              <Text className="mt-3 text-gray-500">لا يوجد عملاء بعد</Text>
              <Text className="mt-1 text-xs text-gray-400">
                أضيفي عميلاً جديداً أو استورديهم من حملة سابقة.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <CustomerRowCard
            row={item}
            selected={selected.has(item.id)}
            selecting={selecting}
            onPress={() => {
              if (selecting) toggleOne(item.id);
              else router.push({ pathname: "/customers/[id]", params: { id: item.id } });
            }}
            onLongPress={() => {
              if (!selecting) beginSelectMode(item.id);
            }}
            onSendMessage={() => openConversationMutation.mutate(item)}
            sending={
              openConversationMutation.isPending &&
              openConversationMutation.variables?.id === item.id
            }
          />
        )}
        ListFooterComponent={
          rows.length > 0 ? (
            <View className="mt-3 flex-row-reverse items-center justify-between">
              <Pressable
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                className={`rounded-full border px-4 py-2 ${
                  page <= 1
                    ? "border-gray-100 bg-gray-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <Text
                  className={`text-xs ${
                    page <= 1 ? "text-gray-400" : "text-gray-700"
                  }`}
                >
                  السابق
                </Text>
              </Pressable>
              <Text className="text-xs text-gray-500">
                صفحة {page} / {totalPages}
              </Text>
              <Pressable
                disabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={`rounded-full border px-4 py-2 ${
                  page >= totalPages
                    ? "border-gray-100 bg-gray-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <Text
                  className={`text-xs ${
                    page >= totalPages ? "text-gray-400" : "text-gray-700"
                  }`}
                >
                  التالي
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {/* Bottom action bar in select-mode */}
      {selecting && selectedCount > 0 ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-3">
          <View className="flex-row-reverse items-center justify-between">
            <Text className="text-sm font-bold text-gray-950">
              {selectedCount} محدد
            </Text>
            <Pressable
              onPress={launchCampaign}
              className="flex-row-reverse items-center gap-2 rounded-[16px] px-4 py-3"
              style={{ backgroundColor: managerColors.brand }}
            >
              <Ionicons name="megaphone" size={16} color="#fff" />
              <Text className="font-bold text-white">إنشاء حملة لهم</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => router.push("/customers/new")}
          className="absolute bottom-6 left-6 h-14 flex-row items-center gap-2 rounded-full px-5"
          style={{
            backgroundColor: managerColors.brand,
            shadowColor: managerColors.brandDark,
            shadowOpacity: 0.18,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text className="font-bold text-white">إضافة</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-full border py-2 ${
        active
          ? "border-emerald-300 bg-emerald-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          active ? "text-emerald-900" : "text-gray-700"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CustomerRowCard({
  row,
  selected,
  selecting,
  onPress,
  onLongPress,
  onSendMessage,
  sending,
}: {
  row: CustomerDirectoryRow;
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onSendMessage: () => void;
  sending: boolean;
}) {
  return (
    <ManagerCard className="mb-2">
      <Pressable onPress={onPress} onLongPress={onLongPress}>
        <View className="flex-row-reverse items-center justify-between gap-2">
          <View className="flex-1">
            <View className="flex-row-reverse items-center gap-2">
              {selecting ? (
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={18}
                  color={selected ? managerColors.brand : managerColors.muted}
                />
              ) : null}
              <Text
                className="flex-1 text-right text-base font-semibold text-gray-950"
                numberOfLines={1}
              >
                {row.full_name || "بدون اسم"}
              </Text>
              {row.opted_out ? (
                <View className="rounded-full bg-red-50 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-red-700">
                    ملغى
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              className="mt-1 text-right text-[11px] text-gray-500"
              numberOfLines={1}
            >
              {row.phone_number} ·{" "}
              {row.last_seen_at
                ? format(new Date(row.last_seen_at), "yyyy-MM-dd")
                : "لم يتواصل"}
            </Text>
          </View>

          {!selecting ? (
            <Pressable
              onPress={onSendMessage}
              disabled={sending}
              hitSlop={6}
              className="h-10 w-10 items-center justify-center rounded-full bg-emerald-50"
            >
              {sending ? (
                <ActivityIndicator size="small" color={managerColors.brand} />
              ) : (
                <Ionicons
                  name="chatbubble-ellipses"
                  size={16}
                  color={managerColors.brand}
                />
              )}
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </ManagerCard>
  );
}
