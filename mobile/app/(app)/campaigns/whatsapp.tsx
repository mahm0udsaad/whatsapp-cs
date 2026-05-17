import { useMemo } from "react";
import {
  FlatList,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import {
  listMarketingTemplates,
  listMarketingCampaigns,
  type CampaignStatus,
  type MarketingCampaignRow,
  type MarketingTemplate,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import {
  CardSkeleton,
  ListSkeleton,
  managerColors,
  softShadow,
} from "../../../components/manager-ui";
import { Image, Pressable, SafeAreaView, Text, View } from "../../../components/tw";

export default function CampaignsIndexScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";

  const campaignsQuery = useQuery({
    queryKey: qk.marketingCampaigns(restaurantId),
    enabled: !!restaurantId,
    queryFn: listMarketingCampaigns,
    refetchInterval: 15_000,
  });

  const templatesQuery = useQuery({
    queryKey: ["marketing-templates", restaurantId],
    enabled: !!restaurantId,
    queryFn: listMarketingTemplates,
    staleTime: 60_000,
  });

  const rows = useMemo<MarketingCampaignRow[]>(
    () => (Array.isArray(campaignsQuery.data) ? campaignsQuery.data : []),
    [campaignsQuery.data]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, c) => ({
          sent: a.sent + (c.sent_count ?? 0),
          delivered: a.delivered + (c.delivered_count ?? 0),
          read: a.read + (c.read_count ?? 0),
        }),
        { sent: 0, delivered: 0, read: 0 }
      ),
    [rows]
  );

  const templateMap = useMemo(() => {
    const templates = Array.isArray(templatesQuery.data)
      ? templatesQuery.data
      : [];
    return new Map<string, MarketingTemplate>(
      templates.map((template) => [template.id, template])
    );
  }, [templatesQuery.data]);

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: managerColors.bg }}
      edges={["left", "right"]}
    >
      {campaignsQuery.isLoading ? (
        <View className="flex-1">
          <View className="px-4 pt-3">
            <CardSkeleton rows={3} />
          </View>
          <ListSkeleton count={4} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: 12, paddingBottom: 148 }}
          refreshControl={
            <RefreshControl
              refreshing={campaignsQuery.isFetching}
              onRefresh={() => campaignsQuery.refetch()}
            />
          }
          ListHeaderComponent={
            <View className="gap-3">
              <View
                className="overflow-hidden rounded-[30px] px-5 py-5"
                style={{
                  backgroundColor: managerColors.brand,
                  ...softShadow,
                }}
              >
                <View
                  className="absolute -left-8 top-6 h-24 w-24 rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                />
                <View
                  className="absolute -right-10 -bottom-8 h-28 w-28 rounded-full"
                  style={{ backgroundColor: "rgba(37,211,102,0.20)" }}
                />
                <View className="flex-row-reverse items-start justify-between gap-3">
                  <View className="flex-1">
                    <View className="self-end rounded-full bg-white/10 px-3 py-1">
                      <Text
                        className="text-[11px] font-semibold"
                        style={{ color: "rgba(255,255,255,0.82)" }}
                      >
                        WhatsApp Broadcast
                      </Text>
                    </View>
                    <Text
                      className="mt-3 text-right text-[26px] font-bold"
                      style={{ color: "#FFFFFF" }}
                    >
                      حملات الرسائل
                    </Text>
                    <Text
                      className="mt-2 text-right text-[14px] leading-6"
                      style={{ color: "rgba(255,255,255,0.82)" }}
                    >
                      أرسل العروض والتحديثات لشرائح العملاء، وتابع التسليم والقراءة
                      من نفس الشاشة.
                    </Text>
                  </View>
                  <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-white/12">
                    <Ionicons name="logo-whatsapp" size={26} color="#FFFFFF" />
                  </View>
                </View>
              </View>

              <Pressable
                onPress={() => router.push("/(app)/customers")}
                className="overflow-hidden rounded-[26px] border px-4 py-4"
                style={{
                  borderColor: "#E7EBFB",
                  backgroundColor: managerColors.surface,
                  ...softShadow,
                }}
              >
                <View
                  className="absolute -left-6 top-5 h-24 w-24 rounded-full"
                  style={{ backgroundColor: "rgba(39,59,154,0.05)" }}
                />
                <View className="flex-row-reverse items-center justify-between gap-3">
                  <View className="flex-row-reverse items-center gap-3">
                    <View className="h-12 w-12 items-center justify-center rounded-[18px] bg-[#EDF2FF]">
                      <Ionicons
                        name="people-circle-outline"
                        size={24}
                        color="#273B9A"
                      />
                    </View>
                    <View>
                      <Text className="text-right text-base font-bold text-[#16245C]">
                        العملاء
                      </Text>
                      <Text className="mt-0.5 text-right text-xs leading-5 text-[#7A88B8]">
                        دفتر جهات الاتصال لاختيار مستلمي الحملات
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-back" size={20} color="#667085" />
                </View>
                <View className="mt-4 flex-row-reverse items-center justify-between">
                  <Text className="text-right text-xs font-semibold text-[#273B9A]">
                    إدارة جهات الاتصال
                  </Text>
                  <Text className="text-right text-[12px] text-[#7A88B8]">
                    حدّد الشرائح قبل إنشاء الحملة
                  </Text>
                </View>
              </Pressable>

              {rows.length > 0 ? (
                <View
                  className="overflow-hidden rounded-[28px] border p-4"
                  style={{
                    borderColor: "#D6DDF8",
                    backgroundColor: managerColors.surface,
                    ...softShadow,
                  }}
                >
                  <View className="flex-row-reverse items-start justify-between gap-3">
                    <View>
                      <Text className="text-right text-lg font-bold text-[#16245C]">
                        لوحة النشاط
                      </Text>
                      <Text className="mt-1 text-right text-xs leading-5 text-[#7A88B8]">
                        قراءة سريعة لأداء حملات WhatsApp الحالية
                      </Text>
                    </View>
                    <View className="rounded-full bg-[#EDF2FF] px-3 py-1.5">
                      <Text className="text-[11px] font-semibold text-[#273B9A]">
                        {rows.length} حملة
                      </Text>
                    </View>
                  </View>
                  <View className="mt-4 flex-row-reverse flex-wrap gap-2">
                    <CampaignSummaryStat label="الحملات" value={rows.length} tone="neutral" />
                    <CampaignSummaryStat label="مرسلة" value={totals.sent} tone="brand" />
                    <CampaignSummaryStat label="تم التسليم" value={totals.delivered} tone="success" />
                    <CampaignSummaryStat label="مقروءة" value={totals.read} tone="accent" />
                  </View>
                </View>
              ) : (
                <View
                  className="mb-1 overflow-hidden rounded-[28px] border px-5 py-5"
                  style={{
                    borderColor: "#D6DDF8",
                    backgroundColor: "#273B9A",
                  }}
                >
                  <View
                    className="absolute -left-8 -top-8 h-24 w-24 rounded-full"
                    style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
                  />
                  <View
                    className="absolute -bottom-10 right-0 h-28 w-28 rounded-full"
                    style={{ backgroundColor: "rgba(37,211,102,0.18)" }}
                  />
                  <Text
                    className="text-right text-xs font-semibold"
                    style={{ color: "rgba(255,255,255,0.70)" }}
                  >
                    الحملات
                  </Text>
                  <Text
                    className="mt-2 text-right text-2xl font-bold"
                    style={{ color: "#FFFFFF" }}
                  >
                    ابدأ أول حملة
                  </Text>
                  <Text
                    className="mt-2 text-right text-sm leading-6"
                    style={{ color: "rgba(255,255,255,0.82)" }}
                  >
                    جهّز القالب، اختر العملاء، ثم ابدأ إرسال الرسائل الجماعية من
                    هنا.
                  </Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center px-8 py-10">
              <View className="h-16 w-16 items-center justify-center rounded-[22px] bg-[#EDF2FF]">
                <Ionicons
                  name="megaphone-outline"
                  size={30}
                  color="#273B9A"
                />
              </View>
              <Text className="mt-4 text-base font-bold text-[#16245C]">
                لا توجد حملات بعد
              </Text>
              <Text className="mt-1 text-center text-sm leading-6 text-[#7A88B8]">
                ابدأ أول حملة جديدة أو افتح القوالب لتجهيز المحتوى أولًا.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <CampaignCard
              row={item}
              template={item.template_id ? templateMap.get(item.template_id) : undefined}
              onPress={() =>
                router.push({
                  pathname: "/campaigns/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
        />
      )}

      <View
        className="absolute bottom-4 left-4 right-4 flex-row-reverse gap-3 rounded-[28px] border px-4 py-3"
        style={{
          borderColor: "#E7EBFB",
          backgroundColor: "rgba(255,255,255,0.96)",
        }}
      >
        <Pressable
          onPress={() => router.push("/campaigns/new")}
          className="h-12 flex-1 flex-row-reverse items-center justify-center gap-2 rounded-full"
          style={{
            backgroundColor: managerColors.brand,
            shadowColor: managerColors.brandDark,
            shadowOpacity: 0.14,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text className="font-bold text-white">حملة جديدة</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/campaigns/templates")}
          className="h-12 flex-row-reverse items-center justify-center gap-2 rounded-full border px-4"
          style={{
            borderColor: "#D6DDF8",
            backgroundColor: "#F8FAFF",
          }}
        >
          <Ionicons name="document-text-outline" size={18} color="#273B9A" />
          <Text className="text-sm font-semibold text-[#273B9A]">القوالب</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function statusLabel(s: CampaignStatus): { label: string; tone: string } {
  switch (s) {
    case "draft":
      return { label: "مسودة", tone: "bg-gray-100 text-gray-700" };
    case "scheduled":
      return { label: "مجدولة", tone: "bg-indigo-50 text-indigo-900" };
    case "sending":
      return { label: "قيد الإرسال", tone: "bg-amber-50 text-amber-900" };
    case "completed":
      return { label: "مكتملة", tone: "bg-emerald-50 text-emerald-900" };
    case "partially_completed":
      return { label: "مكتملة جزئياً", tone: "bg-amber-50 text-amber-900" };
    case "failed":
      return { label: "فشلت", tone: "bg-red-50 text-red-900" };
    default:
      return { label: s ?? "غير معروف", tone: "bg-gray-100 text-gray-700" };
  }
}

function CampaignCard({
  row,
  template,
  onPress,
}: {
  row: MarketingCampaignRow;
  template?: MarketingTemplate;
  onPress: () => void;
}) {
  const s = statusLabel(row.status);
  const progressPct =
    row.total_recipients > 0
      ? Math.min(100, Math.round((row.sent_count / row.total_recipients) * 100))
      : 0;
  return (
    <Pressable
      onPress={onPress}
      className="mb-3 overflow-hidden rounded-[24px] border p-4"
      style={{
        borderColor: "#E7EBFB",
        backgroundColor: managerColors.surface,
      }}
    >
      <View className="flex-row-reverse items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-right text-base font-semibold text-[#16245C]">
            {row.name}
          </Text>
          <Text className="mt-1 text-right text-xs text-[#7A88B8]">
            {template?.name ?? row.marketing_templates?.name ?? "قالب غير محدد"} ·{" "}
            {formatDistanceToNow(new Date(row.created_at), {
              addSuffix: true,
              locale: ar,
            })}
          </Text>
        </View>
        <View className={`rounded-full px-2.5 py-1 ${s.tone}`}>
          <Text className="text-[11px] font-bold">{s.label}</Text>
        </View>
      </View>

      <View
        className="mt-3 overflow-hidden rounded-[22px] border p-3"
        style={{
          borderColor: "#E7EBFB",
          backgroundColor: "#F3F7FF",
        }}
      >
        <View className="mb-2 flex-row-reverse items-center justify-between">
          <View className="rounded-full bg-[#EDF2FF] px-2.5 py-1">
            <Text className="text-[11px] font-semibold text-[#273B9A]">
              شكل الرسالة
            </Text>
          </View>
          <Text className="text-[11px] text-[#7A88B8]">
            {template?.language?.toUpperCase() ?? "AR"}
          </Text>
        </View>

        <View className="items-start">
          <View
            className="w-full overflow-hidden rounded-[16px] bg-white"
            style={{ maxWidth: "92%" }}
          >
            {template?.header_type === "image" ? (
              template.header_image_url ? (
                <Image
                  source={{ uri: template.header_image_url }}
                  resizeMode="cover"
                  style={{ width: "100%", height: 120, backgroundColor: "#E5E7EB" }}
                />
              ) : (
                <View
                  className="h-[120px] items-center justify-center"
                  style={{ backgroundColor: "#E8EEF9" }}
                >
                  <Ionicons name="image-outline" size={24} color="#6B7BB6" />
                  <Text className="mt-2 text-xs font-semibold text-[#6B7BB6]">
                    رأس بصري
                  </Text>
                </View>
              )
            ) : null}

            <View className="px-3 py-3">
              {template?.header_type === "text" && template.header_text ? (
                <Text className="mb-1 text-right text-[13px] font-extrabold text-[#111827]">
                  {template.header_text}
                </Text>
              ) : null}

              <Text className="text-right text-[13.5px] leading-6 text-[#0F172A]">
                {buildTemplatePreview(template?.body_template)}
              </Text>

              {template?.footer_text ? (
                <Text className="mt-2 text-right text-[10.5px] text-[#9CA3AF]">
                  {template.footer_text}
                </Text>
              ) : null}

              <View className="mt-2 flex-row items-center gap-1 self-start">
                <Text className="text-[9.5px] text-[#9CA3AF]">١٢:٣٠ م</Text>
                <Ionicons name="checkmark-done" size={12} color="#34B7F1" />
              </View>
            </View>

            {Array.isArray(template?.buttons) && template.buttons.length > 0 ? (
              <View style={{ borderTopWidth: 1, borderTopColor: "#0000000D" }}>
                {template.buttons.slice(0, 3).map((button, index) => (
                  <View
                    key={`${String(button.title ?? "button")}-${index}`}
                    className="flex-row-reverse items-center justify-center gap-2 py-2.5"
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: "#0000000D",
                    }}
                  >
                    <Ionicons
                      name={templateButtonIcon(button)}
                      size={14}
                      color="#00A884"
                    />
                    <Text className="text-[12.5px] font-bold text-[#00A884]">
                      {String(button.title ?? "إجراء")}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {row.total_recipients > 0 ? (
        <View className="mt-3">
          <View className="h-1.5 overflow-hidden rounded-full bg-[#EEF2FF]">
            <View
              className="h-full bg-[#273B9A]"
              style={{ width: `${progressPct}%` }}
            />
          </View>
          <View className="mt-3 flex-row-reverse flex-wrap items-center gap-2">
            <MiniCount label="مرسلة" value={row.sent_count} />
            <MiniCount label="مستلمون" value={row.total_recipients} />
            <MiniCount label="تسليم" value={row.delivered_count} />
            <MiniCount label="قراءة" value={row.read_count} />
            {row.failed_count > 0 ? (
              <MiniCount label="فشل" value={row.failed_count} tone="danger" />
            ) : null}
          </View>
        </View>
      ) : (
        <View className="mt-3 rounded-[18px] bg-[#F8FAFF] px-3 py-3">
          <Text className="text-right text-[11px] text-[#7A88B8]">
            لا توجد جهات اتصال بعد
          </Text>
        </View>
      )}

      <View className="mt-3 flex-row-reverse items-center justify-between">
        {row.scheduled_at ? (
          <Text className="text-right text-[11px] text-[#273B9A]">
            موعد الإرسال: {format(new Date(row.scheduled_at), "yyyy-MM-dd HH:mm")}
          </Text>
        ) : (
          <View />
        )}
        <View className="flex-row-reverse items-center gap-1.5">
          <Text className="text-[11px] font-semibold text-[#7A88B8]">
            فتح التفاصيل
          </Text>
          <Ionicons name="chevron-back" size={16} color="#7A88B8" />
        </View>
      </View>
    </Pressable>
  );
}

function MiniCount({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <View
      className={`rounded-full px-2.5 py-1 ${
        tone === "danger" ? "bg-red-50" : "bg-[#F4F7FF]"
      }`}
    >
      <Text
        className={`text-[11px] font-semibold ${
          tone === "danger" ? "text-red-700" : "text-[#5E6A99]"
        }`}
      >
        {label} {value.toLocaleString()}
      </Text>
    </View>
  );
}

function CampaignSummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "brand" | "success" | "accent";
}) {
  const palette = {
    neutral: {
      backgroundColor: "#F7F9FF",
      borderColor: "#E7EBFB",
      valueColor: "#16245C",
      labelColor: "#7A88B8",
    },
    brand: {
      backgroundColor: "#EDF2FF",
      borderColor: "#D6DDF8",
      valueColor: "#273B9A",
      labelColor: "#5E6A99",
    },
    success: {
      backgroundColor: "#ECFDF3",
      borderColor: "#CDEFD9",
      valueColor: "#027A48",
      labelColor: "#5E6A99",
    },
    accent: {
      backgroundColor: "#FFF7D8",
      borderColor: "#F4D774",
      valueColor: "#8A5E00",
      labelColor: "#5E6A99",
    },
  }[tone];

  return (
    <View
      className="min-w-[48%] flex-1 rounded-[20px] border px-4 py-3"
      style={{
        backgroundColor: palette.backgroundColor,
        borderColor: palette.borderColor,
      }}
    >
      <Text className="text-right text-2xl font-bold" style={{ color: palette.valueColor }}>
        {value.toLocaleString()}
      </Text>
      <Text className="mt-1 text-right text-xs font-medium" style={{ color: palette.labelColor }}>
        {label}
      </Text>
    </View>
  );
}

function buildTemplatePreview(templateBody?: string | null) {
  if (!templateBody) return "لا توجد معاينة نصية متاحة لهذا القالب حالياً.";

  return templateBody
    .replace(/\{\{\d+\}\}/g, "____")
    .replace(/\s+/g, " ")
    .trim();
}

function templateButtonIcon(button: Record<string, unknown>) {
  const type = String(button.type ?? "");
  switch (type) {
    case "URL":
      return "link-outline" as const;
    case "PHONE_NUMBER":
      return "call-outline" as const;
    default:
      return "arrow-undo-outline" as const;
  }
}
