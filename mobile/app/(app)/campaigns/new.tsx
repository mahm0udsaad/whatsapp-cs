import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { subDays } from "date-fns";
import {
  createMarketingCampaign,
  listMarketingCustomers,
  listMarketingTemplates,
  setCampaignAudience,
  type AudienceSelection,
  type MarketingTemplate,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors } from "../../../components/manager-ui";

type AudienceKind = "all" | "30d" | "90d";

function isoSince(kind: AudienceKind): string | null {
  if (kind === "30d") return subDays(new Date(), 30).toISOString();
  if (kind === "90d") return subDays(new Date(), 90).toISOString();
  return null;
}

export default function NewCampaignScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";

  const [name, setName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [audienceKind, setAudienceKind] = useState<AudienceKind>("all");

  // Templates list — approved only.
  const templatesQuery = useQuery({
    queryKey: qk.marketingTemplates(restaurantId),
    enabled: !!restaurantId,
    queryFn: listMarketingTemplates,
    staleTime: 5 * 60_000,
  });
  const templates = useMemo<MarketingTemplate[]>(
    () => (Array.isArray(templatesQuery.data) ? templatesQuery.data : []),
    [templatesQuery.data]
  );

  // Live audience count per filter.
  const since = isoSince(audienceKind);
  const audienceQuery = useQuery({
    queryKey: qk.marketingCustomersCount(restaurantId, since),
    enabled: !!restaurantId,
    // Only need `total` — cap limit small.
    queryFn: () => listMarketingCustomers({ since: since ?? undefined, limit: 1 }),
    staleTime: 30_000,
  });
  const audienceCount = audienceQuery.data?.total ?? 0;

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  const createAndSendMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("اسم الحملة مطلوب");
      if (!selectedTemplateId) throw new Error("اختاري قالباً أولاً");

      const campaign = await createMarketingCampaign({
        name: trimmedName,
        template_id: selectedTemplateId,
      });

      const selection: AudienceSelection = since
        ? { kind: "since", since }
        : { kind: "all" };
      const res = await setCampaignAudience(campaign.id, selection);
      return { campaign, audience: res };
    },
    onSuccess: ({ campaign, audience }) => {
      qc.invalidateQueries({ queryKey: qk.marketingCampaigns(restaurantId) });
      Alert.alert(
        "تم إنشاء الحملة",
        `عدد جهات الاتصال: ${audience.total_recipients}. افتحي الحملة للإرسال.`,
        [
          {
            text: "فتح الحملة",
            onPress: () =>
              router.replace({
                pathname: "/campaigns/[id]",
                params: { id: campaign.id },
              }),
          },
          { text: "إغلاق", style: "cancel", onPress: () => router.back() },
        ]
      );
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "حدث خطأ غير متوقع"),
  });

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 140 }}>
        {/* Step 1 — Name */}
        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">
            ١. اسم الحملة
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="مثال: عروض الجمعة"
            textAlign="right"
            maxLength={80}
            className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-right text-sm text-gray-950"
          />
        </ManagerCard>

        {/* Step 2 — Template */}
        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">
            ٢. القالب المعتمد
          </Text>
          {templatesQuery.isLoading ? (
            <ActivityIndicator style={{ marginTop: 12 }} />
          ) : templates.length === 0 ? (
            <View className="mt-3 items-center rounded-md border border-dashed border-gray-200 bg-gray-50 p-3">
              <Text className="text-center text-xs text-gray-500">
                لا توجد قوالب معتمدة. أنشئي قالباً من لوحة التحكم أولاً.
              </Text>
            </View>
          ) : (
            <View className="mt-2">
              {templates.map((t) => {
                const active = selectedTemplateId === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setSelectedTemplateId(t.id)}
                    className={`mb-2 rounded-md border p-3 ${
                      active
                        ? "border-[#00A884] bg-emerald-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <View className="flex-row-reverse items-center justify-between">
                      <Text className="flex-1 text-right text-sm font-semibold text-gray-950">
                        {t.name}
                      </Text>
                      <Ionicons
                        name={
                          active
                            ? "radio-button-on"
                            : "radio-button-off-outline"
                        }
                        size={20}
                        color={active ? managerColors.brand : "#9CA3AF"}
                      />
                    </View>
                    {t.body_template ? (
                      <Text
                        className="mt-1 text-right text-[11px] text-gray-500"
                        numberOfLines={2}
                      >
                        {t.body_template}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ManagerCard>

        {/* Step 3 — Audience */}
        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">
            ٣. الجمهور
          </Text>
          <View className="mt-2 flex-row-reverse gap-2">
            <AudienceChip
              label="كل العملاء"
              active={audienceKind === "all"}
              onPress={() => setAudienceKind("all")}
            />
            <AudienceChip
              label="آخر ٣٠ يوم"
              active={audienceKind === "30d"}
              onPress={() => setAudienceKind("30d")}
            />
            <AudienceChip
              label="آخر ٩٠ يوم"
              active={audienceKind === "90d"}
              onPress={() => setAudienceKind("90d")}
            />
          </View>
          <View className="mt-3 flex-row-reverse items-center justify-between rounded-md bg-gray-50 px-3 py-2">
            <Text className="text-sm text-gray-700">جهات الاتصال</Text>
            <Text className="text-lg font-bold text-gray-950 tabular-nums">
              {audienceQuery.isLoading ? "…" : audienceCount.toLocaleString()}
            </Text>
          </View>
          <Text className="mt-1 text-right text-[10px] text-gray-400">
            يتم استبعاد من سحب اشتراكه تلقائياً.
          </Text>
        </ManagerCard>

        {/* Review */}
        {selectedTemplate ? (
          <ManagerCard className="mb-3">
            <Text className="text-right text-xs font-bold text-gray-500">
              معاينة
            </Text>
            <View className="mt-2 rounded-md border border-gray-100 bg-white p-3">
              <Text className="text-right text-sm text-gray-950">
                {selectedTemplate.body_template || "—"}
              </Text>
              {selectedTemplate.footer_text ? (
                <Text className="mt-2 text-right text-[11px] text-gray-500">
                  {selectedTemplate.footer_text}
                </Text>
              ) : null}
            </View>
            <Text className="mt-2 text-right text-[11px] text-gray-500">
              سيتم إنشاء الحملة وربطها بـ {audienceCount.toLocaleString()} جهة
              اتصال. الإرسال يتطلب ضغطة إضافية في شاشة التفاصيل.
            </Text>
          </ManagerCard>
        ) : null}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-3">
        <View className="flex-row-reverse gap-2">
          <Pressable
            disabled={
              createAndSendMutation.isPending ||
              !name.trim() ||
              !selectedTemplateId ||
              audienceCount === 0
            }
            onPress={() => createAndSendMutation.mutate()}
            className={`flex-1 items-center rounded-lg py-3 ${
              !name.trim() || !selectedTemplateId || audienceCount === 0
                ? "bg-[#B6E5D6]"
                : "bg-[#00A884]"
            }`}
          >
            {createAndSendMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-bold text-white">
                إنشاء ({audienceCount.toLocaleString()})
              </Text>
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

function AudienceChip({
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
