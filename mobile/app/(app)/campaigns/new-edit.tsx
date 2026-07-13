import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Platform } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
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
  listAllMarketingTemplates,
  listMarketingCustomers,
  listMarketingTemplates,
  sendMarketingCampaign,
  setCampaignAudience,
  uploadTemplateImage,
} from "../../../lib/api";
import {
  type TemplateExample,
  findTemplateExample,
} from "../../../lib/template-examples";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors, softShadow } from "../../../components/manager-ui";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "../../../components/tw";

const SELECTED_PHONES_KEY = "whatsapp-cs:campaign-prefill-phones";

type AudienceKind = "all" | "30d" | "90d" | "selected";
type ScheduleKind = "now" | "+1h" | "+3h" | "+24h" | "custom";

/** Default custom send time: tomorrow at the next full hour. */
function defaultCustomDate(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

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
  /** Set on the duplicate-and-fix path: why the previous copy was rejected. */
  rejectionReason?: string | null;
}

type StepId = "content" | "image" | "message" | "audience" | "schedule" | "review";

interface StepDef {
  id: StepId;
  title: string;
  subtitle: string;
}

const NEW_TEMPLATE_STEPS: StepDef[] = [
  {
    id: "content",
    title: "محتوى الحملة",
    subtitle: "اسم الحملة وقيم الرسالة التي ستصل لعملائك",
  },
  {
    id: "image",
    title: "صورة الرأس",
    subtitle: "ارفع صورة أو ولّدها بالذكاء الاصطناعي",
  },
  {
    id: "audience",
    title: "الجمهور",
    subtitle: "اختر من سيستلم هذه الحملة",
  },
  {
    id: "schedule",
    title: "التوقيت",
    subtitle: "تنطلق الحملة تلقائياً فور اعتماد القالب",
  },
  {
    id: "review",
    title: "المراجعة والإرسال",
    subtitle: "يُرسل القالب للاعتماد وتنطلق الحملة تلقائياً بعده",
  },
];

const REUSE_STEPS: StepDef[] = [
  {
    id: "message",
    title: "الرسالة",
    subtitle: "اسم الحملة ومتغيّرات الرسالة",
  },
  {
    id: "audience",
    title: "الجمهور",
    subtitle: "اختر من سيستلم هذه الحملة",
  },
  {
    id: "schedule",
    title: "التوقيت",
    subtitle: "أرسل الآن أو حدد موعداً",
  },
  {
    id: "review",
    title: "المراجعة والإطلاق",
    subtitle: "تأكد من كل شيء قبل الإرسال",
  },
];

/**
 * {{1}} is always the customer name, filled per-recipient from the customer
 * record at send time. This is the campaign-level fallback greeting used for
 * recipients with no stored name — the owner can customize it but never
 * types an individual customer's name.
 */
const nameFallbackFor = (language: string) =>
  language === "en" ? "Dear customer" : "عميلنا العزيز";

/** Realistic sample name shown to Meta reviewers for {{1}} — never typed. */
const SAMPLE_CUSTOMER_NAME = "عبدالله";

/** Arabic display labels for the English variable keys the examples ship. */
const VAR_LABELS_AR: Record<string, string> = {
  customer_name: "اسم العميل",
  discount_percent: "نسبة الخصم",
  promo_code: "كود الخصم",
  bonus_offer: "العرض الإضافي",
  order_number: "رقم الطلب",
  status_text: "حالة الطلب",
  event_name: "اسم المناسبة",
  event_date: "تاريخ المناسبة",
  visit_day: "يوم الزيارة",
  booking_time: "موعد الحجز",
  party_size: "عدد الأشخاص",
};

const varLabel = (key: string) =>
  VAR_LABELS_AR[key] ?? key.replace(/_/g, " ");

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const arNum = (n: number) =>
  String(n)
    .split("")
    .map((d) => AR_DIGITS[Number(d)] ?? d)
    .join("");

export default function CampaignNewEditScreen() {
  const params = useLocalSearchParams<{
    example?: string;
    from?: string;
    fix?: string;
  }>();
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
  const [customDate, setCustomDate] = useState<Date>(defaultCustomDate);
  const [androidPicker, setAndroidPicker] = useState<"date" | "time" | null>(
    null
  );
  const [reuseVarValues, setReuseVarValues] = useState<string[]>([]);
  const [stepIndex, setStepIndex] = useState(0);

  // Step transition: quick fade + slide, onboarding-style.
  const stepAnim = useRef(new Animated.Value(1)).current;
  const goToStep = (next: number) => {
    stepAnim.setValue(0);
    setStepIndex(next);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

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

  // Duplicate-and-fix needs non-approved templates too.
  const allTemplatesQuery = useQuery({
    queryKey: qk.marketingTemplatesAll(restaurantId),
    enabled: !!params.fix && !!restaurantId,
    queryFn: listAllMarketingTemplates,
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
        // {{1}} is always the customer name — auto-seed its review sample so
        // the owner is never asked to type a customer name.
        sampleValues:
          ex.variables && ex.variables.length > 0
            ? ex.variables.map(
                (_, i) =>
                  ex.sampleValues?.[i] ?? (i === 0 ? SAMPLE_CUSTOMER_NAME : "")
              )
            : (ex.sampleValues ?? null),
        language: ex.language,
        category: ex.category,
        example: ex,
      });
      return;
    }
    if (params.fix && allTemplatesQuery.data) {
      const t = allTemplatesQuery.data.find(
        (x: MarketingTemplate) => x.id === params.fix
      );
      if (!t) {
        setBootstrapError("القالب غير موجود");
        return;
      }
      // Rejected Twilio content can't be resubmitted — this drafts a fresh
      // template with the same content on the new-template wizard path.
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
        sampleValues:
          t.variables && t.variables.length > 0
            ? t.variables.map((_, i) => (i === 0 ? SAMPLE_CUSTOMER_NAME : ""))
            : null,
        language: t.language ?? "ar",
        category:
          (t.category as "MARKETING" | "UTILITY" | "AUTHENTICATION") ||
          "MARKETING",
        rejectionReason: t.rejection_reason ?? null,
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
      // Seed the {{1}} fallback greeting so no recipient ever gets a raw
      // "{{1}}" — real names from the customer record still take precedence.
      if ((t.variables?.length ?? 0) > 0) {
        setReuseVarValues([nameFallbackFor(t.language ?? "ar")]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.example, params.from, params.fix, templatesQuery.data, allTemplatesQuery.data]);

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
      // Respect the user's decision — if they denied photo access, do nothing.
      // Throwing an error here surfaces a "please reconsider" alert to the
      // user, which violates App Store guideline 5.1.1(iv).
      if (!perm.granted) return null;
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
      if (!imagePrompt.trim()) throw new Error("اكتب وصف الصورة أولاً");
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
      let awaitingApproval = false;

      if (!templateId) {
        if (draft.headerType === "image" && !draft.headerImageUrl) {
          throw new Error("يجب إضافة صورة للرأس أولاً");
        }
        const { template } = await createMarketingTemplate({
          name: draft.templateName.trim() || draft.campaignName.trim(),
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
        qc.invalidateQueries({ queryKey: qk.marketingTemplates(restaurantId) });
        // The campaign is created below as `pending_template_approval` and
        // the approval poller launches it automatically when Meta approves —
        // the user never re-enters this flow.
        templateId = template.id;
        awaitingApproval = true;
      }

      const scheduledAt =
        scheduleKind === "now"
          ? null
          : scheduleKind === "+1h"
            ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
            : scheduleKind === "+3h"
              ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
              : scheduleKind === "+24h"
                ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                : customDate.toISOString();

      const campaign = await createMarketingCampaign({
        name: draft.campaignName.trim(),
        template_id: templateId,
        scheduled_at: scheduledAt,
      });

      // Shared variable values for the send. {{1}} stays per-recipient (name
      // with fallback); on the new-template path the sample values double as
      // the real values for {{2}}+.
      const sourceValues = awaitingApproval
        ? (draft.sampleValues ?? [])
        : reuseVarValues;
      const variableValues: Record<string, string> = {};
      (draft.variables ?? []).forEach((_, idx) => {
        if (awaitingApproval && idx === 0) return;
        const v = sourceValues[idx]?.trim();
        if (v) variableValues[String(idx + 1)] = v;
      });

      const selection: AudienceSelection = {
        ...(audienceKind === "selected"
          ? { kind: "custom", phones: selectedPhones }
          : audienceKind === "all"
            ? { kind: "all" }
            : { kind: "since", since: since! }),
        ...(Object.keys(variableValues).length > 0 ? { variable_values: variableValues } : {}),
      };

      const aud = await setCampaignAudience(campaign.id, selection);

      // Commit the send for approved templates: enqueue per-recipient jobs
      // now. For a scheduled campaign the worker drains them at
      // `scheduled_at`; for "now" it sends on the next worker tick. A
      // pending-approval campaign is enqueued by the poller on approval.
      if (!awaitingApproval && aud.total_recipients > 0) {
        await sendMarketingCampaign(campaign.id);
      }
      return { campaign, aud, scheduledAt, awaitingApproval };
    },
    onSuccess: (result) => {
      delete (globalThis as unknown as Record<string, unknown>)[
        SELECTED_PHONES_KEY
      ];
      qc.invalidateQueries({ queryKey: qk.marketingCampaigns(restaurantId) });
      const { campaign, aud, scheduledAt, awaitingApproval } = result;
      const title = awaitingApproval
        ? "تم إرسال القالب للاعتماد ✅"
        : scheduledAt
          ? "تم جدولة الحملة"
          : "بدأ إرسال الحملة";
      const body = awaitingApproval
        ? `حملتك جاهزة وستنطلق تلقائياً إلى ${aud.total_recipients} جهة اتصال فور اعتماد واتساب للقالب (عادةً خلال دقائق إلى ٤٨ ساعة). سيصلك إشعار عندها.`
        : scheduledAt
          ? `ستُرسل تلقائيًا في الموعد المحدد إلى ${aud.total_recipients} جهة اتصال.`
          : aud.total_recipients > 0
            ? `جارٍ الإرسال إلى ${aud.total_recipients} جهة اتصال.`
            : "لا توجد جهات اتصال في هذا الجمهور.";
      Alert.alert(title, body, [
        {
          text: "فتح الحملة",
          onPress: () =>
            router.replace({
              pathname: "/campaigns/[id]",
              params: { id: campaign.id },
            }),
        },
      ]);
    },
    onError: (e: unknown) =>
      Alert.alert("خطأ", e instanceof Error ? e.message : "خطأ غير معروف"),
  });

  if (bootstrapError) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#EFF3FF] p-6">
        <Text className="text-center text-sm text-red-700">
          {bootstrapError}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-3 rounded-full border border-[#D6DDF8] px-4 py-2"
        >
          <Text className="text-xs text-[#5E6A99]">العودة</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!draft) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#EFF3FF]">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const isNewTemplate = !draft.reuseTemplateId;
  const steps = (isNewTemplate ? NEW_TEMPLATE_STEPS : REUSE_STEPS).filter(
    (s) => s.id !== "image" || draft.headerType === "image"
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;

  const varCount = draft.variables?.length ?? 0;
  const stepValid = (() => {
    switch (step.id) {
      case "content":
        // Meta reviewers judge the realized sample message — empty or
        // placeholder-looking samples are a documented rejection cause.
        return (
          !!draft.campaignName.trim() &&
          Array.from({ length: varCount }).every((_, i) =>
            (draft.sampleValues?.[i] ?? "").trim()
          )
        );
      case "image":
        return !!draft.headerImageUrl;
      case "message":
        // {{1}} (index 0) is auto-personalized with a backend fallback, so
        // only the shared variables ({{2}}+) are required here.
        return (
          !!draft.campaignName.trim() &&
          Array.from({ length: varCount }).every(
            (_, i) => i === 0 || (reuseVarValues[i] ?? "").trim()
          )
        );
      case "audience":
        return audienceCount > 0;
      case "schedule":
        return scheduleKind !== "custom" || customDate.getTime() > Date.now();
      default:
        return true;
    }
  })();

  const previewSamples = isNewTemplate
    ? draft.sampleValues
    : [
        reuseVarValues[0]?.trim() || nameFallbackFor(draft.language),
        ...reuseVarValues.slice(1),
      ];

  const customDateLabel = customDate.toLocaleString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const scheduleLabel =
    scheduleKind === "now"
      ? "الآن"
      : scheduleKind === "+1h"
        ? "بعد ساعة"
        : scheduleKind === "+3h"
          ? "بعد ٣ ساعات"
          : scheduleKind === "+24h"
            ? "غداً"
            : customDateLabel;

  const audienceLabel =
    audienceKind === "all"
      ? "كل العملاء"
      : audienceKind === "30d"
        ? "آخر ٣٠ يوم"
        : audienceKind === "90d"
          ? "آخر ٩٠ يوم"
          : `عملاء محددون (${arNum(selectedPhones.length)})`;

  const primaryLabel = isLastStep
    ? isNewTemplate
      ? "إرسال للاعتماد والإطلاق تلقائياً"
      : scheduleKind === "now"
        ? `إطلاق الحملة (${audienceCount.toLocaleString("ar")})`
        : "جدولة الحملة"
    : "التالي";

  const onPrimary = () => {
    if (isLastStep) {
      createMutation.mutate();
    } else {
      goToStep(stepIndex + 1);
    }
  };

  const onBack = () => {
    if (stepIndex === 0) router.back();
    else goToStep(stepIndex - 1);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#EFF3FF]" edges={["top", "bottom"]}>
      {/* ---- Wizard header: progress + step title -------------------------- */}
      <View className="border-b border-[#D6DDF8] bg-white px-4 pb-3 pt-3">
        <View className="flex-row-reverse items-center justify-between">
          <Text className="text-[11px] font-bold text-[#5E6A99]">
            الخطوة {arNum(stepIndex + 1)} من {arNum(steps.length)}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="close" size={18} color={managerColors.muted} />
          </Pressable>
        </View>
        <View className="mt-2 flex-row-reverse gap-1.5">
          {steps.map((s, i) => (
            <View
              key={s.id}
              className={`h-1.5 flex-1 rounded-full ${
                i <= stepIndex ? "bg-[#011F91]" : "bg-[#E2E8FF]"
              }`}
            />
          ))}
        </View>
        <Text className="mt-3 text-right text-lg font-bold text-[#16245C]">
          {step.title}
        </Text>
        <Text className="mt-0.5 text-right text-[11px] text-[#5E6A99]">
          {step.subtitle}
        </Text>
      </View>

      <Animated.View
        style={{
          flex: 1,
          opacity: stepAnim,
          transform: [
            {
              translateY: stepAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        }}
      >
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 140 }}>
          {/* ================= NEW TEMPLATE: content ======================= */}
          {step.id === "content" ? (
            <>
              {draft.rejectionReason ? (
                <View className="mb-3 flex-row-reverse items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <View className="flex-1">
                    <Text className="text-right text-xs font-bold text-red-800">
                      رفض واتساب النسخة السابقة
                    </Text>
                    <Text className="mt-0.5 text-right text-[11px] leading-4 text-red-700">
                      {draft.rejectionReason}
                    </Text>
                    <Text className="mt-1 text-right text-[10px] text-red-500">
                      عدّل القيم أدناه ثم أعد الإرسال — يُنشأ قالب جديد
                      تلقائياً.
                    </Text>
                  </View>
                </View>
              ) : null}
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
                <Text className="mt-1 text-right text-[10px] text-gray-400">
                  اسم داخلي يظهر لك فقط في قائمة الحملات.
                </Text>
              </ManagerCard>

              {draft.variables && draft.variables.length > 0 ? (
                <ManagerCard className="mb-3">
                  {/* {{1}} — auto-personalized per recipient; the owner never
                      types a customer name anywhere in this flow. */}
                  <View className="flex-row-reverse items-center gap-2 rounded-xl border border-[#D6DDF8] bg-[#F5F7FF] p-3">
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-[#011F91]">
                      <Ionicons name="person" size={14} color="#FCBD05" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-right text-xs font-bold text-[#16245C]">
                        اسم العميل — يُملأ تلقائياً
                      </Text>
                      <Text className="mt-0.5 text-right text-[10px] leading-4 text-[#5E6A99]">
                        كل عميل يستلم الرسالة باسمه المحفوظ لديك، ومن لا اسم له
                        نحييه بـ«{nameFallbackFor(draft.language)}».
                      </Text>
                    </View>
                  </View>

                  {draft.variables.length > 1 ? (
                    <>
                      <Text className="mt-4 text-right text-xs font-bold text-gray-500">
                        قيم الرسالة
                      </Text>
                      <Text className="mt-1 text-right text-[10px] leading-4 text-gray-400">
                        تظهر في رسالتك لجميع العملاء ويراها مراجع واتساب أثناء
                        الاعتماد.
                      </Text>
                      <View className="mt-2 gap-2">
                        {draft.variables.map((label, idx) => {
                          if (idx === 0) return null;
                          const missing = !(draft.sampleValues?.[idx] ?? "").trim();
                          return (
                            <View key={`${label}-${idx}`}>
                              <Text className="text-right text-[11px] font-semibold text-gray-600">
                                {`${varLabel(label)} (مطلوب)`}
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
                                className={`mt-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-950 ${
                                  missing ? "border-amber-300" : "border-gray-200"
                                }`}
                              />
                            </View>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                </ManagerCard>
              ) : null}
            </>
          ) : null}

          {/* ================= NEW TEMPLATE: image ========================= */}
          {step.id === "image" ? (
            <ManagerCard className="mb-3">
              {draft.headerImageUrl ? (
                <View>
                  <Image
                    source={{ uri: draft.headerImageUrl }}
                    style={{
                      width: "100%",
                      height: 190,
                      borderRadius: 12,
                      backgroundColor: "#eee",
                    }}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() =>
                      setDraft({ ...draft, headerImageUrl: null })
                    }
                    className="mt-2 items-center rounded-full border border-gray-200 bg-white py-1.5"
                  >
                    <Text className="text-[11px] text-gray-600">
                      إزالة الصورة والاختيار من جديد
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="items-center justify-center rounded-xl border border-dashed border-[#B9C6F5] bg-[#F5F7FF] py-10">
                  <Ionicons
                    name="image-outline"
                    size={34}
                    color={managerColors.brand}
                  />
                  <Text className="mt-1 text-[11px] text-[#5E6A99]">
                    اختر من المعرض أو وَلِّد بالذكاء الاصطناعي
                  </Text>
                </View>
              )}

              <Pressable
                onPress={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending}
                className="mt-3 flex-row-reverse items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white py-2.5"
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

              <Text className="mt-4 text-right text-[11px] font-bold text-gray-500">
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
                className={`mt-2 flex-row-reverse items-center justify-center gap-1.5 rounded-full py-2.5 ${
                  !imagePrompt.trim() || generateMutation.isPending
                    ? "bg-gray-200"
                    : "bg-[#011F91]"
                }`}
              >
                {generateMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={14} color="#FCBD05" />
                    <Text className="text-xs font-bold text-white">
                      وَلِّدي صورة
                    </Text>
                  </>
                )}
              </Pressable>
            </ManagerCard>
          ) : null}

          {/* ================= REUSE: message =============================== */}
          {step.id === "message" ? (
            <>
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

              {draft.variables && draft.variables.length > 0 ? (
                <ManagerCard className="mb-3">
                  {/* {{1}} — never typed by the owner: auto-personalized per
                      recipient, with a customizable fallback greeting. */}
                  <View className="rounded-xl border border-[#D6DDF8] bg-[#F5F7FF] p-3">
                    <View className="flex-row-reverse items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-[#011F91]">
                        <Ionicons name="person" size={14} color="#FCBD05" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-right text-xs font-bold text-[#16245C]">
                          اسم العميل — يُملأ تلقائياً
                        </Text>
                        <Text className="mt-0.5 text-right text-[10px] leading-4 text-[#5E6A99]">
                          كل عميل يستلم الرسالة باسمه المحفوظ لديك. لا تكتب اسماً هنا.
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-3 text-right text-[11px] font-semibold text-gray-600">
                      إذا لم يكن للعميل اسم محفوظ، نستخدم بدلاً منه:
                    </Text>
                    <TextInput
                      value={reuseVarValues[0] ?? ""}
                      onChangeText={(v) => {
                        const next = [...reuseVarValues];
                        if (next.length === 0) next.push("");
                        next[0] = v;
                        setReuseVarValues(next);
                      }}
                      placeholder={nameFallbackFor(draft.language)}
                      placeholderTextColor="#9CA3AF"
                      textAlign="right"
                      className="mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950"
                    />
                  </View>

                  {draft.variables.length > 1 ? (
                    <>
                      <Text className="mt-4 text-right text-xs font-bold text-gray-500">
                        باقي متغيّرات الرسالة
                      </Text>
                      <Text className="mt-1 text-right text-[10px] text-gray-400">
                        هذه القيم موحّدة وتُرسل لجميع العملاء كما هي.
                      </Text>
                      <View className="mt-2 gap-2">
                        {draft.variables.map((label, idx) => {
                          if (idx === 0) return null;
                          const missing = !(reuseVarValues[idx] ?? "").trim();
                          return (
                            <View key={`var-${idx}`}>
                              <Text className="text-right text-[11px] font-semibold text-gray-600">
                                {`${varLabel(label)} (مطلوب)`}
                              </Text>
                              <TextInput
                                value={reuseVarValues[idx] ?? ""}
                                onChangeText={(v) => {
                                  const next = [...reuseVarValues];
                                  while (next.length <= idx) next.push("");
                                  next[idx] = v;
                                  setReuseVarValues(next);
                                }}
                                textAlign="right"
                                placeholderTextColor="#9CA3AF"
                                className={`mt-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-950 ${
                                  missing ? "border-amber-300" : "border-gray-200"
                                }`}
                              />
                            </View>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                </ManagerCard>
              ) : null}

              <MessagePreview draft={draft} samples={previewSamples} />
            </>
          ) : null}

          {/* ================= REUSE: audience ============================== */}
          {step.id === "audience" ? (
            <>
              <View className="mb-3 gap-2">
                <AudienceOption
                  icon="people"
                  label="كل العملاء"
                  hint="جميع من راسل مطعمك عبر واتساب"
                  active={audienceKind === "all"}
                  onPress={() => setAudienceKind("all")}
                />
                <AudienceOption
                  icon="time"
                  label="آخر ٣٠ يوم"
                  hint="العملاء النشطون خلال الشهر الماضي"
                  active={audienceKind === "30d"}
                  onPress={() => setAudienceKind("30d")}
                />
                <AudienceOption
                  icon="calendar"
                  label="آخر ٩٠ يوم"
                  hint="العملاء النشطون خلال ٣ أشهر"
                  active={audienceKind === "90d"}
                  onPress={() => setAudienceKind("90d")}
                />
                {selectedPhones.length > 0 ? (
                  <AudienceOption
                    icon="checkmark-circle"
                    label={`المحددون (${arNum(selectedPhones.length)})`}
                    hint="جهات الاتصال التي اخترتها من قائمة العملاء"
                    active={audienceKind === "selected"}
                    onPress={() => setAudienceKind("selected")}
                  />
                ) : null}
              </View>

              <ManagerCard>
                <View className="flex-row-reverse items-center justify-between">
                  <View className="flex-row-reverse items-center gap-2">
                    <Ionicons
                      name="paper-plane-outline"
                      size={16}
                      color={managerColors.brand}
                    />
                    <Text className="text-sm text-gray-700">
                      سيستلم هذه الحملة
                    </Text>
                  </View>
                  <Text className="text-xl font-bold text-[#16245C] tabular-nums">
                    {audienceQuery.isLoading && audienceKind !== "selected"
                      ? "…"
                      : audienceCount.toLocaleString("ar")}
                  </Text>
                </View>
                {audienceCount === 0 && !audienceQuery.isLoading ? (
                  <Text className="mt-2 text-right text-[11px] text-red-600">
                    لا توجد جهات اتصال في هذا الجمهور — اختر جمهوراً آخر.
                  </Text>
                ) : null}
              </ManagerCard>
            </>
          ) : null}

          {/* ================= REUSE: schedule ============================== */}
          {step.id === "schedule" ? (
            <View className="gap-2">
              <AudienceOption
                icon="flash"
                label={isNewTemplate ? "أرسل فور الاعتماد" : "أرسل الآن"}
                hint={
                  isNewTemplate
                    ? "تنطلق الحملة تلقائياً لحظة اعتماد واتساب للقالب"
                    : "تبدأ الحملة فور التأكيد"
                }
                active={scheduleKind === "now"}
                onPress={() => setScheduleKind("now")}
              />
              <AudienceOption
                icon="hourglass"
                label="بعد ساعة"
                hint="مناسب لتجهيز المطبخ قبل الطلبات"
                active={scheduleKind === "+1h"}
                onPress={() => setScheduleKind("+1h")}
              />
              <AudienceOption
                icon="restaurant"
                label="بعد ٣ ساعات"
                hint="مثلاً قبل وقت الذروة"
                active={scheduleKind === "+3h"}
                onPress={() => setScheduleKind("+3h")}
              />
              <AudienceOption
                icon="sunny"
                label="غداً في نفس الوقت"
                hint="تُرسل تلقائياً دون أي إجراء منك"
                active={scheduleKind === "+24h"}
                onPress={() => setScheduleKind("+24h")}
              />
              <AudienceOption
                icon="calendar-number"
                label="موعد مخصص"
                hint={
                  scheduleKind === "custom"
                    ? customDateLabel
                    : "اختر اليوم والساعة بدقة"
                }
                active={scheduleKind === "custom"}
                onPress={() => setScheduleKind("custom")}
              />

              {scheduleKind === "custom" ? (
                <ManagerCard>
                  {Platform.OS === "ios" ? (
                    <View className="items-center">
                      <DateTimePicker
                        value={customDate}
                        mode="datetime"
                        display="compact"
                        minuteInterval={5}
                        minimumDate={new Date()}
                        themeVariant="light"
                        onChange={(_: DateTimePickerEvent, date?: Date) => {
                          if (date) setCustomDate(date);
                        }}
                      />
                    </View>
                  ) : (
                    <View className="flex-row-reverse gap-2">
                      <Pressable
                        onPress={() => setAndroidPicker("date")}
                        className="flex-1 items-center rounded-lg border border-[#D6DDF8] bg-white py-2.5"
                      >
                        <Text className="text-xs font-bold text-[#16245C]">
                          {customDate.toLocaleDateString("ar", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setAndroidPicker("time")}
                        className="flex-1 items-center rounded-lg border border-[#D6DDF8] bg-white py-2.5"
                      >
                        <Text className="text-xs font-bold text-[#16245C]">
                          {customDate.toLocaleTimeString("ar", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                  {Platform.OS === "android" && androidPicker ? (
                    <DateTimePicker
                      value={customDate}
                      mode={androidPicker}
                      display="default"
                      minuteInterval={5}
                      minimumDate={new Date()}
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        setAndroidPicker(null);
                        if (event.type === "set" && date) setCustomDate(date);
                      }}
                    />
                  ) : null}
                  {customDate.getTime() <= Date.now() ? (
                    <Text className="mt-2 text-right text-[11px] text-red-600">
                      اختر موعداً في المستقبل.
                    </Text>
                  ) : null}
                </ManagerCard>
              ) : null}
            </View>
          ) : null}

          {/* ================= review (both paths) ========================== */}
          {step.id === "review" ? (
            <>
              <MessagePreview draft={draft} samples={previewSamples} />

              <ManagerCard className="mb-3">
                <SummaryRow
                  icon="megaphone-outline"
                  label="الحملة"
                  value={draft.campaignName}
                />
                <SummaryRow
                  icon="people-outline"
                  label="الجمهور"
                  value={`${audienceLabel} — ${audienceCount.toLocaleString("ar")} جهة`}
                />
                <SummaryRow
                  icon="alarm-outline"
                  label="التوقيت"
                  value={
                    isNewTemplate && scheduleKind === "now"
                      ? "فور اعتماد القالب"
                      : scheduleLabel
                  }
                  last
                />
              </ManagerCard>

              {isNewTemplate ? (
                <ManagerCard className="mb-3">
                  <View className="flex-row-reverse items-center gap-2">
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={16}
                      color={managerColors.warning}
                    />
                    <Text className="flex-1 text-right text-[11px] leading-5 text-[#8A5E00]">
                      يُرسل القالب لواتساب للاعتماد (عادةً من دقائق إلى ٤٨
                      ساعة)، وتنطلق حملتك تلقائياً فور اعتماده — لا تحتاج لأي
                      خطوة إضافية. سيصلك إشعار عند الإطلاق.
                    </Text>
                  </View>
                </ManagerCard>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* ---- Footer: back / next ------------------------------------------- */}
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-[#D6DDF8] bg-white p-3"
        style={softShadow}
      >
        <View className="flex-row-reverse gap-2">
          <Pressable
            disabled={createMutation.isPending || !stepValid}
            onPress={onPrimary}
            className={`flex-[2] flex-row-reverse items-center justify-center gap-2 rounded-xl py-3.5 ${
              createMutation.isPending || !stepValid
                ? "bg-[#B9C6F5]"
                : isLastStep
                  ? "bg-[#00A884]"
                  : "bg-[#011F91]"
            }`}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text className="font-bold text-white">{primaryLabel}</Text>
                <Ionicons
                  name={isLastStep ? "paper-plane" : "arrow-back"}
                  size={15}
                  color="#fff"
                />
              </>
            )}
          </Pressable>
          <Pressable
            onPress={onBack}
            disabled={createMutation.isPending}
            className="flex-1 items-center justify-center rounded-xl border border-[#D6DDF8] bg-white py-3.5"
          >
            <Text className="font-semibold text-[#5E6A99]">
              {stepIndex === 0 ? "إلغاء" : "رجوع"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** WhatsApp-style bubble preview of the realized message. */
function MessagePreview({
  draft,
  samples,
}: {
  draft: Draft;
  samples: string[] | null | undefined;
}) {
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-[#D8E5D0] bg-[#E5DDD5]">
      <View className="flex-row-reverse items-center gap-2 bg-[#075E54] px-3 py-2">
        <Ionicons name="logo-whatsapp" size={14} color="#fff" />
        <Text className="text-[11px] font-bold text-white">
          هكذا ستصل الرسالة لعميلك
        </Text>
      </View>
      <View className="p-3">
        <View
          className="max-w-[92%] self-end rounded-xl rounded-tr-sm bg-white p-2.5"
          style={softShadow}
        >
          {draft.headerType === "text" && draft.headerText ? (
            <Text className="mb-1 text-right text-[12px] font-bold text-gray-800">
              {draft.headerText}
            </Text>
          ) : null}
          {draft.headerType === "image" && draft.headerImageUrl ? (
            <Image
              source={{ uri: draft.headerImageUrl }}
              style={{
                width: "100%",
                height: 140,
                borderRadius: 8,
                marginBottom: 6,
                backgroundColor: "#eee",
              }}
            />
          ) : null}
          <Text className="text-right text-sm leading-6 text-gray-950">
            {renderBodyWithSamples(draft.body, samples)}
          </Text>
          {draft.footerText ? (
            <Text className="mt-1.5 text-right text-[10px] text-gray-500">
              {draft.footerText}
            </Text>
          ) : null}
          <Text className="mt-1 text-left text-[9px] text-gray-400">
            {new Date().toLocaleTimeString("ar", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        {Array.isArray(draft.buttons) && draft.buttons.length > 0 ? (
          <View className="mt-1 max-w-[92%] gap-1 self-end">
            {draft.buttons.map((b, i) => (
              <View
                key={i}
                className="items-center rounded-xl bg-white py-2"
                style={softShadow}
              >
                <Text className="text-[12px] font-semibold text-[#00A5F4]">
                  {String(
                    (b as Record<string, unknown>).text ??
                      (b as Record<string, unknown>).title ??
                      "زر"
                  )}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row-reverse items-center justify-between py-2.5 ${
        last ? "" : "border-b border-[#EEF1FD]"
      }`}
    >
      <View className="flex-row-reverse items-center gap-2">
        <Ionicons name={icon} size={15} color={managerColors.muted} />
        <Text className="text-xs text-[#5E6A99]">{label}</Text>
      </View>
      <Text className="max-w-[60%] text-left text-xs font-bold text-[#16245C]">
        {value}
      </Text>
    </View>
  );
}

function AudienceOption({
  icon,
  label,
  hint,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row-reverse items-center gap-3 rounded-xl border px-3 py-3 ${
        active
          ? "border-[#011F91] bg-[#E2E8FF]"
          : "border-[#D6DDF8] bg-white"
      }`}
    >
      <View
        className={`h-9 w-9 items-center justify-center rounded-full ${
          active ? "bg-[#011F91]" : "bg-[#F5F7FF]"
        }`}
      >
        <Ionicons
          name={icon}
          size={16}
          color={active ? "#FCBD05" : managerColors.muted}
        />
      </View>
      <View className="flex-1">
        <Text
          className={`text-right text-sm font-bold ${
            active ? "text-[#011F91]" : "text-[#16245C]"
          }`}
        >
          {label}
        </Text>
        <Text className="mt-0.5 text-right text-[10px] text-[#5E6A99]">
          {hint}
        </Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={18}
        color={active ? managerColors.brand : "#C7D0F0"}
      />
    </Pressable>
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
