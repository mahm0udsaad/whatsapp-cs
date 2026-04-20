import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  type MarketingTemplate,
  listMarketingTemplates,
} from "../../../lib/api";
import {
  TEMPLATE_EXAMPLES,
  type TemplateExample,
} from "../../../lib/template-examples";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors } from "../../../components/manager-ui";

type Tab = "curated" | "mine";

export default function CampaignNewPickerScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const [tab, setTab] = useState<Tab>("curated");

  const templatesQuery = useQuery({
    queryKey: qk.marketingTemplates(restaurantId),
    enabled: tab === "mine" && !!restaurantId,
    queryFn: listMarketingTemplates,
  });

  const approved = (templatesQuery.data ?? []).filter(
    (t: MarketingTemplate) => t.approval_status === "approved"
  );

  // Reset to picker on every fresh navigation in case the user backed out of
  // edit halfway through.
  useEffect(() => {
    return () => {
      // no-op
    };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      {/* Tab strip */}
      <View className="flex-row-reverse gap-2 border-b border-gray-100 bg-white p-3">
        <TabPill
          label="جاهزة"
          icon="sparkles"
          active={tab === "curated"}
          onPress={() => setTab("curated")}
        />
        <TabPill
          label="من قوالبك"
          icon="copy"
          active={tab === "mine"}
          onPress={() => setTab("mine")}
        />
      </View>

      {tab === "curated" ? (
        <FlatList
          data={TEMPLATE_EXAMPLES}
          keyExtractor={(e) => e.slug}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          renderItem={({ item }) => (
            <ExampleCard
              example={item}
              onPress={() =>
                router.push({
                  pathname: "/campaigns/new-edit",
                  params: { example: item.slug },
                })
              }
            />
          )}
        />
      ) : templatesQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : approved.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="document-outline" size={48} color="#9CA3AF" />
          <Text className="mt-3 text-gray-500">
            لا توجد قوالب معتمدة بعد
          </Text>
          <Text className="mt-1 text-center text-xs text-gray-400">
            أنشئ قالباً جديداً من المثال الجاهز ثم انتظر الاعتماد.
          </Text>
        </View>
      ) : (
        <FlatList
          data={approved}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          renderItem={({ item }) => (
            <ApprovedCard
              template={item}
              onPress={() =>
                router.push({
                  pathname: "/campaigns/new-edit",
                  params: { from: item.id },
                })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function TabPill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row-reverse items-center justify-center gap-1.5 rounded-full border py-2 ${
        active
          ? "border-emerald-300 bg-emerald-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? managerColors.brand : managerColors.muted}
      />
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

function ExampleCard({
  example,
  onPress,
}: {
  example: TemplateExample;
  onPress: () => void;
}) {
  return (
    <ManagerCard className="mb-3">
      <Pressable onPress={onPress}>
        <View className="flex-row-reverse items-start justify-between">
          <View className="flex-1">
            <Text className="text-right text-base font-semibold text-gray-950">
              {example.title}
            </Text>
            <Text className="mt-1 text-right text-[11px] text-gray-500">
              {example.description}
            </Text>
          </View>
          <View className="rounded-full bg-gray-100 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-gray-700">
              {example.category}
            </Text>
          </View>
        </View>

        <View className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
          {example.preview.header_type === "text" &&
          example.preview.header_text ? (
            <Text className="mb-1 text-right text-[11px] font-bold text-gray-700">
              {example.preview.header_text}
            </Text>
          ) : null}
          {example.preview.header_type === "image" ? (
            <View className="mb-2 flex-row-reverse items-center gap-2 rounded-md bg-emerald-50 px-2 py-1">
              <Ionicons
                name="image"
                size={12}
                color={managerColors.brand}
              />
              <Text className="text-[10px] font-semibold text-emerald-700">
                صورة في الرأس
              </Text>
            </View>
          ) : null}
          <Text className="text-right text-sm leading-6 text-gray-950">
            {example.preview.body_template}
          </Text>
          {example.preview.footer_text ? (
            <Text className="mt-2 text-right text-[10px] text-gray-500">
              {example.preview.footer_text}
            </Text>
          ) : null}
        </View>

        <View className="mt-3 flex-row-reverse items-center justify-between">
          <Text className="text-[11px] text-gray-500">
            متغيرات: {example.variables.length}
          </Text>
          <View className="flex-row-reverse items-center gap-1">
            <Text className="text-xs font-bold text-emerald-700">
              استخدام
            </Text>
            <Ionicons
              name="arrow-back"
              size={14}
              color={managerColors.brand}
            />
          </View>
        </View>
      </Pressable>
    </ManagerCard>
  );
}

function ApprovedCard({
  template,
  onPress,
}: {
  template: MarketingTemplate;
  onPress: () => void;
}) {
  return (
    <ManagerCard className="mb-3">
      <Pressable onPress={onPress}>
        <View className="flex-row-reverse items-start justify-between">
          <View className="flex-1">
            <Text className="text-right text-base font-semibold text-gray-950">
              {template.name}
            </Text>
            <Text className="mt-1 text-right text-[11px] text-gray-500">
              {template.language?.toUpperCase()} · {template.category}
            </Text>
          </View>
          <View className="rounded-full bg-emerald-50 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-emerald-700">معتمد</Text>
          </View>
        </View>

        {template.body_template ? (
          <View className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
            <Text
              numberOfLines={5}
              className="text-right text-sm leading-6 text-gray-950"
            >
              {template.body_template}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </ManagerCard>
  );
}
