import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMetaCampaign,
  generateCaptions,
  generatePostImage,
  getAiUsage,
  type MetaObjective,
} from "../../../lib/api";
import { ManagerCard, managerColors, softShadow } from "../../../components/manager-ui";

// ---- Static definitions ----------------------------------------------------

interface ObjectiveDef {
  key: MetaObjective;
  title: string;
  desc: string;
  icon: keyof typeof import("@expo/vector-icons/build/Ionicons").default.glyphMap;
  color: string;
}

const OBJECTIVES: ObjectiveDef[] = [
  { key: "OUTCOME_AWARENESS", title: "الوعي بالعلامة", desc: "زيادة عدد من يرى منشورك", icon: "eye", color: "#0EA5E9" },
  { key: "OUTCOME_TRAFFIC", title: "زيارات", desc: "جذب زيارات لموقعك أو واتساب", icon: "navigate", color: "#22C55E" },
  { key: "OUTCOME_ENGAGEMENT", title: "تفاعل", desc: "إعجابات وتعليقات ورسائل", icon: "heart", color: "#E1306C" },
  { key: "OUTCOME_LEADS", title: "عملاء محتملون", desc: "نماذج تواصل مباشرة", icon: "person-add", color: "#7C3AED" },
  { key: "OUTCOME_SALES", title: "مبيعات", desc: "تحويلات على موقعك", icon: "cart", color: "#F59E0B" },
  { key: "OUTCOME_APP_PROMOTION", title: "تنزيلات التطبيق", desc: "زيادة تثبيتات التطبيق", icon: "phone-portrait", color: "#06B6D4" },
];

const COUNTRIES = [
  { code: "SA", name: "السعودية" },
  { code: "AE", name: "الإمارات" },
  { code: "KW", name: "الكويت" },
  { code: "QA", name: "قطر" },
  { code: "BH", name: "البحرين" },
  { code: "OM", name: "عُمان" },
  { code: "EG", name: "مصر" },
  { code: "JO", name: "الأردن" },
];

const STEPS = ["الهدف", "الجمهور", "الميزانية", "الإبداع", "مراجعة"] as const;

// ---- Helpers ---------------------------------------------------------------

function isoFromOffset(daysFromNow: number, hoursFromNow = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(d.getHours() + hoursFromNow, 0, 0, 0);
  return d.toISOString();
}

function formatDateAr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ar-SA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface PickedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

// ============================================================================
// MAIN WIZARD
// ============================================================================

export default function NewCampaignWizard() {
  const params = useLocalSearchParams<{ platform?: string }>();
  const platform: "instagram" | "facebook" =
    params.platform === "facebook" ? "facebook" : "instagram";

  // Wizard state
  const [step, setStep] = useState(0); // 0..4

  // Step 1: Objective
  const [objective, setObjective] = useState<MetaObjective | null>(null);

  // Step 2: Audience
  const [name, setName] = useState("");
  const [countries, setCountries] = useState<string[]>(["SA"]);
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("55");

  // Step 3: Budget + schedule
  const [dailyBudget, setDailyBudget] = useState("50"); // SAR
  const [startDaysOffset, setStartDaysOffset] = useState(0); // today
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDaysOffset, setEndDaysOffset] = useState(7);

  // Step 4: Creative
  const [image, setImage] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // Step 5: Launch behavior
  const [launchNow, setLaunchNow] = useState(false);

  // AI modal state (shared between creative step)
  const [showCaptionAi, setShowCaptionAi] = useState(false);
  const [showImageAi, setShowImageAi] = useState(false);
  const [aiCaptionHint, setAiCaptionHint] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiRefImage, setAiRefImage] = useState<PickedImage | null>(null);
  const [aiCaptions, setAiCaptions] = useState<string[]>([]);
  const [aiPreviewImage, setAiPreviewImage] = useState<PickedImage | null>(null);

  const aiUsageQuery = useQuery({
    queryKey: ["ai-usage-wizard"],
    queryFn: getAiUsage,
    staleTime: 30_000,
  });

  const captionAi = useMutation({
    mutationFn: () =>
      generateCaptions({
        hint: aiCaptionHint.trim() || objective || undefined,
        platform,
        has_image: Boolean(image),
      }),
    onSuccess: (res) => {
      setAiCaptions(res.captions);
      aiUsageQuery.refetch();
    },
    onError: () => Alert.alert("خطأ", "تعذّر توليد التعليق."),
  });

  const imageAi = useMutation({
    mutationFn: () =>
      generatePostImage({
        prompt: aiPrompt.trim(),
        reference_image_base64: aiRefImage?.base64,
        reference_image_type: aiRefImage?.mimeType,
      }),
    onSuccess: (res) => {
      setAiPreviewImage({
        uri: `data:${res.image_type};base64,${res.image_base64}`,
        base64: res.image_base64,
        mimeType: res.image_type,
      });
      aiUsageQuery.refetch();
    },
    onError: () => Alert.alert("خطأ", "تعذّر توليد الصورة."),
  });

  // Submit
  const submitMutation = useMutation({
    mutationFn: () =>
      createMetaCampaign({
        name,
        objective: objective!,
        daily_budget_sar: Number(dailyBudget),
        start_time: isoFromOffset(startDaysOffset),
        end_time: hasEndDate ? isoFromOffset(endDaysOffset, 23) : undefined,
        countries,
        age_min: Number(ageMin),
        age_max: Number(ageMax),
        caption,
        image_base64: image!.base64,
        image_type: image!.mimeType,
        link_url: linkUrl.trim() || undefined,
        launch_now: launchNow,
      }),
    onSuccess: (res) => {
      Alert.alert(
        launchNow ? "تم إنشاء الحملة وتفعيلها" : "تم إنشاء الحملة",
        launchNow
          ? "حملتك الآن نشطة. تابع الأداء من شاشة الحملات."
          : "حملتك مُنشأة بحالة موقوفة. فعّلها من شاشة الحملات عند الجاهزية.",
        [{ text: "حسنًا", onPress: () => router.back() }]
      );
    },
    onError: (e) => {
      const msg = (e as Error).message;
      Alert.alert("فشل إنشاء الحملة", msg.slice(0, 300));
    },
  });

  // Image pickers
  async function pickImage(target: "creative" | "aiRef") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
      allowsEditing: target === "creative",
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0].base64) return;
    const asset = result.assets[0];
    const picked = {
      uri: asset.uri,
      base64: asset.base64!,
      mimeType: asset.mimeType ?? "image/jpeg",
    };
    if (target === "creative") setImage(picked);
    else setAiRefImage(picked);
  }

  // Per-step validation
  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return Boolean(objective);
      case 1:
        return (
          name.trim().length >= 3 &&
          countries.length >= 1 &&
          Number(ageMin) >= 13 &&
          Number(ageMax) <= 65 &&
          Number(ageMin) <= Number(ageMax)
        );
      case 2:
        return Number(dailyBudget) >= 10;
      case 3:
        return caption.trim().length > 0 && Boolean(image);
      case 4:
        return !submitMutation.isPending;
      default:
        return false;
    }
  }

  function next() {
    if (step < 4) setStep(step + 1);
    else submitMutation.mutate();
  }

  function back() {
    if (step > 0) setStep(step - 1);
    else router.back();
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ backgroundColor: managerColors.surface, borderBottomColor: managerColors.border, ...softShadow }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} className="mr-3">
          <Ionicons name="close" size={24} color={managerColors.ink} />
        </Pressable>
        <Text className="text-[17px] font-bold flex-1" style={{ color: managerColors.ink }}>
          إنشاء حملة جديدة
        </Text>
        <Text className="text-[13px]" style={{ color: managerColors.muted }}>
          {step + 1} / {STEPS.length}
        </Text>
      </View>

      {/* Step indicator */}
      <View className="flex-row px-4 py-3 gap-1" style={{ backgroundColor: managerColors.surface }}>
        {STEPS.map((label, i) => (
          <View
            key={label}
            className="flex-1 h-1.5 rounded-full"
            style={{ backgroundColor: i <= step ? managerColors.brand : managerColors.border }}
          />
        ))}
      </View>

      <ScrollView contentContainerClassName="p-4 gap-3 pb-8" keyboardShouldPersistTaps="handled">
        <Text className="text-[20px] font-bold mb-1" style={{ color: managerColors.ink }}>
          {STEPS[step]}
        </Text>

        {/* === STEP 1: Objective === */}
        {step === 0 && (
          <View className="gap-3">
            <Text className="text-[13px]" style={{ color: managerColors.muted }}>
              اختر الهدف الأنسب لحملتك. سيؤثر هذا على طريقة عرض الإعلان.
            </Text>
            {OBJECTIVES.map((o) => {
              const selected = objective === o.key;
              return (
                <Pressable key={o.key} onPress={() => setObjective(o.key)}>
                  <View
                    className="flex-row items-center rounded-[20px] border bg-white p-4 gap-3"
                    style={{
                      borderColor: selected ? o.color : managerColors.border,
                      borderWidth: selected ? 2 : 1,
                      ...softShadow,
                    }}
                  >
                    <View className="w-12 h-12 rounded-[14px] items-center justify-center" style={{ backgroundColor: `${o.color}1A` }}>
                      <Ionicons name={o.icon} size={24} color={o.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-[15px]" style={{ color: managerColors.ink }}>{o.title}</Text>
                      <Text className="text-[12px] mt-0.5" style={{ color: managerColors.muted }}>{o.desc}</Text>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color={o.color} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* === STEP 2: Audience === */}
        {step === 1 && (
          <View className="gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>اسم الحملة</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="مثال: عروض رمضان - الرياض"
                placeholderTextColor={managerColors.muted}
                style={{ color: managerColors.ink, fontSize: 15, paddingVertical: 6 }}
              />
            </ManagerCard>

            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>الدول المستهدفة</Text>
              <View className="flex-row flex-wrap gap-2">
                {COUNTRIES.map((c) => {
                  const selected = countries.includes(c.code);
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        if (selected) setCountries(countries.filter((x) => x !== c.code));
                        else setCountries([...countries, c.code]);
                      }}
                      className="px-3 py-2 rounded-full border"
                      style={{
                        borderColor: selected ? managerColors.brand : managerColors.border,
                        backgroundColor: selected ? managerColors.brand : "transparent",
                      }}
                    >
                      <Text className="text-[13px] font-medium" style={{ color: selected ? "#fff" : managerColors.ink }}>
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ManagerCard>

            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>الفئة العمرية</Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[11px] mb-1" style={{ color: managerColors.muted }}>من</Text>
                  <TextInput
                    value={ageMin}
                    onChangeText={(v) => setAgeMin(v.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    maxLength={2}
                    className="rounded-[10px] border px-3 py-2"
                    style={{ borderColor: managerColors.border, color: managerColors.ink, fontSize: 15 }}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] mb-1" style={{ color: managerColors.muted }}>إلى</Text>
                  <TextInput
                    value={ageMax}
                    onChangeText={(v) => setAgeMax(v.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    maxLength={2}
                    className="rounded-[10px] border px-3 py-2"
                    style={{ borderColor: managerColors.border, color: managerColors.ink, fontSize: 15 }}
                  />
                </View>
              </View>
              <Text className="text-[11px] mt-2" style={{ color: managerColors.muted }}>الحد الأدنى 13 — الحد الأقصى 65</Text>
            </ManagerCard>
          </View>
        )}

        {/* === STEP 3: Budget + schedule === */}
        {step === 2 && (
          <View className="gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>الميزانية اليومية (ريال سعودي)</Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={dailyBudget}
                  onChangeText={(v) => setDailyBudget(v.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  maxLength={6}
                  className="flex-1 rounded-[10px] border px-3 py-2"
                  style={{ borderColor: managerColors.border, color: managerColors.ink, fontSize: 17, fontWeight: "600" }}
                />
                <Text className="text-[15px] font-bold" style={{ color: managerColors.muted }}>ر.س / يوم</Text>
              </View>
              <Text className="text-[11px] mt-2" style={{ color: managerColors.muted }}>
                الحد الأدنى الذي تقبله Meta هو ١٠ ر.س يوميًا.
              </Text>
              <View className="flex-row gap-2 mt-3">
                {[50, 100, 200, 500].map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => setDailyBudget(String(preset))}
                    className="flex-1 rounded-[10px] border py-2 items-center"
                    style={{ borderColor: managerColors.border }}
                  >
                    <Text className="text-[13px] font-semibold" style={{ color: managerColors.ink }}>{preset}</Text>
                  </Pressable>
                ))}
              </View>
            </ManagerCard>

            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>وقت البدء</Text>
              <View className="flex-row gap-2">
                {[
                  { o: 0, label: "اليوم" },
                  { o: 1, label: "غدًا" },
                  { o: 3, label: "بعد ٣ أيام" },
                  { o: 7, label: "بعد أسبوع" },
                ].map((opt) => (
                  <Pressable
                    key={opt.o}
                    onPress={() => setStartDaysOffset(opt.o)}
                    className="flex-1 rounded-[10px] border py-2 items-center"
                    style={{
                      borderColor: startDaysOffset === opt.o ? managerColors.brand : managerColors.border,
                      backgroundColor: startDaysOffset === opt.o ? managerColors.brand : "transparent",
                    }}
                  >
                    <Text className="text-[12px] font-semibold" style={{ color: startDaysOffset === opt.o ? "#fff" : managerColors.ink }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text className="text-[11px] mt-2" style={{ color: managerColors.muted }}>
                ستبدأ: {formatDateAr(isoFromOffset(startDaysOffset))}
              </Text>
            </ManagerCard>

            <ManagerCard>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>تاريخ انتهاء</Text>
                <Switch
                  value={hasEndDate}
                  onValueChange={setHasEndDate}
                  trackColor={{ false: managerColors.border, true: managerColors.brand }}
                  thumbColor="#fff"
                />
              </View>
              {hasEndDate ? (
                <View className="flex-row gap-2 mt-2">
                  {[
                    { o: 3, label: "٣ أيام" },
                    { o: 7, label: "أسبوع" },
                    { o: 14, label: "أسبوعان" },
                    { o: 30, label: "شهر" },
                  ].map((opt) => (
                    <Pressable
                      key={opt.o}
                      onPress={() => setEndDaysOffset(opt.o)}
                      className="flex-1 rounded-[10px] border py-2 items-center"
                      style={{
                        borderColor: endDaysOffset === opt.o ? managerColors.brand : managerColors.border,
                        backgroundColor: endDaysOffset === opt.o ? managerColors.brand : "transparent",
                      }}
                    >
                      <Text className="text-[12px] font-semibold" style={{ color: endDaysOffset === opt.o ? "#fff" : managerColors.ink }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text className="text-[12px]" style={{ color: managerColors.muted }}>
                  الحملة ستستمر بدون تاريخ انتهاء حتى توقفها يدويًا.
                </Text>
              )}
            </ManagerCard>
          </View>
        )}

        {/* === STEP 4: Creative === */}
        {step === 3 && (
          <View className="gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>صورة الإعلان</Text>
              {image ? (
                <View className="gap-2">
                  <Image source={{ uri: image.uri }} className="w-full rounded-[12px]" style={{ aspectRatio: 1 }} resizeMode="cover" />
                  <View className="flex-row justify-between">
                    <Pressable onPress={() => pickImage("creative")} className="flex-row items-center gap-1.5">
                      <Ionicons name="swap-horizontal" size={16} color={managerColors.brand} />
                      <Text className="text-[13px]" style={{ color: managerColors.brand }}>تغيير</Text>
                    </Pressable>
                    <Pressable onPress={() => setImage(null)} className="flex-row items-center gap-1.5">
                      <Ionicons name="close-circle-outline" size={16} color={managerColors.danger} />
                      <Text className="text-[13px]" style={{ color: managerColors.danger }}>إزالة</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="gap-2">
                  <Pressable
                    onPress={() => pickImage("creative")}
                    className="rounded-[12px] items-center justify-center border-2 border-dashed gap-2"
                    style={{ borderColor: managerColors.border, aspectRatio: 1 }}
                  >
                    <Ionicons name="image-outline" size={40} color={managerColors.muted} />
                    <Text className="text-[14px]" style={{ color: managerColors.muted }}>اختر صورة من المعرض</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowImageAi(true)}
                    className="flex-row items-center justify-center gap-2 rounded-[12px] py-3"
                    style={{ backgroundColor: "#7c3aed" }}
                  >
                    <Ionicons name="sparkles" size={18} color="#fff" />
                    <Text className="text-white font-semibold text-[14px]">ولّد صورة بالذكاء الاصطناعي</Text>
                    {aiUsageQuery.data ? (
                      <Text className="text-white/70 text-[11px]">
                        ({aiUsageQuery.data.image.remaining}/{aiUsageQuery.data.image.limit})
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
              )}
            </ManagerCard>

            <ManagerCard>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>نص الإعلان</Text>
                <Pressable
                  onPress={() => setShowCaptionAi(true)}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: "#7c3aed20" }}
                >
                  <Ionicons name="sparkles" size={14} color="#7c3aed" />
                  <Text className="text-[12px] font-semibold" style={{ color: "#7c3aed" }}>اقترح نص</Text>
                </Pressable>
              </View>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="اكتب نص الإعلان…"
                placeholderTextColor={managerColors.muted}
                multiline
                style={{ color: managerColors.ink, fontSize: 15, minHeight: 100 }}
                textAlignVertical="top"
              />
            </ManagerCard>

            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>رابط الإعلان (اختياري)</Text>
              <TextInput
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://example.com أو wa.me/9665..."
                placeholderTextColor={managerColors.muted}
                autoCapitalize="none"
                keyboardType="url"
                style={{ color: managerColors.ink, fontSize: 14 }}
              />
              <Text className="text-[11px] mt-1" style={{ color: managerColors.muted }}>
                إذا تركته فارغًا، سيكون منشورًا بصورة بدون زر.
              </Text>
            </ManagerCard>
          </View>
        )}

        {/* === STEP 5: Review === */}
        {step === 4 && (
          <View className="gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>الملخص</Text>
              <View className="gap-2.5">
                <ReviewRow label="الاسم" value={name} />
                <ReviewRow label="الهدف" value={OBJECTIVES.find((o) => o.key === objective)?.title ?? "—"} />
                <ReviewRow label="الدول" value={countries.map((c) => COUNTRIES.find((x) => x.code === c)?.name ?? c).join("، ")} />
                <ReviewRow label="العمر" value={`${ageMin} - ${ageMax}`} />
                <ReviewRow label="الميزانية اليومية" value={`${dailyBudget} ر.س`} />
                <ReviewRow label="البدء" value={formatDateAr(isoFromOffset(startDaysOffset))} />
                <ReviewRow label="الانتهاء" value={hasEndDate ? formatDateAr(isoFromOffset(endDaysOffset, 23)) : "بدون انتهاء"} />
                {linkUrl.trim() ? <ReviewRow label="الرابط" value={linkUrl.trim()} /> : null}
              </View>
            </ManagerCard>

            {image ? (
              <ManagerCard>
                <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>المعاينة</Text>
                <Image source={{ uri: image.uri }} className="w-full rounded-[12px]" style={{ aspectRatio: 1 }} resizeMode="cover" />
                <Text className="mt-2 text-[14px] leading-6" style={{ color: managerColors.ink }}>{caption}</Text>
              </ManagerCard>
            ) : null}

            <ManagerCard>
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold" style={{ color: managerColors.ink }}>تفعيل فوري</Text>
                  <Text className="text-[12px] mt-0.5" style={{ color: managerColors.muted }}>
                    إذا أوقفته، سيكون عليك تفعيل الحملة يدويًا من شاشة الحملات.
                  </Text>
                </View>
                <Switch
                  value={launchNow}
                  onValueChange={setLaunchNow}
                  trackColor={{ false: managerColors.border, true: "#22C55E" }}
                  thumbColor="#fff"
                />
              </View>
            </ManagerCard>
          </View>
        )}
      </ScrollView>

      {/* Footer buttons */}
      <View
        className="flex-row gap-3 px-4 py-3 border-t"
        style={{ borderTopColor: managerColors.border, backgroundColor: managerColors.surface }}
      >
        <Pressable
          onPress={back}
          className="px-5 rounded-[12px] py-3 items-center justify-center border"
          style={{ borderColor: managerColors.border }}
        >
          <Text className="font-semibold text-[14px]" style={{ color: managerColors.ink }}>
            {step === 0 ? "إلغاء" : "السابق"}
          </Text>
        </Pressable>
        <Pressable
          onPress={next}
          disabled={!canAdvance()}
          className="flex-1 rounded-[12px] py-3 items-center justify-center"
          style={{ backgroundColor: canAdvance() ? managerColors.brand : managerColors.border }}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-bold text-[15px] text-white">
              {step === 4 ? (launchNow ? "إنشاء وتفعيل" : "إنشاء (موقوفة)") : "التالي"}
            </Text>
          )}
        </Pressable>
      </View>

      {/* === Caption AI modal === */}
      <Modal visible={showCaptionAi} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCaptionAi(false)}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
          <View className="flex-row items-center px-4 py-3 border-b" style={{ borderBottomColor: managerColors.border, backgroundColor: managerColors.surface }}>
            <Pressable onPress={() => setShowCaptionAi(false)} hitSlop={8} className="mr-3">
              <Ionicons name="close" size={24} color={managerColors.ink} />
            </Pressable>
            <View className="flex-1 flex-row items-center gap-2">
              <Ionicons name="sparkles" size={18} color="#7c3aed" />
              <Text className="text-[17px] font-bold" style={{ color: managerColors.ink }}>اقتراح نص بالذكاء الاصطناعي</Text>
            </View>
          </View>
          <ScrollView contentContainerClassName="p-4 gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>على ماذا يركّز الإعلان؟ (اختياري)</Text>
              <TextInput
                value={aiCaptionHint}
                onChangeText={setAiCaptionHint}
                placeholder="مثال: عرض الإفطار خصم 30%"
                placeholderTextColor={managerColors.muted}
                multiline
                style={{ color: managerColors.ink, fontSize: 15, minHeight: 80 }}
                textAlignVertical="top"
              />
            </ManagerCard>
            <Pressable
              onPress={() => captionAi.mutate()}
              disabled={captionAi.isPending}
              className="rounded-[14px] py-4 items-center"
              style={{ backgroundColor: "#7c3aed" }}
            >
              {captionAi.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text className="text-white font-bold text-[15px]">{aiCaptions.length ? "اقترح مرة أخرى" : "ولّد ٣ خيارات"}</Text>
                </View>
              )}
            </Pressable>
            {aiCaptions.map((c, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  setCaption(c);
                  setShowCaptionAi(false);
                  setAiCaptions([]);
                }}
              >
                <ManagerCard>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[11px] font-semibold" style={{ color: "#7c3aed" }}>الخيار {i + 1}</Text>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#7c3aed" />
                  </View>
                  <Text className="text-[14px] leading-6" style={{ color: managerColors.ink }}>{c}</Text>
                </ManagerCard>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* === Image AI modal === */}
      <Modal
        visible={showImageAi}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowImageAi(false);
          setAiPrompt("");
          setAiRefImage(null);
          setAiPreviewImage(null);
        }}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
          <View className="flex-row items-center px-4 py-3 border-b" style={{ borderBottomColor: managerColors.border, backgroundColor: managerColors.surface }}>
            <Pressable
              onPress={() => {
                setShowImageAi(false);
                setAiPrompt("");
                setAiRefImage(null);
                setAiPreviewImage(null);
              }}
              hitSlop={8}
              className="mr-3"
            >
              <Ionicons name="close" size={24} color={managerColors.ink} />
            </Pressable>
            <View className="flex-1 flex-row items-center gap-2">
              <Ionicons name="sparkles" size={18} color="#7c3aed" />
              <Text className="text-[17px] font-bold" style={{ color: managerColors.ink }}>توليد صورة بالذكاء الاصطناعي</Text>
            </View>
          </View>
          <ScrollView contentContainerClassName="p-4 gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>صف الصورة</Text>
              <TextInput
                value={aiPrompt}
                onChangeText={setAiPrompt}
                placeholder="مثال: لوحة عرض طعام عربي تقليدي بإضاءة ذهبية"
                placeholderTextColor={managerColors.muted}
                multiline
                style={{ color: managerColors.ink, fontSize: 15, minHeight: 100 }}
                textAlignVertical="top"
              />
            </ManagerCard>
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>صورة مرجعية (اختياري)</Text>
              {aiRefImage ? (
                <View className="gap-2">
                  <Image source={{ uri: aiRefImage.uri }} className="w-full rounded-[12px]" style={{ aspectRatio: 1 }} resizeMode="cover" />
                  <Pressable onPress={() => setAiRefImage(null)} className="flex-row items-center gap-2 self-start">
                    <Ionicons name="close-circle-outline" size={18} color={managerColors.danger} />
                    <Text className="text-[13px]" style={{ color: managerColors.danger }}>إزالة</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => pickImage("aiRef")}
                  className="rounded-[12px] items-center justify-center border-2 border-dashed py-6 gap-2"
                  style={{ borderColor: managerColors.border }}
                >
                  <Ionicons name="image-outline" size={28} color={managerColors.muted} />
                  <Text className="text-[13px]" style={{ color: managerColors.muted }}>اختر صورة مرجعية</Text>
                </Pressable>
              )}
            </ManagerCard>
            <Pressable
              onPress={() => imageAi.mutate()}
              disabled={!aiPrompt.trim() || imageAi.isPending}
              className="rounded-[14px] py-4 items-center"
              style={{ backgroundColor: aiPrompt.trim() ? "#7c3aed" : managerColors.border }}
            >
              {imageAi.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text className="text-white font-bold text-[15px]">{aiPreviewImage ? "ولّد مرة أخرى" : "ولّد الصورة"}</Text>
                </View>
              )}
            </Pressable>
            {aiPreviewImage ? (
              <ManagerCard>
                <Image source={{ uri: aiPreviewImage.uri }} className="w-full rounded-[12px]" style={{ aspectRatio: 1 }} resizeMode="cover" />
                <Pressable
                  onPress={() => {
                    setImage(aiPreviewImage);
                    setShowImageAi(false);
                    setAiPrompt("");
                    setAiRefImage(null);
                    setAiPreviewImage(null);
                  }}
                  className="mt-3 rounded-[12px] py-3 items-center"
                  style={{ backgroundColor: managerColors.brand }}
                >
                  <Text className="text-white font-bold text-[14px]">استخدم هذه الصورة</Text>
                </Pressable>
              </ManagerCard>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-[13px]" style={{ color: managerColors.muted }}>{label}</Text>
      <Text className="text-[13px] font-semibold flex-1 text-end mr-3" style={{ color: managerColors.ink }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
