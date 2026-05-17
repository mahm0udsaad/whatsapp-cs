import { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  type MarketingTemplate,
  listAllMarketingTemplates,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors } from "../../../components/manager-ui";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from "../../../components/tw";

type Tab = "draft" | "submitted" | "approved" | "rejected";

const TAB_LABEL: Record<Tab, string> = {
  draft: "مسودة",
  submitted: "قيد الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
};

const TAB_ORDER: Tab[] = ["approved", "submitted", "rejected", "draft"];

function countsByStatus(rows: MarketingTemplate[]) {
  const out: Record<Tab, number> = {
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  };
  for (const r of rows) {
    const s = r.approval_status as Tab;
    if (s in out) out[s] += 1;
  }
  return out;
}

export default function TemplatesLibraryScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const [tab, setTab] = useState<Tab>("approved");

  const query = useQuery({
    queryKey: qk.marketingTemplatesAll(restaurantId),
    enabled: !!restaurantId,
    queryFn: listAllMarketingTemplates,
    // Auto-refresh while any template is awaiting Meta decision so the UI
    // flips statuses without the user having to pull.
    refetchInterval: (q) => {
      const data = q.state.data as MarketingTemplate[] | undefined;
      return data?.some((t) => t.approval_status === "submitted")
        ? 30_000
        : false;
    },
  });

  const rows = query.data ?? [];
  const counts = useMemo(() => countsByStatus(rows), [rows]);
  const filtered = rows.filter((r) => r.approval_status === tab);

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      {/* Tabs */}
      <View className="flex-row-reverse gap-2 border-b border-gray-100 bg-white p-3">
        {TAB_ORDER.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            className={`flex-1 items-center rounded-full border py-2 ${
              tab === t
                ? "border-emerald-300 bg-emerald-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <Text
              className={`text-[11px] font-semibold ${
                tab === t ? "text-emerald-900" : "text-gray-700"
              }`}
            >
              {TAB_LABEL[t]} ({counts[t]})
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="document-outline" size={48} color="#9CA3AF" />
          <Text className="mt-3 text-center text-sm text-gray-500">
            لا توجد قوالب في هذا التبويب.
          </Text>
          {tab === "approved" ? (
            <Pressable
              onPress={() => router.push("/campaigns/new")}
              className="mt-4 flex-row-reverse items-center gap-1.5 rounded-full bg-[#00A884] px-4 py-2"
            >
              <Ionicons name="add" size={14} color="#fff" />
              <Text className="text-xs font-bold text-white">
                إنشاء قالب جديد
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={managerColors.brand}
            />
          }
          renderItem={({ item }) => (
            <TemplateCard
              template={item}
              onUse={
                item.approval_status === "approved"
                  ? () =>
                      router.push({
                        pathname: "/campaigns/new-edit",
                        params: { from: item.id },
                      })
                  : undefined
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function TemplateCard({
  template,
  onUse,
}: {
  template: MarketingTemplate;
  onUse?: () => void;
}) {
  const status = template.approval_status;
  const badge =
    status === "approved"
      ? { label: "معتمد", bg: "bg-emerald-50", text: "text-emerald-700" }
      : status === "submitted"
        ? { label: "قيد الاعتماد", bg: "bg-amber-50", text: "text-amber-700" }
        : status === "rejected"
          ? { label: "مرفوض", bg: "bg-red-50", text: "text-red-700" }
          : { label: "مسودة", bg: "bg-gray-100", text: "text-gray-700" };

  return (
    <ManagerCard className="mb-3">
      <View className="flex-row-reverse items-start justify-between">
        <View className="flex-1">
          <Text className="text-right text-base font-semibold text-gray-950">
            {template.name}
          </Text>
          <Text className="mt-1 text-right text-[11px] text-gray-500">
            {(template.language ?? "").toUpperCase()} · {template.category}
          </Text>
        </View>
        <View className={`rounded-full px-2 py-0.5 ${badge.bg}`}>
          <Text className={`text-[10px] font-bold ${badge.text}`}>
            {badge.label}
          </Text>
        </View>
      </View>

      {template.header_type === "image" && template.header_image_url ? (
        <Image
          source={{ uri: template.header_image_url }}
          style={{
            width: "100%",
            height: 120,
            borderRadius: 8,
            marginTop: 10,
            backgroundColor: "#eee",
          }}
          resizeMode="cover"
        />
      ) : null}

      {template.body_template ? (
        <View className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
          <Text
            numberOfLines={4}
            className="text-right text-sm leading-6 text-gray-950"
          >
            {template.body_template}
          </Text>
        </View>
      ) : null}

      {status === "rejected" && template.rejection_reason ? (
        <View className="mt-2 rounded-md bg-red-50 p-2">
          <Text className="text-right text-[11px] text-red-700">
            سبب الرفض: {template.rejection_reason}
          </Text>
        </View>
      ) : null}

      {onUse ? (
        <Pressable
          onPress={onUse}
          className="mt-3 flex-row-reverse items-center justify-center gap-1.5 rounded-full bg-[#00A884] py-2"
        >
          <Ionicons name="arrow-back" size={14} color="#fff" />
          <Text className="text-xs font-bold text-white">
            استخدم في حملة
          </Text>
        </Pressable>
      ) : null}
    </ManagerCard>
  );
}
