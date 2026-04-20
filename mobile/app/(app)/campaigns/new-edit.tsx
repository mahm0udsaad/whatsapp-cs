import { useEffect, useMemo, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { subDays } from "date-fns";
import {
  type AudienceSelection,
  type MarketingTemplate,
  createMarketingCampaign,
  listMarketingCustomers,
  listMarketingTemplates,
  setCampaignAudience,
} from "../../../lib/api";
import {
  type TemplateExample,
  findTemplateExample,
} from "../../../lib/template-examples";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors } from "../../../components/manager-ui";

const SELECTED_PHONES_KEY = "whatsapp-cs:campaign-prefill-phones";

type AudienceKind = "all" | "30d" | "90d" | "selected";

interface Draft {
  campaignName: string;
  body: string;
  headerType: "none" | "text" | "image";
  headerText: string;
  footerText: string;
  reuseTemplateId?: string;
  example?: TemplateExample;
}

export default function CampaignNewEditScreen() {
  const params = useLocalSearchParams<{ example?: string; from?: string }>();
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [audienceKind, setAudienceKind] = useState<AudienceKind>(() => {
    const phones = (globalThis as unknown as Record<string, unknown>)[
      SELECTED_PHONES_KEY
    ] as string[] | undefined;
    return phones && phones.length > 0 ? "selected" : "all";
  });

  const selectedPhones = useMemo<string[]>(() => {
    const arr = (globalThis as unknown as Record<string, unknown>)[
      SELECTED_PHONES_KEY
    ];
    return Array.isArray(arr) ? (arr as string[]).slice() : [];
  }, []);

  const templatesQuery = useQuery({
    queryKey: qk.marketingTemplates(restaurantId),
    enabled: !!params.from && !!restaurantId,
    queryFn: listMarketingTemplates,
  });

  // Bootstrap from example or existing template.
  useEffect(() => {
    if (params.example) {
      const ex = findTemplateExample(params.example);
      if (!ex) {
        setBootstrapError("المثال غير موجود");
        return;
      }
      setDraft({
        campaignName: `${ex.title} — ${new Date().toLocaleDateString("ar")}`,
        body: ex.preview.body_template,
        headerType: ex.preview.header_type,
        headerText: ex.preview.header_text ?? "",
        footerText: ex.preview.footer_text ?? "",
        example: ex,
      });
      return;
    }
    if (params.from && templatesQuery.data) {
      const t = templatesQuery.data.find(
        (x: MarketingTemplate) => x.id === params.from
      );
      if (!t) {
        setBootstrapError("القالب غير موجود");
        return;
      }
      setDraft({
        campaignName: `${t.name} — ${new Date().toLocaleDateString("ar")}`,
        body: t.body_template ?? "",
        headerType: (t.header_type as "none" | "text" | "image") ?? "none",
        headerText: t.header_text ?? "",
        footerText: t.footer_text ?? "",
        reuseTemplateId: t.id,
      });
    }
  }, [params.example, params.from, templatesQuery.data]);

  // Live audience count for the chosen kind.
  const since =
    audienceKind === "30d"
      ? subDays(new Date(), 30).toISOString()
      : audienceKind === "90d"
        ? subDays(new Date(), 90).toISOString()
        : null;

  const audienceQuery = useQuery({
    queryKey: qk.marketingCustomersCount(restaurantId, since),
    enabled:
      !!restaurantId &&
      (audienceKind === "all" || audienceKind === "30d" || audienceKind === "90d"),
    queryFn: () =>
      listMarketingCustomers({ since: since ?? undefined, limit: 1 }),
  });

  const audienceCount =
    audienceKind === "selected"
      ? selectedPhones.length
      : (audienceQuery.data?.total ?? 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("لا توجد بيانات");
      if (!draft.campaignName.trim()) throw new Error("اسم الحملة مطلوب");
      if (!draft.reuseTemplateId) {
        throw new Error(
          "إنشاء قالب جديد يتطلب اعتماد Twilio. ابدأ من قالب معتمد سابق أو من لوحة الويب."
        );
      }

      const campaign = await createMarketingCampaign({
        name: draft.campaignName.trim(),
        template_id: draft.reuseTemplateId,
      });

      const selection: AudienceSelection =
        audienceKind === "selected"
          ? { kind: "custom", phones: selectedPhones }
          : audienceKind === "all"
            ? { kind: "all" }
            : { kind: "since", since: since! };

      const aud = await setCampaignAudience(campaign.id, selection);
      return { campaign, aud };
    },
    onSuccess: ({ campaign, aud }) => {
      // Clear the prefilled phones now that they're attached.
      delete (globalThis as unknown as Record<string, unknown>)[
        SELECTED_PHONES_KEY
      ];
      qc.invalidateQueries({ queryKey: qk.marketingCampaigns(restaurantId) });
      Alert.alert(
        "تم إنشاء الحملة",
        `عدد جهات الاتصال: ${aud.total_recipients}.`,
        [
          {
            text: "فتح الحملة",
            onPress: () =>
              router.replace({
                pathname: "/campaigns/[id]",
                params: { id: campaign.id },
              }),
          },
        ]
      );
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "خطأ غير معروف"),
  });

  if (bootstrapError) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F6F7F9] p-6">
        <Text className="text-center text-sm text-red-700">
          {bootstrapError}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-3 rounded-full border border-gray-200 px-4 py-2"
        >
          <Text className="text-xs text-gray-700">العودة</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!draft) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F6F7F9]">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 140 }}>
        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">
            اسم الحملة
          </Text>
          <TextInput
            value={draft.campaignName}
            onChangeText={(v) => setDraft({ ...draft, campaignName: v })}
            textAlign="right"
            className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
          />
        </ManagerCard>

        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">
            معاينة الرسالة
          </Text>
          <View className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3">
            {draft.headerType === "text" && draft.headerText ? (
              <Text className="mb-1 text-right text-[11px] font-bold text-gray-700">
                {draft.headerText}
              </Text>
            ) : null}
            {draft.headerType === "image" ? (
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
              {draft.body}
            </Text>
            {draft.footerText ? (
              <Text className="mt-2 text-right text-[10px] text-gray-500">
                {draft.footerText}
              </Text>
            ) : null}
          </View>
          {!draft.reuseTemplateId ? (
            <Text className="mt-2 text-right text-[10px] text-amber-700">
              تنبيه: إنشاء قالب جديد متاح من لوحة الويب فقط (يتطلب اعتماد Twilio).
            </Text>
          ) : null}
        </ManagerCard>

        <ManagerCard className="mb-3">
          <Text className="text-right text-xs font-bold text-gray-500">الجمهور</Text>
          <View className="mt-2 flex-row-reverse flex-wrap gap-2">
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
            {selectedPhones.length > 0 ? (
              <AudienceChip
                label={`المحددين (${selectedPhones.length})`}
                active={audienceKind === "selected"}
                onPress={() => setAudienceKind("selected")}
              />
            ) : null}
          </View>
          <View className="mt-3 flex-row-reverse items-center justify-between rounded-md bg-gray-50 px-3 py-2">
            <Text className="text-sm text-gray-700">جهات الاتصال</Text>
            <Text className="text-lg font-bold text-gray-950 tabular-nums">
              {audienceQuery.isLoading && audienceKind !== "selected"
                ? "…"
                : audienceCount.toLocaleString()}
            </Text>
          </View>
        </ManagerCard>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-3">
        <View className="flex-row-reverse gap-2">
          <Pressable
            disabled={
              createMutation.isPending ||
              !draft.campaignName.trim() ||
              audienceCount === 0
            }
            onPress={() => createMutation.mutate()}
            className={`flex-1 items-center rounded-lg py-3 ${
              !draft.campaignName.trim() || audienceCount === 0
                ? "bg-[#B6E5D6]"
                : "bg-[#00A884]"
            }`}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-bold text-white">
                إنشاء الحملة ({audienceCount.toLocaleString()})
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
      className={`rounded-full border px-3 py-1.5 ${
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
