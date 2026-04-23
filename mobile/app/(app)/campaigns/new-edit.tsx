import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import {
  type AudienceSelection,
  type MarketingTemplate,
  createMarketingCampaign,
  createMarketingTemplate,
  generateTemplateImage,
  listMarketingCustomers,
  listMarketingTemplates,
  setCampaignAudience,
  uploadTemplateImage,
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
type ScheduleKind = "now" | "+1h" | "+3h" | "+24h";

interface Draft {
  // Campaign-level
  campaignName: string;
  // Template-level (only used when building from an example — reuse path skips
  // these because the template already exists.)
  templateName: string;
  body: string;
  headerType: "none" | "text" | "image";
  headerText: string;
  headerImageUrl: string | null;
  footerText: string;
  buttons: Array<Record<string, unknown>> | null;
  variables: string[] | null;
  /** Realistic values for {{1}}..{{n}} — shown to Meta reviewers. */
  sampleValues: string[] | null;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
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
  const [imagePrompt, setImagePrompt] = useState("");
  const [audienceKind, setAudienceKind] = useState<AudienceKind>(() => {
    const phones = (globalThis as unknown as Record<string, unknown>)[
      SELECTED_PHONES_KEY
    ] as string[] | undefined;
    return phones && phones.length > 0 ? "selected" : "all";
  });
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("now");

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

  useEffect(() => {
    if (params.example) {
      const ex = findTemplateExample(params.example);
      if (!ex) {
        setBootstrapError("المثال غير موجود");
        return;
      }
      if (imagePrompt === "" && ex.preview.image_prompt) {
        setImagePrompt(ex.preview.image_prompt);
      }
      setDraft({
        campaignName: `${ex.title} — ${new Date().toLocaleDateString("ar")}`,
        templateName: `${ex.title} ${Date.now().toString(36).slice(-4)}`,
        body: ex.preview.body_template,
        headerType: ex.preview.header_type,
        headerText: ex.preview.header_text ?? "",
        headerImageUrl: null,
        footerText: ex.preview.footer_text ?? "",
        buttons: (ex.preview.buttons as unknown as Record<string, unknown>[]) ?? null,
        variables: ex.variables ?? null,
        sampleValues: ex.sampleValues ?? null,
        language: ex.language,
        category: ex.category,
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
        templateName: t.name,
        body: t.body_template ?? "",
        headerType: (t.header_type as "none" | "text" | "image") ?? "none",
        headerText: t.header_text ?? "",
        headerImageUrl: t.header_image_url ?? null,
        footerText: t.footer_text ?? "",
        buttons: (t.buttons as Array<Record<string, unknown>>) ?? null,
        variables: t.variables ?? null,
        sampleValues: null,
        language: t.language ?? "ar",
        category:
          (t.category as "MARKETING" | "UTILITY" | "AUTHENTICATION") ||
          "MARKETING",
        reuseTemplateId: t.id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.example, params.from, templatesQuery.data]);

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

  // ---- Image handling (upload / AI gen) -----------------------------------

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error("نحتاج الوصول إلى الصور");
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.85,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (res.canceled || !res.assets?.[0]) return null;
      const asset = res.assets[0];
      if (!asset.base64) throw new Error("تعذّر قراءة الصورة");
      const contentType =
        asset.mimeType ||
        (asset.uri.endsWith(".png") ? "image/png" : "image/jpeg");
      return uploadTemplateImage({
        base64: asset.base64,
        content_type: contentType,
      });
    },
    onSuccess: (r) => {
      if (r && draft) setDraft({ ...draft, headerImageUrl: r.url });
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "فشل رفع الصورة"),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!imagePrompt.trim()) throw new Error("اكتبي وصف الصورة أولاً");
      return generateTemplateImage({
        prompt: imagePrompt.trim(),
        language: (draft?.language === "en" ? "en" : "ar"),
        aspect_ratio: "16:9",
      });
    },
    onSuccess: (r) => {
      if (draft) setDraft({ ...draft, headerImageUrl: r.url });
    },
    onError: (e: unknown) =>
      Alert.alert(
        "خطأ",
        e instanceof Error ? e.message : "فشل توليد الصورة"
      ),
  });

  // ---- Create template (if new) + campaign + audience ---------------------

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("لا توجد بيانات");
      if (!draft.campaignName.trim()) throw new Error("اسم الحملة مطلوب");

      let templateId = draft.reuseTemplateId;

      if (!templateId) {
        if (draft.headerType === "image" && !draft.headerImageUrl) {
          throw new Error("يجب إضافة صورة للرأس أولاً");
        }
        if (!draft.templateName.trim()) {
          throw new Error("اسم القالب مطلوب");
        }
        const { template } = await createMarketingTemplate({
          name: draft.templateName.trim(),
          body_template: draft.body,
          language: draft.language,
          category: draft.category === "UTILITY" ? "UTILITY" : "MARKETING",
          header_type: draft.headerType,
          header_text: draft.headerType === "text" ? draft.headerText : null,
          header_image_url:
            draft.headerType === "image" ? draft.headerImageUrl : null,
          footer_text: draft.footerText || null,
          buttons: draft.buttons,
          variables: draft.variables,
          sample_values: draft.sampleValues,
          submit: true,
        });
        // A fresh template is `submitted` — can't create a campaign until Meta
        // approves. Tell the user and land them on the templates screen so
        // they see the pending state and get a push when it flips.
        qc.invalidateQueries({ queryKey: qk.marketingTemplates(restaurantId) });
        Alert.alert(
          "تم إرسال القالب للاعتماد",
          "ستصل إشعار عند اعتماده من واتساب. بعدها يمكنك إنشاء الحملة بنقرة واحدة.",
          [
            {
              text: "فتح القوالب",
              onPress: () =>
                router.replace({ pathname: "/campaigns/templates" }),
            },
          ]
        );
        return { pendingTemplateId: template.id };
      }

      // Reuse path → create the campaign (with optional schedule)
      const scheduledAt =
        scheduleKind === "now"
          ? null
          : scheduleKind === "+1h"
            ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
            : scheduleKind === "+3h"
              ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const campaign = await createMarketingCampaign({
        name: draft.campaignName.trim(),
        template_id: templateId,
        scheduled_at: scheduledAt,
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
    onSuccess: (result) => {
      delete (globalThis as unknown as Record<string, unknown>)[
        SELECTED_PHONES_KEY
      ];
      qc.invalidateQueries({ queryKey: qk.marketingCampaigns(restaurantId) });
      if ("pendingTemplateId" in result) return;
      const { campaign, aud } = result;
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

  const isNewTemplate = !draft.reuseTemplateId;
  const submitDisabled =
    createMutation.isPending ||
    !draft.campaignName.trim() ||
    (!isNewTemplate && audienceCount === 0) ||
    (isNewTemplate &&
      draft.headerType === "image" &&
      !draft.headerImageUrl);

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 140 }}>
        {/* Campaign name */}
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

        {/* Template name (new-template path only) */}
        {isNewTemplate ? (
          <ManagerCard className="mb-3">
            <Text className="text-right text-xs font-bold text-gray-500">
              اسم القالب (داخلي)
            </Text>
            <TextInput
              value={draft.templateName}
              onChangeText={(v) => setDraft({ ...draft, templateName: v })}
              textAlign="right"
              className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
            />
            <Text className="mt-1 text-right text-[10px] text-gray-400">
              يُستخدم لدى واتساب للاعتماد. أحرف ورقم فقط.
            </Text>
          </ManagerCard>
        ) : null}

        {/* Variable fill-ins — what Meta reviewers see as the realized
            message. The body keeps the `{{n}}` placeholders; these values
            are sent alongside as realistic sample data. */}
        {isNewTemplate && draft.variables && draft.variables.length > 0 ? (
          <ManagerCard className="mb-3">
            <Text className="text-right text-xs font-bold text-gray-500">
              املئي بيانات الاعتماد (مثال حقيقي)
            </Text>
            <Text className="mt-1 text-right text-[10px] text-gray-400">
              قيم واقعية يراها مراجع واتساب أثناء الاعتماد. لا تؤثر على ما
              سيُرسل لعملائك لاحقاً.
            </Text>
            <View className="mt-2 gap-2">
              {draft.variables.map((label, idx) => (
                <View key={`${label}-${idx}`}>
                  <Text className="text-right text-[11px] font-semibold text-gray-600">
                    {`{{${idx + 1}}} — ${label}`}
                  </Text>
                  <TextInput
                    value={draft.sampleValues?.[idx] ?? ""}
                    onChangeText={(v) => {
                      const next = [...(draft.sampleValues ?? [])];
                      while (next.length < (draft.variables?.length ?? 0)) {
                        next.push("");
                      }
                      next[idx] = v;
                      setDraft({ ...draft, sampleValues: next });
                    }}
                    textAlign="right"
                    className="mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
                  />
                </View>
              ))}
            </View>
          </ManagerCard>
        ) : null}

        {/* Image picker — only when header_type === 'image' and template is new */}
        {isNewTemplate && draft.headerType === "image" ? (
          <ManagerCard className="mb-3">
            <Text className="text-right text-xs font-bold text-gray-500">
              صورة الرأس
            </Text>

            {draft.headerImageUrl ? (
              <Image
                source={{ uri: draft.headerImageUrl }}
                style={{
                  width: "100%",
                  height: 180,
                  borderRadius: 8,
                  marginTop: 8,
                  backgroundColor: "#eee",
                }}
                resizeMode="cover"
              />
            ) : (
              <View className="mt-2 items-center justify-center rounded-md border border-dashed border-gray-300 bg-white py-10">
                <Ionicons name="image-outline" size={32} color="#9CA3AF" />
                <Text className="mt-1 text-[11px] text-gray-500">
                  اختاري من المعرض أو وَلِّدي بالذكاء الاصطناعي
                </Text>
              </View>
            )}

            <View className="mt-2 flex-row-reverse gap-2">
              <Pressable
                onPress={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending}
                className="flex-1 flex-row-reverse items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white py-2"
              >
                {uploadMutation.isPending ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="cloud-upload-outline"
                      size={14}
                      color={managerColors.muted}
                    />
                    <Text className="text-xs font-semibold text-gray-700">
                      رفع من الجهاز
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

            <Text className="mt-3 text-right text-[11px] font-bold text-gray-500">
              أو ولِّدي بالذكاء الاصطناعي
            </Text>
            <TextInput
              value={imagePrompt}
              onChangeText={setImagePrompt}
              placeholder="مثال: صورة دعائية لخصم 50% بألوان دافئة"
              placeholderTextColor="#9CA3AF"
              textAlign="right"
              multiline
              className="mt-1 min-h-[56px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
            />
            <Pressable
              onPress={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !imagePrompt.trim()}
              className={`mt-2 flex-row-reverse items-center justify-center gap-1.5 rounded-full py-2 ${
                !imagePrompt.trim() || generateMutation.isPending
                  ? "bg-gray-200"
                  : "bg-emerald-600"
              }`}
            >
              {generateMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <Text className="text-xs font-bold text-white">
                    وَلِّدي صورة
                  </Text>
                </>
              )}
            </Pressable>
          </ManagerCard>
        ) : null}

        {/* Live preview */}
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
            {draft.headerType === "image" && draft.headerImageUrl ? (
              <Image
                source={{ uri: draft.headerImageUrl }}
                style={{
                  width: "100%",
                  height: 140,
                  borderRadius: 6,
                  marginBottom: 6,
                  backgroundColor: "#eee",
                }}
              />
            ) : null}
            <Text className="text-right text-sm leading-6 text-gray-950">
              {renderBodyWithSamples(draft.body, draft.sampleValues)}
            </Text>
            {draft.footerText ? (
              <Text className="mt-2 text-right text-[10px] text-gray-500">
                {draft.footerText}
              </Text>
            ) : null}
          </View>
          {isNewTemplate ? (
            <Text className="mt-2 text-right text-[10px] text-amber-700">
              سيتم إرسال القالب لواتساب للاعتماد. إشعار سيصلك عند النتيجة.
            </Text>
          ) : null}
        </ManagerCard>

        {/* Audience + schedule — only meaningful on reuse path */}
        {!isNewTemplate ? (
          <>
            <ManagerCard className="mb-3">
              <Text className="text-right text-xs font-bold text-gray-500">
                الجمهور
              </Text>
              <View className="mt-2 flex-row-reverse flex-wrap gap-2">
                <Chip
                  label="كل العملاء"
                  active={audienceKind === "all"}
                  onPress={() => setAudienceKind("all")}
                />
                <Chip
                  label="آخر ٣٠ يوم"
                  active={audienceKind === "30d"}
                  onPress={() => setAudienceKind("30d")}
                />
                <Chip
                  label="آخر ٩٠ يوم"
                  active={audienceKind === "90d"}
                  onPress={() => setAudienceKind("90d")}
                />
                {selectedPhones.length > 0 ? (
                  <Chip
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

            <ManagerCard className="mb-3">
              <Text className="text-right text-xs font-bold text-gray-500">
                الإرسال
              </Text>
              <View className="mt-2 flex-row-reverse flex-wrap gap-2">
                <Chip
                  label="الآن"
                  active={scheduleKind === "now"}
                  onPress={() => setScheduleKind("now")}
                />
                <Chip
                  label="بعد ساعة"
                  active={scheduleKind === "+1h"}
                  onPress={() => setScheduleKind("+1h")}
                />
                <Chip
                  label="بعد ٣ ساعات"
                  active={scheduleKind === "+3h"}
                  onPress={() => setScheduleKind("+3h")}
                />
                <Chip
                  label="غداً"
                  active={scheduleKind === "+24h"}
                  onPress={() => setScheduleKind("+24h")}
                />
              </View>
            </ManagerCard>
          </>
        ) : null}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-3">
        <View className="flex-row-reverse gap-2">
          <Pressable
            disabled={submitDisabled}
            onPress={() => createMutation.mutate()}
            className={`flex-1 items-center rounded-lg py-3 ${
              submitDisabled ? "bg-[#B6E5D6]" : "bg-[#00A884]"
            }`}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-bold text-white">
                {isNewTemplate
                  ? "إرسال القالب للاعتماد"
                  : `إنشاء الحملة (${audienceCount.toLocaleString()})`}
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

function renderBodyWithSamples(
  body: string,
  samples: string[] | null | undefined
): string {
  if (!samples || samples.length === 0) return body;
  return body.replace(/\{\{(\d+)\}\}/g, (match, g1) => {
    const i = Number(g1) - 1;
    const v = samples[i];
    return v && v.trim() ? v : match;
  });
}

function Chip({
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
