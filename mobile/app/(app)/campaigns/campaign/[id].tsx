import { useMemo } from "react";
import {
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  getMetaCampaignDetail,
  type MetaCampaignDetail,
} from "../../../../lib/api";
import { qk } from "../../../../lib/query-keys";
import { useSessionStore } from "../../../../lib/session-store";
import { ManagerCard, managerColors, softShadow } from "../../../../components/manager-ui";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "../../../../components/tw";

// Reuse the objective metadata from the meta.tsx — kept inline here to avoid
// cross-screen import cycles.
const OBJECTIVE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  OUTCOME_AWARENESS: { label: "وعي بالعلامة", icon: "eye", color: "#0EA5E9" },
  OUTCOME_TRAFFIC: { label: "زيارات", icon: "navigate", color: "#22C55E" },
  OUTCOME_ENGAGEMENT: { label: "تفاعل", icon: "heart", color: "#E1306C" },
  OUTCOME_LEADS: { label: "عملاء محتملون", icon: "person-add", color: "#7C3AED" },
  OUTCOME_SALES: { label: "مبيعات", icon: "cart", color: "#F59E0B" },
  OUTCOME_APP_PROMOTION: { label: "تثبيت", icon: "phone-portrait", color: "#06B6D4" },
  REACH: { label: "وعي", icon: "eye", color: "#0EA5E9" },
  LINK_CLICKS: { label: "زيارات", icon: "navigate", color: "#22C55E" },
  POST_ENGAGEMENT: { label: "تفاعل", icon: "heart", color: "#E1306C" },
};

function objMeta(objective: string) {
  return (
    OBJECTIVE_META[objective] ?? {
      label: objective.replace(/^OUTCOME_/, "").toLowerCase(),
      icon: "ellipse" as const,
      color: managerColors.muted,
    }
  );
}

function relativeAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
  } catch {
    return null;
  }
}

function formatSpend(spend: string | number | undefined): string {
  const n = Number(spend ?? 0);
  if (!n) return "0 ر.س";
  return `${n.toFixed(2)} ر.س`;
}

function statusColor(s: string) {
  switch (s) {
    case "ACTIVE":
      return "#22c55e";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
      return managerColors.muted;
    case "DELETED":
    case "ARCHIVED":
      return managerColors.danger;
    default:
      return managerColors.warning;
  }
}

function statusLabel(s: string) {
  switch (s) {
    case "ACTIVE":
      return "نشطة";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
      return "متوقفة";
    case "DELETED":
      return "محذوفة";
    case "ARCHIVED":
      return "مؤرشفة";
    default:
      return s;
  }
}

function extractCreativeMedia(d: MetaCampaignDetail): {
  thumbnailUrl: string | null;
  videoUrl: string | null;
  isVideo: boolean;
} {
  const c = d.ads?.data?.[0]?.creative;
  if (!c) return { thumbnailUrl: null, videoUrl: null, isVideo: false };
  const videoThumb = c.object_story_spec?.video_data?.image_url;
  const videoUrl = c.video_url ?? null;
  if (videoThumb || videoUrl) {
    return {
      thumbnailUrl: videoThumb ?? null,
      videoUrl,
      isVideo: true,
    };
  }
  const url =
    c.image_url ||
    c.thumbnail_url ||
    c.object_story_spec?.link_data?.picture ||
    c.object_story_spec?.photo_data?.url ||
    null;
  return { thumbnailUrl: url, videoUrl: null, isVideo: false };
}

// ---- hero media (image OR inline video) -------------------------------------

function HeroMedia({
  videoUrl,
  thumbnailUrl,
  isVideo,
  fallbackIcon,
  fallbackColor,
}: {
  videoUrl: string | null;
  thumbnailUrl: string | null;
  isVideo: boolean;
  fallbackIcon: keyof typeof Ionicons.glyphMap;
  fallbackColor: string;
}) {
  // Always call useVideoPlayer (hooks rule), but feed it null when there's no
  // video — the hook handles that gracefully.
  const player = useVideoPlayer(videoUrl ?? null, (p) => {
    p.loop = true;
    p.muted = true; // autoplay-friendly default; user taps to unmute
  });

  // Video case — render the inline player
  if (isVideo && videoUrl) {
    return (
      <View style={{ width: "100%", aspectRatio: 1.4, backgroundColor: "#000" }}>
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          nativeControls
          allowsFullscreen
          allowsPictureInPicture
        />
      </View>
    );
  }

  // Image case
  if (thumbnailUrl) {
    return (
      <View>
        <Image source={{ uri: thumbnailUrl }} style={{ width: "100%", aspectRatio: 1.4 }} resizeMode="cover" />
        {isVideo ? (
          // Video without a resolvable source — show the still + a static badge
          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <View className="rounded-full p-3" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
              <Ionicons name="play" size={28} color="#fff" />
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  // No media at all — show the objective icon
  return (
    <View className="items-center justify-center py-12" style={{ backgroundColor: managerColors.surfaceTint }}>
      <Ionicons name={fallbackIcon} size={48} color={fallbackColor} />
    </View>
  );
}

// ---- mini bar chart ---------------------------------------------------------

function DailySpendChart({ data }: { data: MetaCampaignDetail["daily_insights"] }) {
  const days = data?.data ?? [];
  const max = useMemo(
    () => Math.max(1, ...days.map((d) => Number(d.spend))),
    [days]
  );

  if (!days.length) {
    return (
      <Text className="text-[12px]" style={{ color: managerColors.muted }}>
        لا توجد بيانات يومية بعد.
      </Text>
    );
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-end gap-[3px] h-[80px]">
        {days.map((d) => {
          const spend = Number(d.spend);
          const heightPct = Math.max(4, (spend / max) * 100);
          return (
            <View
              key={d.date_start}
              className="flex-1 rounded-t-[3px]"
              style={{
                height: `${heightPct}%`,
                backgroundColor: spend > 0 ? managerColors.brand : managerColors.border,
              }}
            />
          );
        })}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-[10px]" style={{ color: managerColors.muted }}>
          {days[0]?.date_start ?? ""}
        </Text>
        <Text className="text-[10px]" style={{ color: managerColors.muted }}>
          {days[days.length - 1]?.date_start ?? ""}
        </Text>
      </View>
    </View>
  );
}

// ---- main screen ------------------------------------------------------------

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";

  const query = useQuery({
    queryKey: qk.metaCampaignDetail(restaurantId, id ?? ""),
    enabled: !!restaurantId && !!id,
    queryFn: () => getMetaCampaignDetail(id!),
    staleTime: 60_000,
  });

  if (query.isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: managerColors.bg }}>
        <ActivityIndicator size="large" color={managerColors.brand} />
      </SafeAreaView>
    );
  }

  if (query.isError || !query.data) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
        <Header onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Ionicons name="cloud-offline-outline" size={40} color={managerColors.danger} />
          <Text className="text-center font-semibold text-[15px]" style={{ color: managerColors.ink }}>
            تعذّر تحميل تفاصيل الحملة
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const c = query.data;
  const obj = objMeta(c.objective);
  const { thumbnailUrl, videoUrl, isVideo: heroIsVideo } = extractCreativeMedia(c);
  const lt = c.lifetime_insights?.data?.[0];
  const seven = c.last7_insights?.data?.[0];
  const startedAgo = relativeAr(c.start_time ?? c.created_time ?? null);
  const endsIn = relativeAr(c.stop_time ?? null);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerClassName="p-4 gap-3 pb-10">
        {/* Hero */}
        <View
          className="rounded-[20px] overflow-hidden bg-white"
          style={{ borderColor: managerColors.border, borderWidth: 1, ...softShadow }}
        >
          <HeroMedia
            videoUrl={videoUrl}
            thumbnailUrl={thumbnailUrl}
            isVideo={heroIsVideo}
            fallbackIcon={obj.icon}
            fallbackColor={obj.color}
          />

          <View className="p-4 gap-2">
            {/* Objective + status + media-kind badges */}
            <View className="flex-row items-center gap-2 flex-wrap">
              <View
                className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ backgroundColor: `${obj.color}1A` }}
              >
                <Ionicons name={obj.icon} size={12} color={obj.color} />
                <Text className="text-[11px] font-semibold" style={{ color: obj.color }}>
                  {obj.label}
                </Text>
              </View>
              <View
                className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ backgroundColor: `${statusColor(c.effective_status)}1A` }}
              >
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor(c.effective_status) }} />
                <Text className="text-[11px] font-semibold" style={{ color: statusColor(c.effective_status) }}>
                  {statusLabel(c.effective_status)}
                </Text>
              </View>
              {heroIsVideo ? (
                <View
                  className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: managerColors.surfaceTint }}
                >
                  <Ionicons name="play-circle" size={12} color={managerColors.muted} />
                  <Text className="text-[11px] font-semibold" style={{ color: managerColors.muted }}>
                    فيديو
                  </Text>
                </View>
              ) : null}
            </View>

            <Text className="text-[18px] font-bold" style={{ color: managerColors.ink }}>
              {c.name}
            </Text>

            {(startedAgo || endsIn) && (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="calendar-outline" size={13} color={managerColors.muted} />
                <Text className="text-[12px]" style={{ color: managerColors.muted }}>
                  {startedAgo ? `بدأت ${startedAgo}` : ""}
                  {startedAgo && endsIn ? " · " : ""}
                  {endsIn ? `تنتهي ${endsIn}` : ""}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Lifetime stats */}
        <ManagerCard className="gap-3">
          <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>
            الأداء الكلي
          </Text>
          <View className="flex-row flex-wrap">
            <BigStat label="الإنفاق الكلي" value={formatSpend(lt?.spend)} />
            <BigStat label="الوصول" value={Number(lt?.reach || 0).toLocaleString("ar")} />
            <BigStat label="الظهور" value={Number(lt?.impressions || 0).toLocaleString("ar")} />
            <BigStat label="النقرات" value={Number(lt?.clicks || 0).toLocaleString("ar")} />
            <BigStat label="CTR" value={`${Number(lt?.ctr || 0).toFixed(2)}%`} />
            {lt?.cpc ? <BigStat label="CPC" value={formatSpend(lt.cpc)} /> : null}
          </View>
        </ManagerCard>

        {/* 7-day stats */}
        {seven ? (
          <ManagerCard className="gap-3">
            <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>
              آخر ٧ أيام
            </Text>
            <View className="flex-row flex-wrap">
              <BigStat label="الإنفاق" value={formatSpend(seven.spend)} />
              <BigStat label="الوصول" value={Number(seven.reach || 0).toLocaleString("ar")} />
              <BigStat label="النقرات" value={Number(seven.clicks || 0).toLocaleString("ar")} />
              <BigStat label="CTR" value={`${Number(seven.ctr || 0).toFixed(2)}%`} />
            </View>
          </ManagerCard>
        ) : null}

        {/* Daily chart */}
        <ManagerCard className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>
              الإنفاق اليومي — آخر ٣٠ يوم
            </Text>
          </View>
          <DailySpendChart data={c.daily_insights} />
        </ManagerCard>

        {/* Ads */}
        {c.ads?.data?.length ? (
          <ManagerCard className="gap-3">
            <Text className="text-[13px] font-semibold" style={{ color: managerColors.muted }}>
              الإعلانات داخل الحملة
            </Text>
            {c.ads.data.map((ad) => {
              const videoThumb = (ad.creative?.object_story_spec as { video_data?: { image_url?: string } } | undefined)
                ?.video_data?.image_url;
              const adIsVideo = Boolean(videoThumb);
              const adImg =
                videoThumb ??
                ad.creative?.image_url ??
                ad.creative?.thumbnail_url ??
                ad.creative?.object_story_spec?.link_data?.picture ??
                ad.creative?.object_story_spec?.photo_data?.url ??
                null;
              const status = ad.effective_status ?? "";
              return (
                <View key={ad.id} className="flex-row items-center gap-3 py-1">
                  <View
                    className="w-12 h-12 rounded-[10px] overflow-hidden items-center justify-center"
                    style={{ backgroundColor: managerColors.surfaceTint }}
                  >
                    {adImg ? (
                      <>
                        <Image source={{ uri: adImg }} className="w-full h-full" resizeMode="cover" />
                        {adIsVideo ? (
                          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                            <View className="rounded-full p-1" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                              <Ionicons name="play" size={10} color="#fff" />
                            </View>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <Ionicons name={adIsVideo ? "videocam-outline" : "image-outline"} size={18} color={managerColors.muted} />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ color: managerColors.ink }}
                      numberOfLines={1}
                    >
                      {ad.name ?? ad.id}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor(status) }} />
                      <Text className="text-[11px]" style={{ color: managerColors.muted }}>
                        {statusLabel(status)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ManagerCard>
        ) : null}

        {/* Open in Meta Ads Manager */}
        <Pressable
          onPress={() =>
            Linking.openURL(`https://business.facebook.com/adsmanager/manage/campaigns?act=&selected_campaign_ids=${c.id}`)
          }
          className="flex-row items-center justify-center gap-2 rounded-[14px] py-3 mt-2"
          style={{ borderColor: managerColors.border, borderWidth: 1 }}
        >
          <Ionicons name="open-outline" size={16} color={managerColors.brand} />
          <Text className="text-[13px] font-semibold" style={{ color: managerColors.brand }}>
            فتح في Meta Ads Manager
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View
      className="flex-row items-center px-4 py-3 border-b"
      style={{ backgroundColor: managerColors.surface, borderBottomColor: managerColors.border, ...softShadow }}
    >
      <Pressable onPress={onBack} hitSlop={8} className="mr-3">
        <Ionicons name="chevron-back" size={24} color={managerColors.ink} />
      </Pressable>
      <Text className="text-[17px] font-bold flex-1" style={{ color: managerColors.ink }}>
        تفاصيل الحملة
      </Text>
    </View>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/3 mb-3">
      <Text className="text-[11px]" style={{ color: managerColors.muted }}>
        {label}
      </Text>
      <Text className="text-[16px] font-bold mt-0.5" style={{ color: managerColors.ink }}>
        {value}
      </Text>
    </View>
  );
}
