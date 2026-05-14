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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateCaptions,
  generatePostImage,
  getAiUsage,
  getMetaAdsStatus,
  listMetaPages,
  selectMetaPage,
  publishMetaPost,
  type MetaPage,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors, softShadow } from "../../../components/manager-ui";

// ---- page picker -----------------------------------------------------------

function PagePickerScreen({
  pages,
  isLoading,
  onSelect,
}: {
  pages: MetaPage[];
  isLoading: boolean;
  onSelect: (p: MetaPage) => void;
}) {
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={managerColors.brand} />
        <Text className="mt-4" style={{ color: managerColors.muted }}>
          جارٍ تحميل الصفحات…
        </Text>
      </View>
    );
  }

  if (!pages.length) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Ionicons name="flag-outline" size={48} color={managerColors.muted} />
        <Text className="text-center mt-4 font-semibold text-[16px]" style={{ color: managerColors.ink }}>
          لا توجد صفحات
        </Text>
        <Text className="text-center mt-2" style={{ color: managerColors.muted }}>
          تأكد أن لديك صلاحية الإدارة على صفحة Facebook على الأقل.
        </Text>
      </View>
    );
  }

  // Sort: pages with Instagram linked come first
  const sortedPages = [...pages].sort((a, b) => {
    const aHasIg = a.instagram_business_account ? 1 : 0;
    const bHasIg = b.instagram_business_account ? 1 : 0;
    return bHasIg - aHasIg;
  });

  return (
    <ScrollView contentContainerClassName="p-4 gap-3">
      <Text className="text-[18px] font-bold mb-2" style={{ color: managerColors.ink }}>
        اختر صفحة Facebook
      </Text>
      <Text className="text-[13px] mb-3" style={{ color: managerColors.muted }}>
        للنشر على Instagram، اختر صفحة بها حساب Instagram للأعمال مرتبط بها.
      </Text>
      {sortedPages.map((page) => {
        const ig = page.instagram_business_account;
        return (
          <Pressable key={page.id} onPress={() => onSelect(page)}>
            <View
              className="flex-row items-center justify-between rounded-[24px] border bg-[#FCFEFC] p-4"
              style={{
                borderColor: ig ? "#E1306C40" : "#D6DDF8",
                borderWidth: ig ? 1.5 : 1,
                ...softShadow,
              }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: ig ? "#E1306C" : "#1877F2" }}>
                <Ionicons name={ig ? "logo-instagram" : "logo-facebook"} size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-[15px]" style={{ color: managerColors.ink }}>
                  {page.name}
                </Text>
                <Text className="text-[12px] mt-0.5" style={{ color: managerColors.muted }}>
                  {page.category}
                  {page.fan_count ? ` · ${page.fan_count.toLocaleString("ar")} متابع` : ""}
                </Text>
                {ig ? (
                  <View className="flex-row items-center gap-1 mt-1">
                    <Ionicons name="logo-instagram" size={12} color="#E1306C" />
                    <Text className="text-[11px] font-medium" style={{ color: "#E1306C" }}>
                      @{ig.username}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-[11px] mt-1" style={{ color: managerColors.warning }}>
                    لا يوجد Instagram مرتبط
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={managerColors.muted} />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---- composer --------------------------------------------------------------

interface PickedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

function ComposerScreen({
  pageName,
  instagramUsername,
  defaultPlatform,
  onPublished,
}: {
  pageName: string;
  instagramUsername: string | null;
  defaultPlatform: "instagram" | "facebook";
  onPublished: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [image, setImage] = useState<PickedImage | null>(null);
  const [toInstagram, setToInstagram] = useState(
    defaultPlatform === "instagram" && Boolean(instagramUsername)
  );
  const [toFacebook, setToFacebook] = useState(defaultPlatform === "facebook");

  // AI state
  const [showCaptionAi, setShowCaptionAi] = useState(false);
  const [showImageAi, setShowImageAi] = useState(false);
  const [aiCaptionHint, setAiCaptionHint] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiRefImage, setAiRefImage] = useState<PickedImage | null>(null);
  const [aiCaptions, setAiCaptions] = useState<string[]>([]);
  const [aiPreviewImage, setAiPreviewImage] = useState<PickedImage | null>(null);

  const aiUsageQuery = useQuery({
    queryKey: ["ai-usage-composer"],
    queryFn: getAiUsage,
    staleTime: 30_000,
  });

  const captionAiMutation = useMutation({
    mutationFn: () =>
      generateCaptions({
        hint: aiCaptionHint.trim() || undefined,
        platform: defaultPlatform,
        has_image: Boolean(image),
      }),
    onSuccess: (res) => {
      setAiCaptions(res.captions);
      aiUsageQuery.refetch();
    },
    onError: (e) =>
      Alert.alert(
        "تعذّر توليد التعليق",
        (e as Error).message.includes("429")
          ? "تجاوزت الحد الشهري لتوليد التعليقات."
          : "حاول مرة أخرى."
      ),
  });

  const imageAiMutation = useMutation({
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
    onError: (e) =>
      Alert.alert(
        "تعذّر توليد الصورة",
        (e as Error).message.includes("429")
          ? "تجاوزت الحد الشهري لتوليد الصور."
          : "حاول مرة أخرى."
      ),
  });

  async function pickAiRefImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0].base64) return;
    const a = result.assets[0];
    setAiRefImage({
      uri: a.uri,
      base64: a.base64!,
      mimeType: a.mimeType ?? "image/jpeg",
    });
  }

  function closeImageAi() {
    setShowImageAi(false);
    setAiPrompt("");
    setAiRefImage(null);
    setAiPreviewImage(null);
  }

  function useGeneratedImage() {
    if (!aiPreviewImage) return;
    setImage(aiPreviewImage);
    closeImageAi();
  }

  const publishMutation = useMutation({
    mutationFn: () =>
      publishMetaPost({
        caption,
        publish_to: [
          ...(toFacebook ? (["facebook"] as const) : []),
          ...(toInstagram ? (["instagram"] as const) : []),
        ],
        image_base64: image?.base64,
        image_type: image?.mimeType,
      }),
    onSuccess: (res) => {
      const platforms = res.published
        .map((p) => (p === "facebook" ? "Facebook" : "Instagram"))
        .join(" و ");
      const hasErrors = Object.keys(res.errors).length > 0;
      const errMsg = hasErrors
        ? `\nفشل النشر على: ${Object.keys(res.errors).join(", ")}`
        : "";
      Alert.alert("تم النشر", `نُشر المنشور على ${platforms}.${errMsg}`, [
        { text: "حسنًا", onPress: onPublished },
      ]);
    },
    onError: () => Alert.alert("خطأ", "فشل نشر المنشور. حاول مرة أخرى."),
  });

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("لا يوجد إذن", "يحتاج التطبيق إذن الوصول إلى الصور.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0].base64) return;
    const asset = result.assets[0];
    setImage({
      uri: asset.uri,
      base64: asset.base64!,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  const canPublish =
    caption.trim().length > 0 &&
    (toFacebook || toInstagram) &&
    (!toInstagram || Boolean(image));

  return (
    <ScrollView contentContainerClassName="p-4 gap-4 pb-10" keyboardShouldPersistTaps="handled">
      {/* Account chips */}
      <View className="flex-row gap-2">
        <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: "#1877F220" }}>
          <Ionicons name="logo-facebook" size={14} color="#1877F2" />
          <Text className="text-[12px] font-medium" style={{ color: "#1877F2" }}>{pageName}</Text>
        </View>
        {instagramUsername ? (
          <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: "#E1306C20" }}>
            <Ionicons name="logo-instagram" size={14} color="#E1306C" />
            <Text className="text-[12px] font-medium" style={{ color: "#E1306C" }}>@{instagramUsername}</Text>
          </View>
        ) : null}
      </View>

      {/* Image picker — hero element */}
      <ManagerCard>
        <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>
          الصورة {toInstagram ? "" : "(اختياري)"}
        </Text>
        {image ? (
          <View className="gap-2">
            <Image
              source={{ uri: image.uri }}
              className="w-full rounded-[12px]"
              style={{ aspectRatio: 1 }}
              resizeMode="cover"
            />
            <View className="flex-row items-center justify-between">
              <Pressable onPress={pickImage} className="flex-row items-center gap-2">
                <Ionicons name="swap-horizontal" size={18} color={managerColors.brand} />
                <Text className="text-[13px]" style={{ color: managerColors.brand }}>تغيير الصورة</Text>
              </Pressable>
              <Pressable onPress={() => setImage(null)} className="flex-row items-center gap-2">
                <Ionicons name="close-circle-outline" size={18} color={managerColors.danger} />
                <Text className="text-[13px]" style={{ color: managerColors.danger }}>إزالة</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="gap-2">
            <Pressable
              onPress={pickImage}
              className="rounded-[12px] items-center justify-center border-2 border-dashed gap-3"
              style={{ borderColor: "#E1306C", aspectRatio: 1, backgroundColor: "#E1306C08" }}
            >
              <Ionicons name="image" size={48} color="#E1306C" />
              <Text className="text-[15px] font-semibold" style={{ color: "#E1306C" }}>اختر صورة للمنشور</Text>
              <Text className="text-[12px]" style={{ color: managerColors.muted }}>مربعة (1:1) للنتيجة الأفضل</Text>
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

      {/* Caption */}
      <ManagerCard>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>التعليق</Text>
          <Pressable
            onPress={() => setShowCaptionAi(true)}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: "#7c3aed20" }}
          >
            <Ionicons name="sparkles" size={14} color="#7c3aed" />
            <Text className="text-[12px] font-semibold" style={{ color: "#7c3aed" }}>اقترح تعليق</Text>
          </Pressable>
        </View>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="اكتب وصف المنشور والهاشتاقات…"
          placeholderTextColor={managerColors.muted}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          style={{
            color: managerColors.ink,
            fontSize: 15,
            minHeight: 120,
            fontFamily: "System",
          }}
        />
      </ManagerCard>

      {/* Platform toggles — Instagram first */}
      <ManagerCard className="gap-3">
        <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>النشر على</Text>

        {instagramUsername ? (
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name="logo-instagram" size={20} color="#E1306C" />
              <Text className="font-medium text-[15px]" style={{ color: managerColors.ink }}>Instagram</Text>
              <Text className="text-[12px]" style={{ color: managerColors.muted }}>@{instagramUsername}</Text>
            </View>
            <Switch
              value={toInstagram}
              onValueChange={(v) => {
                setToInstagram(v);
                if (v && !image) Alert.alert("تنبيه", "Instagram يتطلب صورة لنشر المنشور.");
              }}
              trackColor={{ false: managerColors.border, true: "#E1306C" }}
              thumbColor="#fff"
            />
          </View>
        ) : (
          <View className="flex-row items-start gap-2 p-3 rounded-[10px]" style={{ backgroundColor: "#FEF2F2" }}>
            <Ionicons name="warning" size={16} color={managerColors.danger} />
            <View className="flex-1">
              <Text className="text-[13px] font-semibold" style={{ color: managerColors.danger }}>
                لا يوجد حساب Instagram مرتبط
              </Text>
              <Text className="text-[12px] mt-1" style={{ color: managerColors.muted }}>
                اربط حساب Instagram للأعمال بصفحة Facebook من إعدادات Instagram.
              </Text>
            </View>
          </View>
        )}

        <View className="h-px" style={{ backgroundColor: managerColors.border }} />

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="logo-facebook" size={20} color="#1877F2" />
            <Text className="font-medium text-[15px]" style={{ color: managerColors.ink }}>Facebook</Text>
            <Text className="text-[12px]" style={{ color: managerColors.muted }}>{pageName}</Text>
          </View>
          <Switch
            value={toFacebook}
            onValueChange={setToFacebook}
            trackColor={{ false: managerColors.border, true: "#1877F2" }}
            thumbColor="#fff"
          />
        </View>
      </ManagerCard>

      {/* Publish button */}
      <Pressable
        onPress={() => publishMutation.mutate()}
        disabled={!canPublish || publishMutation.isPending}
        className="rounded-[14px] py-4 items-center"
        style={{ backgroundColor: canPublish ? "#E1306C" : managerColors.border }}
      >
        {publishMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-bold text-[16px]">نشر الآن</Text>
        )}
      </Pressable>

      {!canPublish && toInstagram && !image && (
        <Text className="text-center text-[12px]" style={{ color: managerColors.warning }}>
          أضف صورة لتتمكن من النشر على Instagram
        </Text>
      )}

      {/* ✨ Caption AI modal */}
      <Modal
        visible={showCaptionAi}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCaptionAi(false)}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
          <View className="flex-row items-center px-4 py-3 border-b" style={{ borderBottomColor: managerColors.border, backgroundColor: managerColors.surface }}>
            <Pressable onPress={() => setShowCaptionAi(false)} hitSlop={8} className="mr-3">
              <Ionicons name="close" size={24} color={managerColors.ink} />
            </Pressable>
            <View className="flex-1 flex-row items-center gap-2">
              <Ionicons name="sparkles" size={18} color="#7c3aed" />
              <Text className="text-[17px] font-bold" style={{ color: managerColors.ink }}>اقتراح تعليق بالذكاء الاصطناعي</Text>
            </View>
          </View>

          <ScrollView contentContainerClassName="p-4 gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>
                وصف مختصر لما تريد التركيز عليه (اختياري)
              </Text>
              <TextInput
                value={aiCaptionHint}
                onChangeText={setAiCaptionHint}
                placeholder="مثال: عرض خصم 20% على لاتيه، خلال الجمعة فقط"
                placeholderTextColor={managerColors.muted}
                multiline
                style={{ color: managerColors.ink, fontSize: 15, minHeight: 80 }}
                textAlignVertical="top"
              />
            </ManagerCard>

            <Pressable
              onPress={() => captionAiMutation.mutate()}
              disabled={captionAiMutation.isPending}
              className="rounded-[14px] py-4 items-center"
              style={{ backgroundColor: "#7c3aed" }}
            >
              {captionAiMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text className="text-white font-bold text-[15px]">
                    {aiCaptions.length ? "اقترح مرة أخرى" : "ولّد ٣ خيارات"}
                  </Text>
                </View>
              )}
            </Pressable>

            {aiUsageQuery.data ? (
              <Text className="text-center text-[12px]" style={{ color: managerColors.muted }}>
                {aiUsageQuery.data.caption.remaining} / {aiUsageQuery.data.caption.limit} تعليق متبقّ هذا الشهر
              </Text>
            ) : null}

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

      {/* ✨ Image AI modal */}
      <Modal
        visible={showImageAi}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeImageAi}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
          <View className="flex-row items-center px-4 py-3 border-b" style={{ borderBottomColor: managerColors.border, backgroundColor: managerColors.surface }}>
            <Pressable onPress={closeImageAi} hitSlop={8} className="mr-3">
              <Ionicons name="close" size={24} color={managerColors.ink} />
            </Pressable>
            <View className="flex-1 flex-row items-center gap-2">
              <Ionicons name="sparkles" size={18} color="#7c3aed" />
              <Text className="text-[17px] font-bold" style={{ color: managerColors.ink }}>توليد صورة بالذكاء الاصطناعي</Text>
            </View>
          </View>

          <ScrollView contentContainerClassName="p-4 gap-3">
            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>
                صِف الصورة التي تريدها
              </Text>
              <TextInput
                value={aiPrompt}
                onChangeText={setAiPrompt}
                placeholder="مثال: كوب قهوة لاتيه بشكل احترافي فوق طاولة خشبية، إضاءة دافئة، خلفية مقهى ضبابية"
                placeholderTextColor={managerColors.muted}
                multiline
                style={{ color: managerColors.ink, fontSize: 15, minHeight: 100 }}
                textAlignVertical="top"
              />
            </ManagerCard>

            <ManagerCard>
              <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>
                صورة مرجعية (اختياري) — لتحسين النتيجة
              </Text>
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
                  onPress={pickAiRefImage}
                  className="rounded-[12px] items-center justify-center border-2 border-dashed py-6 gap-2"
                  style={{ borderColor: managerColors.border }}
                >
                  <Ionicons name="image-outline" size={28} color={managerColors.muted} />
                  <Text className="text-[13px]" style={{ color: managerColors.muted }}>اختر صورة مرجعية</Text>
                </Pressable>
              )}
            </ManagerCard>

            <Pressable
              onPress={() => imageAiMutation.mutate()}
              disabled={!aiPrompt.trim() || imageAiMutation.isPending}
              className="rounded-[14px] py-4 items-center"
              style={{ backgroundColor: aiPrompt.trim() ? "#7c3aed" : managerColors.border }}
            >
              {imageAiMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text className="text-white font-bold text-[15px]">
                    {aiPreviewImage ? "ولّد مرة أخرى" : "ولّد الصورة"}
                  </Text>
                </View>
              )}
            </Pressable>

            {aiUsageQuery.data ? (
              <Text className="text-center text-[12px]" style={{ color: managerColors.muted }}>
                {aiUsageQuery.data.image.remaining} / {aiUsageQuery.data.image.limit} صورة متبقّية هذا الشهر
              </Text>
            ) : null}

            {aiPreviewImage ? (
              <ManagerCard>
                <Text className="text-[13px] font-semibold mb-2" style={{ color: managerColors.muted }}>المعاينة</Text>
                <Image source={{ uri: aiPreviewImage.uri }} className="w-full rounded-[12px]" style={{ aspectRatio: 1 }} resizeMode="cover" />
                <Pressable
                  onPress={useGeneratedImage}
                  className="mt-3 rounded-[12px] py-3 items-center"
                  style={{ backgroundColor: "#E1306C" }}
                >
                  <Text className="text-white font-bold text-[14px]">استخدم هذه الصورة</Text>
                </Pressable>
              </ManagerCard>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

// ---- main screen -----------------------------------------------------------

export default function ComposeScreen() {
  const params = useLocalSearchParams<{ platform?: string }>();
  const defaultPlatform: "instagram" | "facebook" =
    params.platform === "facebook" ? "facebook" : "instagram";

  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();

  // We need the status to know page info
  const statusQuery = useQuery({
    queryKey: qk.metaAdsStatus(restaurantId),
    enabled: !!restaurantId,
    staleTime: 30_000,
    queryFn: getMetaAdsStatus,
  });

  const status = statusQuery.data;
  const pageSelected = Boolean(status?.pageSelected);

  const pagesQuery = useQuery({
    queryKey: qk.metaPages(restaurantId),
    enabled: !!restaurantId && status?.connected === true && !pageSelected,
    queryFn: listMetaPages,
  });

  const selectPageMutation = useMutation({
    mutationFn: selectMetaPage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.metaAdsStatus(restaurantId) });
      qc.invalidateQueries({ queryKey: qk.metaPages(restaurantId) });
    },
    onError: () => Alert.alert("خطأ", "فشل اختيار الصفحة. حاول مرة أخرى."),
  });

  function handlePublished() {
    router.back();
  }

  if (statusQuery.isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: managerColors.bg }}>
        <ActivityIndicator size="large" color={managerColors.brand} />
      </SafeAreaView>
    );
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
          {pageSelected ? "منشور جديد" : "اختر صفحة Facebook"}
        </Text>
        {pageSelected && status?.pageName ? (
          <Pressable
            onPress={() => {
              Alert.alert("تغيير الصفحة", "هل تريد اختيار صفحة أخرى؟", [
                { text: "إلغاء", style: "cancel" },
                {
                  text: "تغيير",
                  onPress: () => {
                    qc.setQueryData(qk.metaAdsStatus(restaurantId), (old: typeof status) =>
                      old ? { ...old, pageSelected: false, pageId: null, pageName: null } : old
                    );
                  },
                },
              ]);
            }}
            hitSlop={8}
          >
            <Text className="text-[13px]" style={{ color: managerColors.brand }}>تغيير</Text>
          </Pressable>
        ) : null}
      </View>

      {selectPageMutation.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={managerColors.brand} />
          <Text className="mt-4" style={{ color: managerColors.muted }}>جارٍ حفظ الصفحة…</Text>
        </View>
      ) : !pageSelected ? (
        <PagePickerScreen
          pages={pagesQuery.data ?? []}
          isLoading={pagesQuery.isPending}
          onSelect={(page) => selectPageMutation.mutate(page)}
        />
      ) : (
        <ComposerScreen
          pageName={status?.pageName ?? ""}
          instagramUsername={status?.instagramUsername ?? null}
          defaultPlatform={defaultPlatform}
          onPublished={handlePublished}
        />
      )}
    </SafeAreaView>
  );
}
