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
  type TemplateExampleButton,
} from "../../../lib/template-examples";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { managerColors } from "../../../components/manager-ui";

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

// Category → accent palette for the image-header hero. Plain colors only
// (no LinearGradient dep) to keep the mobile bundle unchanged.
const CATEGORY_THEME: Record<
  TemplateExample["category"],
  { bg: string; accent: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  MARKETING: {
    bg: "#FEE2E2",
    accent: "#EF4444",
    icon: "pricetag",
    label: "تسويق",
  },
  UTILITY: {
    bg: "#DBEAFE",
    accent: "#2563EB",
    icon: "information-circle",
    label: "خدمة",
  },
};

// Slug-based illustration hint — pick an icon that fits the specific preset.
const SLUG_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  promotion_discount: "pricetags",
  welcome_back: "heart",
  order_status_update: "bicycle",
  event_invite: "calendar",
  feedback_request: "chatbubbles",
  booking_reminder: "calendar-outline",
};

function buttonIconFor(
  type: TemplateExampleButton["type"]
): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "URL":
      return "open-outline";
    case "PHONE_NUMBER":
      return "call-outline";
    case "QUICK_REPLY":
    default:
      return "chatbubble-ellipses-outline";
  }
}

function WhatsAppBubble({
  example,
}: {
  example: TemplateExample;
}) {
  const theme = CATEGORY_THEME[example.category];
  const heroIcon = SLUG_ICON[example.slug] ?? theme.icon;
  const { preview } = example;

  return (
    <View
      style={{
        backgroundColor: "#E5DDD5", // WhatsApp chat wallpaper beige
        borderRadius: 12,
        padding: 10,
      }}
    >
      {/* The message bubble */}
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 10,
          borderTopRightRadius: 4, // outgoing-style tail on the right for RTL
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }}
      >
        {/* Hero — image-header preset renders a colored illustration block */}
        {preview.header_type === "image" ? (
          <View
            style={{
              height: 120,
              backgroundColor: theme.bg,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 1,
              borderBottomColor: "#00000010",
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: theme.accent,
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }}
            >
              <Ionicons name={heroIcon} size={28} color={theme.accent} />
            </View>
            <View
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#00000080",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Ionicons name="image" size={10} color="#fff" />
              <Text
                style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}
              >
                صورة
              </Text>
            </View>
          </View>
        ) : null}

        {/* Body area */}
        <View style={{ padding: 10 }}>
          {preview.header_type === "text" && preview.header_text ? (
            <Text
              style={{
                textAlign: "right",
                fontSize: 13,
                fontWeight: "800",
                color: "#111827",
                marginBottom: 4,
              }}
            >
              {preview.header_text}
            </Text>
          ) : null}

          <Text
            style={{
              textAlign: "right",
              fontSize: 13.5,
              lineHeight: 20,
              color: "#0F172A",
            }}
          >
            {preview.body_template}
          </Text>

          {preview.footer_text ? (
            <Text
              style={{
                textAlign: "right",
                fontSize: 10.5,
                color: "#9CA3AF",
                marginTop: 6,
              }}
            >
              {preview.footer_text}
            </Text>
          ) : null}

          {/* Timestamp strip — pure decoration to feel like WhatsApp */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-start",
              alignItems: "center",
              marginTop: 6,
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 9.5, color: "#9CA3AF" }}>١٢:٣٠ م</Text>
            <Ionicons name="checkmark-done" size={12} color="#34B7F1" />
          </View>
        </View>

        {/* Action buttons — WhatsApp-style full-width divided stack */}
        {preview.buttons && preview.buttons.length > 0 ? (
          <View style={{ borderTopWidth: 1, borderTopColor: "#0000000D" }}>
            {preview.buttons.map((btn, idx) => (
              <View
                key={`${btn.title}-${idx}`}
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 9,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: "#0000000D",
                }}
              >
                <Ionicons
                  name={buttonIconFor(btn.type)}
                  size={14}
                  color="#00A884"
                />
                <Text
                  style={{
                    color: "#00A884",
                    fontSize: 12.5,
                    fontWeight: "700",
                  }}
                >
                  {btn.title}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ExampleCard({
  example,
  onPress,
}: {
  example: TemplateExample;
  onPress: () => void;
}) {
  const theme = CATEGORY_THEME[example.category];
  return (
    <Pressable onPress={onPress} style={{ marginBottom: 14 }}>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          overflow: "hidden",
        }}
      >
        {/* Header strip: category + title + description */}
        <View style={{ padding: 12 }}>
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: "#0F172A",
                textAlign: "right",
                flex: 1,
              }}
            >
              {example.title}
            </Text>
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 4,
                backgroundColor: theme.bg,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
              }}
            >
              <Ionicons name={theme.icon} size={11} color={theme.accent} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: theme.accent,
                }}
              >
                {theme.label}
              </Text>
            </View>
          </View>
          <Text
            style={{
              marginTop: 4,
              fontSize: 11.5,
              color: "#6B7280",
              textAlign: "right",
              lineHeight: 16,
            }}
          >
            {example.description}
          </Text>
        </View>

        {/* Live WhatsApp-bubble preview */}
        <View style={{ paddingHorizontal: 10 }}>
          <WhatsAppBubble example={example} />
        </View>

        {/* Footer CTA */}
        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 6,
            }}
          >
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 3,
                backgroundColor: "#F3F4F6",
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 999,
              }}
            >
              <Ionicons name="code-slash" size={10} color="#6B7280" />
              <Text
                style={{ fontSize: 10, color: "#4B5563", fontWeight: "600" }}
              >
                {example.variables.length} متغيّرات
              </Text>
            </View>
            {example.preview.buttons?.length ? (
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 3,
                  backgroundColor: "#F3F4F6",
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  borderRadius: 999,
                }}
              >
                <Ionicons name="radio-button-on" size={10} color="#6B7280" />
                <Text
                  style={{
                    fontSize: 10,
                    color: "#4B5563",
                    fontWeight: "600",
                  }}
                >
                  {example.preview.buttons.length} أزرار
                </Text>
              </View>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#00A884",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
            }}
          >
            <Text
              style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}
            >
              استخدام
            </Text>
            <Ionicons name="arrow-back" size={13} color="#fff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ApprovedCard({
  template,
  onPress,
}: {
  template: MarketingTemplate;
  onPress: () => void;
}) {
  const cat = (template.category as TemplateExample["category"]) ?? "MARKETING";
  const theme = CATEGORY_THEME[cat] ?? CATEGORY_THEME.MARKETING;

  return (
    <Pressable onPress={onPress} style={{ marginBottom: 14 }}>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          overflow: "hidden",
        }}
      >
        <View style={{ padding: 12 }}>
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: "#0F172A",
                textAlign: "right",
                flex: 1,
              }}
            >
              {template.name}
            </Text>
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#D1FAE5",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
              }}
            >
              <Ionicons name="checkmark-circle" size={11} color="#047857" />
              <Text
                style={{ fontSize: 10, fontWeight: "700", color: "#047857" }}
              >
                معتمد
              </Text>
            </View>
          </View>
          <Text
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "#6B7280",
              textAlign: "right",
            }}
          >
            {(template.language ?? "").toUpperCase()} · {theme.label}
          </Text>
        </View>

        {/* WhatsApp-bubble preview based on the stored template fields */}
        <View style={{ paddingHorizontal: 10 }}>
          <View
            style={{
              backgroundColor: "#E5DDD5",
              borderRadius: 12,
              padding: 10,
            }}
          >
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 10,
                borderTopRightRadius: 4,
                overflow: "hidden",
              }}
            >
              {template.header_type === "image" && template.header_image_url ? (
                <View
                  style={{
                    height: 120,
                    backgroundColor: "#F3F4F6",
                  }}
                />
              ) : null}
              <View style={{ padding: 10 }}>
                {template.header_type === "text" && template.header_text ? (
                  <Text
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#111827",
                      marginBottom: 4,
                    }}
                  >
                    {template.header_text}
                  </Text>
                ) : null}
                <Text
                  numberOfLines={4}
                  style={{
                    textAlign: "right",
                    fontSize: 13,
                    lineHeight: 20,
                    color: "#0F172A",
                  }}
                >
                  {template.body_template}
                </Text>
                {template.footer_text ? (
                  <Text
                    style={{
                      textAlign: "right",
                      fontSize: 10.5,
                      color: "#9CA3AF",
                      marginTop: 6,
                    }}
                  >
                    {template.footer_text}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#00A884",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
              استخدام
            </Text>
            <Ionicons name="arrow-back" size={13} color="#fff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
