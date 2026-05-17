import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
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
import { managerColors } from "../../../components/manager-ui";

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
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View
        style={styles.header}
      >
        <View
          style={styles.searchBox}
        >
          <Ionicons name="search" size={16} color={managerColors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="ابحث بالاسم أو الرقم"
            placeholderTextColor={managerColors.muted}
            textAlign="right"
            style={styles.searchInput}
          />
          {q.length > 0 ? (
            <Pressable onPress={() => setQ("")}>
              <Ionicons name="close-circle" size={16} color={managerColors.muted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
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
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderMeta}>
              {total.toLocaleString()} عميل · صفحة {page}/{totalPages}
            </Text>
            {selecting ? (
              <Pressable
                onPress={cancelSelect}
                style={styles.cancelSelectButton}
              >
                <Text style={styles.cancelSelectButtonText}>إلغاء التحديد</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          customersQuery.isLoading ? (
            <View style={styles.stateCenter}>
              <ActivityIndicator />
            </View>
          ) : customersQuery.isError ? (
            <View style={styles.errorState}>
              <Ionicons name="cloud-offline-outline" size={48} color="#DC2626" />
              <Text style={styles.errorTitle}>
                تعذر تحميل العملاء
              </Text>
              <Text style={styles.errorDescription}>
                {customersQuery.error instanceof Error
                  ? customersQuery.error.message
                  : "تأكد من اتصالك ثم حاول مرة أخرى"}
              </Text>
              <Pressable
                onPress={() => customersQuery.refetch()}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stateCenter}>
              <Ionicons name="people-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>لا يوجد عملاء بعد</Text>
              <Text style={styles.emptyDescription}>
                أضف عميلاً جديداً أو استوردهم من حملة سابقة.
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
            <View style={styles.paginationRow}>
              <Pressable
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={[
                  styles.paginationButton,
                  page <= 1 ? styles.paginationButtonDisabled : styles.paginationButtonEnabled,
                ]}
              >
                <Text style={[styles.paginationButtonText, page <= 1 ? styles.paginationButtonTextDisabled : styles.paginationButtonTextEnabled]}>
                  السابق
                </Text>
              </Pressable>
              <Text style={styles.paginationMeta}>
                صفحة {page} / {totalPages}
              </Text>
              <Pressable
                disabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={[
                  styles.paginationButton,
                  page >= totalPages ? styles.paginationButtonDisabled : styles.paginationButtonEnabled,
                ]}
              >
                <Text style={[styles.paginationButtonText, page >= totalPages ? styles.paginationButtonTextDisabled : styles.paginationButtonTextEnabled]}>
                  التالي
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {selecting && selectedCount > 0 ? (
        <View style={styles.selectionBar}>
          <View style={styles.selectionBarRow}>
            <Text style={styles.selectionCount}>
              {selectedCount} محدد
            </Text>
            <Pressable
              onPress={launchCampaign}
              style={styles.selectionAction}
            >
              <Ionicons name="megaphone" size={16} color="#fff" />
              <Text style={styles.selectionActionText}>إنشاء حملة لهم</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => router.push("/customers/new")}
          style={styles.fab}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>إضافة</Text>
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
      style={[
        styles.filterChip,
        active ? styles.filterChipActive : styles.filterChipIdle,
      ]}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : styles.filterChipTextIdle]}>
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
    <View style={styles.customerCard}>
      <Pressable onPress={onPress} onLongPress={onLongPress}>
        <View style={styles.customerRow}>
          <View style={styles.customerContent}>
            <View style={styles.customerNameRow}>
              {selecting ? (
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={18}
                  color={selected ? managerColors.brand : managerColors.muted}
                />
              ) : null}
              <Text
                style={styles.customerName}
                numberOfLines={1}
              >
                {row.full_name || "بدون اسم"}
              </Text>
              {row.opted_out ? (
                <View style={styles.optedOutBadge}>
                  <Text style={styles.optedOutBadgeText}>
                    ملغى
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={styles.customerMeta}
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
              style={styles.sendButton}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: managerColors.bg,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
    backgroundColor: managerColors.surface,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: managerColors.border,
    backgroundColor: managerColors.surfaceMuted,
    paddingHorizontal: 12,
    columnGap: 8,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
    textAlign: "right",
  },
  filterRow: {
    marginTop: 8,
    flexDirection: "row-reverse",
    columnGap: 8,
  },
  listHeader: {
    marginBottom: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listHeaderMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  cancelSelectButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  cancelSelectButtonText: {
    fontSize: 11,
    color: "#374151",
  },
  stateCenter: {
    alignItems: "center",
    paddingVertical: 64,
  },
  errorState: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 64,
  },
  errorTitle: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 14,
    color: "#B91C1C",
  },
  errorDescription: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 11,
    color: "#6B7280",
  },
  retryButton: {
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryButtonText: {
    fontSize: 12,
    color: "#374151",
  },
  emptyTitle: {
    marginTop: 12,
    color: "#6B7280",
  },
  emptyDescription: {
    marginTop: 4,
    fontSize: 12,
    color: "#9CA3AF",
  },
  paginationRow: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paginationButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  paginationButtonEnabled: {
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  paginationButtonDisabled: {
    borderColor: "#F3F4F6",
    backgroundColor: "#F9FAFB",
  },
  paginationButtonText: {
    fontSize: 12,
  },
  paginationButtonTextEnabled: {
    color: "#374151",
  },
  paginationButtonTextDisabled: {
    color: "#9CA3AF",
  },
  paginationMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  selectionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  selectionBarRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  selectionAction: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
    borderRadius: 16,
    backgroundColor: managerColors.brand,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectionActionText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  fab: {
    position: "absolute",
    left: 24,
    bottom: 24,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    backgroundColor: managerColors.brand,
    shadowColor: managerColors.brandDark,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  filterChip: {
    flex: 1,
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: "#86EFAC",
    backgroundColor: "#ECFDF5",
  },
  filterChipIdle: {
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#14532D",
  },
  filterChipTextIdle: {
    color: "#374151",
  },
  customerCard: {
    marginBottom: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#FCFEFC",
    padding: 16,
    shadowColor: "#273B9A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  customerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
  },
  customerContent: {
    flex: 1,
  },
  customerNameRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  customerName: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  optedOutBadge: {
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  optedOutBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B91C1C",
  },
  customerMeta: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 11,
    color: "#6B7280",
  },
  sendButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
});
