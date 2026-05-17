import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";
import { getApprovals, type PendingApproval } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { useSessionStore } from "../../lib/session-store";
import {
  ListSkeleton,
  managerColors,
} from "../../components/manager-ui";
import { ExtractedIntentCard } from "../../components/extracted-intent-card";
import { EmptyState, ErrorState } from "../../components/list-state";
import {
  escalationReasonLabel,
  escalationReasonTone,
} from "../../lib/escalation-labels";

export default function ApprovalsScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";

  const query = useQuery({
    queryKey: qk.approvals(restaurantId),
    enabled: !!restaurantId,
    queryFn: getApprovals,
    refetchInterval: 30_000,
  });

  if (!restaurantId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ApprovalsHeader count={0} fetching={false} />
        <ListSkeleton count={4} />
      </SafeAreaView>
    );
  }

  // Defensive: see overview.tsx for why this is guarded. If the API ever
  // returns a non-array (HTML error page, wrong content-type, etc.), a
  // FlatList `data={string}` would crash rendering.
  const items: PendingApproval[] = Array.isArray(query.data) ? query.data : [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ApprovalsHeader count={items.length} fetching={query.isFetching} />

      {query.isLoading ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={managerColors.brand}
            />
          }
          ListEmptyComponent={
            query.isError ? (
              <ErrorState onRetry={() => query.refetch()} />
            ) : (
              <EmptyState
                icon="checkmark-done"
                title="لا توجد طلبات الآن"
                description="أي تصعيد جديد من البوت سيظهر هنا مع سبب التصعيد ورسالة العميل."
              />
            )
          }
          renderItem={({ item }: { item: PendingApproval }) => (
            <ApprovalCard approval={item} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ApprovalsHeader({
  count,
  fetching,
}: {
  count: number;
  fetching: boolean;
}) {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            الطلبات
          </Text>
          <Text style={styles.headerSubtitle}>
            محادثات أوقفها البوت لأنه يحتاج قرارك قبل الرد
          </Text>
        </View>
        <View style={styles.headerCountBadge}>
          {fetching ? (
            <ActivityIndicator color={managerColors.danger} size="small" />
          ) : (
            <Text style={styles.headerCountValue}>{count}</Text>
          )}
          <Text style={styles.headerCountLabel}>طلب</Text>
        </View>
      </View>
    </View>
  );
}

function ApprovalCard({ approval }: { approval: PendingApproval }) {
  // Actual customer message goes in the body; the machine code is mapped to an
  // Arabic tag. `message` is the new field; fall back to `summary` so older
  // server builds still render something.
  const body = approval.message ?? approval.summary ?? "لا توجد رسالة مرفقة";
  const reasonLabel = escalationReasonLabel(approval.reasonCode);
  const reasonTone = escalationReasonTone(approval.reasonCode);
  const reasonClasses =
    reasonTone === "danger"
      ? "border-red-100 bg-red-50 text-red-800"
      : reasonTone === "warn"
      ? "border-amber-100 bg-amber-50 text-amber-800"
      : "border-indigo-100 bg-indigo-50 text-indigo-900";
  const customerLabel = approval.customer_name || approval.customer_phone;
  const showPhone = approval.customer_name && approval.customer_phone;
  const ageLabel = formatDistanceToNow(new Date(approval.created_at), {
    addSuffix: true,
    locale: ar,
  });

  const accentBar =
    reasonTone === "danger"
      ? "bg-red-500"
      : reasonTone === "warn"
      ? "bg-amber-500"
      : "bg-indigo-500";

  return (
    <View
      style={styles.card}
    >
      <View style={styles.cardRow}>
        <View
          style={[
            styles.cardAccent,
            accentBar === "bg-red-500"
              ? styles.cardAccentDanger
              : accentBar === "bg-amber-500"
              ? styles.cardAccentWarn
              : styles.cardAccentInfo,
          ]}
        />
        <View style={styles.cardBody}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {customerLabel.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.identityContent}>
              <View style={styles.identityHeaderRow}>
                <Text
                  style={styles.customerName}
                  numberOfLines={1}
                >
                  {customerLabel}
                </Text>
                <Text style={styles.ageText}>
                  {ageLabel}
                </Text>
              </View>
              {showPhone ? (
                <Text
                  style={styles.phoneText}
                  selectable
                >
                  {approval.customer_phone}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            style={[
              styles.reasonBox,
              reasonClasses === "border-red-100 bg-red-50 text-red-800"
                ? styles.reasonBoxDanger
                : reasonClasses === "border-amber-100 bg-amber-50 text-amber-800"
                ? styles.reasonBoxWarn
                : styles.reasonBoxInfo,
            ]}
          >
            <View style={styles.reasonHeaderRow}>
              <Ionicons
                name="sparkles-outline"
                size={14}
                color={
                  reasonTone === "danger"
                    ? "#991B1B"
                    : reasonTone === "warn"
                    ? "#92400E"
                    : "#312E81"
                }
              />
              <Text style={[
                styles.reasonHeaderText,
                reasonTone === "danger"
                  ? styles.reasonTextDanger
                  : reasonTone === "warn"
                  ? styles.reasonTextWarn
                  : styles.reasonTextInfo,
              ]}>
                لماذا يحتاج البوت مساعدتك؟
              </Text>
            </View>
            <Text style={[
              styles.reasonLabel,
              reasonTone === "danger"
                ? styles.reasonTextDanger
                : reasonTone === "warn"
                ? styles.reasonTextWarn
                : styles.reasonTextInfo,
            ]}>
              {reasonLabel}
            </Text>
          </View>

          {approval.extracted_intent ? (
            <View style={styles.intentWrap}>
              <ExtractedIntentCard intent={approval.extracted_intent} />
            </View>
          ) : (
            <View style={styles.messageFallback}>
              <Text style={styles.messageLabel}>
                آخر رسالة من العميل
              </Text>
              <Text
                numberOfLines={4}
                style={styles.messageBody}
              >
                {body}
              </Text>
            </View>
          )}

          <Pressable
            onPress={() =>
              router.push(`/(app)/inbox/${approval.conversation_id}`)
            }
            style={styles.openButton}
            accessibilityRole="button"
            accessibilityLabel={`فتح محادثة ${customerLabel}`}
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#fff" />
            <Text style={styles.openButtonText}>
              فتح المحادثة واتخاذ القرار
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F7F9",
  },
  headerContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#E6E8EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    textAlign: "right",
    fontSize: 22,
    fontWeight: "700",
    color: "#16245C",
  },
  headerSubtitle: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 24,
    color: "#5E6A99",
  },
  headerCountBadge: {
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerCountValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#B91C1C",
  },
  headerCountLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#B91C1C",
  },
  card: {
    marginBottom: 12,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    shadowColor: "#273B9A",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardRow: {
    flexDirection: "row-reverse",
  },
  cardAccent: {
    width: 6,
  },
  cardAccentDanger: { backgroundColor: "#EF4444" },
  cardAccentWarn: { backgroundColor: "#F59E0B" },
  cardAccentInfo: { backgroundColor: "#6366F1" },
  cardBody: {
    flex: 1,
    padding: 16,
  },
  identityRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    columnGap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FF",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#273B9A",
  },
  identityContent: {
    flex: 1,
    minWidth: 0,
  },
  identityHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  customerName: {
    flex: 1,
    textAlign: "right",
    fontSize: 17,
    fontWeight: "700",
    color: "#16245C",
  },
  ageText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#7A88B8",
  },
  phoneText: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 12,
    color: "#7A88B8",
  },
  reasonBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reasonBoxDanger: { borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
  reasonBoxWarn: { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  reasonBoxInfo: { borderColor: "#C7D2FE", backgroundColor: "#EEF2FF" },
  reasonHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 6,
  },
  reasonHeaderText: {
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
  },
  reasonTextDanger: { color: "#991B1B" },
  reasonTextWarn: { color: "#92400E" },
  reasonTextInfo: { color: "#312E81" },
  reasonLabel: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
  },
  intentWrap: { marginTop: 8 },
  messageFallback: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: "#F7F9FF",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  messageLabel: {
    marginBottom: 4,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: "#7A88B8",
  },
  messageBody: {
    textAlign: "right",
    fontSize: 14,
    lineHeight: 24,
    color: "#16245C",
  },
  openButton: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
    borderRadius: 18,
    backgroundColor: managerColors.brand,
    paddingVertical: 12,
  },
  openButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
