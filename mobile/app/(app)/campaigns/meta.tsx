import { useState } from "react";
import {
  Alert,
  Linking,
  RefreshControl,
} from "react-native";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import {
  disconnectMetaAds,
  getMetaAdsAuthUrl,
  getMetaAdsStatus,
  listMetaAdAccounts,
  listMetaCampaigns,
  listMetaRecentPosts,
  selectMetaAdAccount,
  updateMetaCampaignStatus,
  type MetaAdAccount,
  type MetaCampaign,
  type RecentPost,
} from "../../../lib/api";
import { captureException, captureMessage } from "../../../lib/observability";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors, softShadow } from "../../../components/manager-ui";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  View,
} from "../../../components/tw";

const APP_SCHEME = "whatsapp-cs-agent";
const META_CALLBACK_URL = `${APP_SCHEME}://meta-ads/callback`;

// Platform-specific branding
type Platform = "instagram" | "facebook";
const PLATFORM_THEME = {
  instagram: { color: "#E1306C", icon: "logo-instagram" as const, name: "Instagram" },
  facebook: { color: "#1877F2", icon: "logo-facebook" as const, name: "Facebook" },
};

// ---- helpers ---------------------------------------------------------------

function formatBudget(daily: string | null, lifetime: string | null) {
  const cents = Number(daily ?? lifetime ?? 0);
  if (!cents) return null;
  return `${(cents / 100).toFixed(0)} د.إ`;
}

function formatSpend(spend: string | undefined) {
  const n = Number(spend ?? 0);
  if (!n) return "0 د.إ";
  return `${n.toFixed(2)} د.إ`;
}

function statusColor(effectiveStatus: string) {
  switch (effectiveStatus) {
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

function statusLabel(effectiveStatus: string) {
  switch (effectiveStatus) {
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
      return effectiveStatus;
  }
}

// Objective metadata — handles both ODAX (OUTCOME_*) and legacy objectives
const OBJECTIVE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  OUTCOME_AWARENESS: { label: "وعي", icon: "eye", color: "#0EA5E9" },
  OUTCOME_TRAFFIC: { label: "زيارات", icon: "navigate", color: "#22C55E" },
  OUTCOME_ENGAGEMENT: { label: "تفاعل", icon: "heart", color: "#E1306C" },
  OUTCOME_LEADS: { label: "عملاء", icon: "person-add", color: "#7C3AED" },
  OUTCOME_SALES: { label: "مبيعات", icon: "cart", color: "#F59E0B" },
  OUTCOME_APP_PROMOTION: { label: "تثبيت", icon: "phone-portrait", color: "#06B6D4" },
  // Legacy objectives still in the wild
  REACH: { label: "وعي", icon: "eye", color: "#0EA5E9" },
  BRAND_AWARENESS: { label: "وعي", icon: "eye", color: "#0EA5E9" },
  LINK_CLICKS: { label: "زيارات", icon: "navigate", color: "#22C55E" },
  POST_ENGAGEMENT: { label: "تفاعل", icon: "heart", color: "#E1306C" },
  PAGE_LIKES: { label: "تفاعل", icon: "heart", color: "#E1306C" },
  LEAD_GENERATION: { label: "عملاء", icon: "person-add", color: "#7C3AED" },
  CONVERSIONS: { label: "مبيعات", icon: "cart", color: "#F59E0B" },
  APP_INSTALLS: { label: "تثبيت", icon: "phone-portrait", color: "#06B6D4" },
  MESSAGES: { label: "رسائل", icon: "chatbubble", color: "#22D3EE" },
  VIDEO_VIEWS: { label: "مشاهدات", icon: "play", color: "#A855F7" },
};

function objectiveMeta(objective: string) {
  return (
    OBJECTIVE_META[objective] ?? {
      label: objective.replace(/^OUTCOME_/, "").toLowerCase(),
      icon: "ellipse" as const,
      color: managerColors.muted,
    }
  );
}

function relativeTimeAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
  } catch {
    return null;
  }
}

// Extract the best available thumbnail from a campaign's first ad.
// Returns both the URL and whether the creative is a video (so we can render
// a play overlay).
function extractCreativeMedia(campaign: MetaCampaign): {
  url: string | null;
  isVideo: boolean;
} {
  const creative = campaign.ads?.data?.[0]?.creative;
  if (!creative) return { url: null, isVideo: false };

  // Meta returns video ad thumbnails under object_story_spec.video_data.image_url
  // (not link_data.picture). Detect that path and flag the creative as video.
  const videoThumb = (creative.object_story_spec as { video_data?: { image_url?: string; video_id?: string } } | undefined)
    ?.video_data?.image_url;
  if (videoThumb) {
    return { url: videoThumb, isVideo: true };
  }

  const url =
    creative.thumbnail_url ||
    creative.image_url ||
    creative.object_story_spec?.link_data?.picture ||
    creative.object_story_spec?.photo_data?.url ||
    null;
  return { url, isVideo: false };
}

// ---- sub-components --------------------------------------------------------

function ConnectScreen({
  platform,
  onConnect,
}: {
  platform: Platform;
  onConnect: () => void;
}) {
  const theme = PLATFORM_THEME[platform];
  const requiresIgNote = platform === "instagram"
    ? "يتطلب حساب Instagram للأعمال (Business / Creator) مرتبط بصفحة Facebook"
    : "يتطلب صفحة Facebook للأعمال";

  return (
    <View className="flex-1 items-center justify-center px-8 gap-6">
      <View
        className="w-20 h-20 rounded-[22px] items-center justify-center"
        style={{ backgroundColor: theme.color }}
      >
        <Ionicons name={theme.icon} size={44} color="#fff" />
      </View>

      <View className="items-center gap-2">
        <Text
          className="text-[22px] font-bold text-center"
          style={{ color: managerColors.ink }}
        >
          انشر على {theme.name}
        </Text>
        <Text
          className="text-center text-[15px] leading-6"
          style={{ color: managerColors.muted }}
        >
          اربط حسابك على Meta لتنشر منشورات وتدير حملاتك الإعلانية على
          Instagram و Facebook من تطبيق واحد.
        </Text>
      </View>

      <View className="gap-3 w-full">
        <View className="flex-row items-center gap-3">
          <Ionicons name="image-outline" size={20} color={theme.color} />
          <Text style={{ color: managerColors.muted }}>نشر منشورات بالصور والتعليقات</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Ionicons name="bar-chart-outline" size={20} color={theme.color} />
          <Text style={{ color: managerColors.muted }}>إدارة الحملات الإعلانية ومتابعة الأداء</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.color} />
          <Text style={{ color: managerColors.muted }}>اتصال آمن عبر Meta Business</Text>
        </View>
      </View>

      <Pressable
        onPress={onConnect}
        className="w-full rounded-[14px] py-4 items-center"
        style={{ backgroundColor: theme.color }}
      >
        <Text className="text-white font-bold text-[16px]">ربط حساب {theme.name}</Text>
      </Pressable>

      <Text className="text-center text-[12px]" style={{ color: managerColors.muted }}>
        {requiresIgNote}
      </Text>
    </View>
  );
}

function AccountPickerScreen({
  accounts,
  isLoading,
  onSelect,
}: {
  accounts: MetaAdAccount[];
  isLoading: boolean;
  onSelect: (account: MetaAdAccount) => void;
}) {
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={managerColors.brand} />
        <Text className="mt-4" style={{ color: managerColors.muted }}>
          جارٍ تحميل حسابات الإعلانات…
        </Text>
      </View>
    );
  }

  if (!accounts.length) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Ionicons name="albums-outline" size={48} color={managerColors.muted} />
        <Text
          className="text-center mt-4 font-semibold text-[16px]"
          style={{ color: managerColors.ink }}
        >
          لا توجد حسابات إعلانية
        </Text>
        <Text
          className="text-center mt-2"
          style={{ color: managerColors.muted }}
        >
          لم يتم العثور على حسابات إعلانية مرتبطة بهذا حساب Meta.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerClassName="p-4 gap-3">
      <Text
        className="text-[18px] font-bold mb-2"
        style={{ color: managerColors.ink }}
      >
        اختر حساب الإعلانات
      </Text>
      {accounts.map((acc) => (
        <Pressable key={acc.id} onPress={() => onSelect(acc)}>
          <ManagerCard className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-semibold text-[15px]" style={{ color: managerColors.ink }}>
                {acc.name}
              </Text>
              <Text className="text-[13px] mt-0.5" style={{ color: managerColors.muted }}>
                {acc.id} · {acc.currency}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={managerColors.muted}
            />
          </ManagerCard>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function CampaignCard({
  campaign,
  onToggle,
  isToggling,
}: {
  campaign: MetaCampaign;
  onToggle: (id: string, next: "ACTIVE" | "PAUSED") => void;
  isToggling: boolean;
}) {
  const insights = campaign.insights?.data?.[0];
  const lifetimeInsights = campaign.lifetime_insights?.data?.[0];
  const isActive = campaign.status === "ACTIVE";
  const canToggle =
    campaign.effective_status !== "DELETED" &&
    campaign.effective_status !== "ARCHIVED";
  const budget = formatBudget(campaign.daily_budget, campaign.lifetime_budget);
  const obj = objectiveMeta(campaign.objective);
  const { url: thumbnail, isVideo: thumbnailIsVideo } = extractCreativeMedia(campaign);
  const startedAgo = relativeTimeAr(campaign.start_time ?? campaign.created_time ?? null);
  const endsIn = relativeTimeAr(campaign.stop_time ?? null);

  return (
    <Pressable
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onPress={() => router.push(`/(app)/campaigns/campaign/${campaign.id}` as any)}
    >
      <ManagerCard className="gap-3">
        {/* Top section: thumbnail + title block + switch */}
        <View className="flex-row gap-3">
          {/* Creative thumbnail or fallback */}
          <View
            className="w-[72px] h-[72px] rounded-[12px] overflow-hidden items-center justify-center"
            style={{ backgroundColor: managerColors.surfaceTint }}
          >
            {thumbnail ? (
              <>
                <Image source={{ uri: thumbnail }} className="w-full h-full" resizeMode="cover" />
                {thumbnailIsVideo ? <PlayBadge /> : null}
              </>
            ) : (
              <Ionicons name={obj.icon} size={28} color={obj.color} />
            )}
          </View>

          {/* Title + meta */}
          <View className="flex-1 gap-1">
            {/* Objective badge */}
            <View
              className="self-start flex-row items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${obj.color}1A` }}
            >
              <Ionicons name={obj.icon} size={11} color={obj.color} />
              <Text className="text-[10px] font-semibold" style={{ color: obj.color }}>
                {obj.label}
              </Text>
            </View>

            <Text
              className="font-bold text-[15px] leading-5"
              style={{ color: managerColors.ink }}
              numberOfLines={2}
            >
              {campaign.name}
            </Text>

            <View className="flex-row items-center gap-1.5 flex-wrap">
              <View
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusColor(campaign.effective_status) }}
              />
              <Text className="text-[11px]" style={{ color: managerColors.muted }}>
                {statusLabel(campaign.effective_status)}
              </Text>
              {budget ? (
                <>
                  <Text style={{ color: managerColors.border }}>·</Text>
                  <Text className="text-[11px]" style={{ color: managerColors.muted }}>
                    {budget}/يوم
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          {/* Toggle */}
          <View className="justify-center">
            {canToggle ? (
              isToggling ? (
                <ActivityIndicator size="small" color={managerColors.brand} />
              ) : (
                <Switch
                  value={isActive}
                  onValueChange={(next) =>
                    onToggle(campaign.id, next ? "ACTIVE" : "PAUSED")
                  }
                  trackColor={{ false: managerColors.border, true: managerColors.brand }}
                  thumbColor="#fff"
                />
              )
            ) : null}
          </View>
        </View>

        {/* Date range row */}
        {(startedAgo || endsIn) && (
          <View className="flex-row items-center gap-2">
            <Ionicons name="calendar-outline" size={12} color={managerColors.muted} />
            <Text className="text-[11px] flex-1" style={{ color: managerColors.muted }}>
              {startedAgo ? `بدأت ${startedAgo}` : ""}
              {startedAgo && endsIn ? " · " : ""}
              {endsIn ? `تنتهي ${endsIn}` : ""}
            </Text>
          </View>
        )}

        {/* Insights row */}
        {insights ? (
          <View
            className="flex-row rounded-[12px] p-3 gap-0"
            style={{ backgroundColor: managerColors.surfaceTint }}
          >
            <MetricCell label="الإنفاق ٧ ايام" value={formatSpend(insights.spend)} />
            <Divider />
            <MetricCell
              label="الوصول"
              value={Number(insights.reach || 0).toLocaleString("ar")}
            />
            <Divider />
            <MetricCell
              label="النقرات"
              value={Number(insights.clicks || 0).toLocaleString("ar")}
            />
            <Divider />
            <MetricCell
              label="CTR"
              value={`${Number(insights.ctr || 0).toFixed(2)}%`}
            />
          </View>
        ) : (
          <Text className="text-[12px]" style={{ color: managerColors.muted }}>
            لا توجد بيانات للأسبوع الماضي
          </Text>
        )}

        {/* Lifetime spend footer */}
        {lifetimeInsights && Number(lifetimeInsights.spend) > 0 ? (
          <View className="flex-row items-center justify-between pt-1">
            <Text className="text-[11px]" style={{ color: managerColors.muted }}>
              الإنفاق الكلي
            </Text>
            <Text className="text-[12px] font-bold" style={{ color: managerColors.ink }}>
              {formatSpend(lifetimeInsights.spend)}
            </Text>
          </View>
        ) : null}
      </ManagerCard>
    </Pressable>
  );
}

// Overlay icon for video / carousel thumbnails. Absolutely positioned so the
// parent View just needs `overflow-hidden` + `relative` semantics (RN handles
// absolute children correctly without an explicit `position: relative`).
function PlayBadge() {
  return (
    <View
      className="absolute inset-0 items-center justify-center"
      pointerEvents="none"
    >
      <View
        className="rounded-full p-1.5"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      >
        <Ionicons name="play" size={14} color="#fff" />
      </View>
    </View>
  );
}

function CarouselBadge() {
  return (
    <View
      className="absolute top-1 right-1"
      pointerEvents="none"
    >
      <View
        className="rounded-full p-1"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      >
        <Ionicons name="copy" size={10} color="#fff" />
      </View>
    </View>
  );
}

function mediaKindLabel(kind: RecentPost["media_kind"]): string | null {
  switch (kind) {
    case "video":
      return "فيديو";
    case "carousel":
      return "مجموعة صور";
    case "text":
      return "نص";
    default:
      return null;
  }
}

function RecentPostCard({ post }: { post: RecentPost }) {
  const isIg = post.platform === "instagram";
  const platformColor = isIg ? "#E1306C" : "#1877F2";
  const platformIcon: keyof typeof Ionicons.glyphMap = isIg ? "logo-instagram" : "logo-facebook";
  const relative = relativeTimeAr(post.created_time) ?? "";
  const isVideo = post.media_kind === "video";
  const isCarousel = post.media_kind === "carousel";
  const kindLabel = mediaKindLabel(post.media_kind);

  return (
    <Pressable
      onPress={() => {
        if (post.permalink) Linking.openURL(post.permalink);
      }}
    >
      <ManagerCard className="gap-3">
        <View className="flex-row gap-3">
          {/* Image */}
          <View
            className="w-[64px] h-[64px] rounded-[10px] overflow-hidden items-center justify-center"
            style={{ backgroundColor: managerColors.surfaceTint }}
          >
            {post.image_url ? (
              <>
                <Image source={{ uri: post.image_url }} className="w-full h-full" resizeMode="cover" />
                {isVideo ? <PlayBadge /> : null}
                {isCarousel ? <CarouselBadge /> : null}
              </>
            ) : (
              <Ionicons
                name={isVideo ? "videocam-outline" : "document-text-outline"}
                size={24}
                color={managerColors.muted}
              />
            )}
          </View>

          {/* Content */}
          <View className="flex-1 gap-1">
            {/* Platform + media-kind badges + time */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <View
                  className="self-start flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${platformColor}1A` }}
                >
                  <Ionicons name={platformIcon} size={11} color={platformColor} />
                  <Text className="text-[10px] font-semibold" style={{ color: platformColor }}>
                    {isIg ? "Instagram" : "Facebook"}
                  </Text>
                </View>
                {kindLabel && post.media_kind !== "image" ? (
                  <View
                    className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: managerColors.surfaceTint }}
                  >
                    <Ionicons
                      name={
                        isVideo ? "play-circle" : isCarousel ? "copy" : "document-text-outline"
                      }
                      size={10}
                      color={managerColors.muted}
                    />
                    <Text className="text-[10px] font-semibold" style={{ color: managerColors.muted }}>
                      {kindLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-[10px]" style={{ color: managerColors.muted }}>
                {relative}
              </Text>
            </View>

            {/* Caption */}
            <Text
              className="text-[13px] leading-5"
              style={{ color: managerColors.ink }}
              numberOfLines={2}
            >
              {post.message?.trim() || "—"}
            </Text>

            {/* Engagement counters */}
            <View className="flex-row items-center gap-3 mt-0.5">
              <View className="flex-row items-center gap-1">
                <Ionicons name="heart-outline" size={12} color={managerColors.muted} />
                <Text className="text-[11px]" style={{ color: managerColors.muted }}>
                  {Number(post.like_count).toLocaleString("ar")}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Ionicons name="chatbubble-outline" size={12} color={managerColors.muted} />
                <Text className="text-[11px]" style={{ color: managerColors.muted }}>
                  {Number(post.comments_count).toLocaleString("ar")}
                </Text>
              </View>
              {!isIg && post.shares_count > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="arrow-redo-outline" size={12} color={managerColors.muted} />
                  <Text className="text-[11px]" style={{ color: managerColors.muted }}>
                    {Number(post.shares_count).toLocaleString("ar")}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ManagerCard>
    </Pressable>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-[11px]" style={{ color: managerColors.muted }}>
        {label}
      </Text>
      <Text className="font-bold text-[13px]" style={{ color: managerColors.ink }}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return (
    <View
      className="w-px mx-1 self-stretch"
      style={{ backgroundColor: managerColors.border }}
    />
  );
}

// ---- main screen -----------------------------------------------------------

export default function AdsScreen() {
  const params = useLocalSearchParams<{ platform?: string }>();
  const platform: Platform = params.platform === "facebook" ? "facebook" : "instagram";
  const theme = PLATFORM_THEME[platform];

  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const qc = useQueryClient();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  // Status query
  const statusQuery = useQuery({
    queryKey: qk.metaAdsStatus(restaurantId),
    enabled: !!restaurantId,
    queryFn: getMetaAdsStatus,
    staleTime: 60_000,
  });

  const status = statusQuery.data;

  // Ad accounts query — only when connected but no account selected
  const adAccountsQuery = useQuery({
    queryKey: qk.metaAdAccounts(restaurantId),
    enabled: !!restaurantId && status?.connected === true && !status.accountSelected,
    queryFn: listMetaAdAccounts,
  });

  // Campaigns query — only when an account is selected
  const campaignsQuery = useQuery({
    queryKey: qk.metaCampaigns(restaurantId),
    enabled: !!restaurantId && status?.accountSelected === true,
    queryFn: listMetaCampaigns,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Recent posts query — fetched once a Facebook Page is selected
  const recentPostsQuery = useQuery({
    queryKey: qk.metaRecentPosts(restaurantId),
    enabled: !!restaurantId && status?.pageSelected === true,
    queryFn: listMetaRecentPosts,
    staleTime: 60_000,
  });

  // Connect mutation (opens in-app browser)
  const connectMutation = useMutation({
    mutationFn: async () => {
      let url: string;
      try {
        const response = await getMetaAdsAuthUrl();
        url = response.url;
      } catch (err) {
        const e = err as Error & { status?: number; body?: unknown };
        throw new Error(
          JSON.stringify({
            reason: "meta-auth-url-fetch-failed",
            status: e.status ?? null,
            message: e.message,
            body:
              typeof e.body === "string"
                ? e.body.slice(0, 200)
                : e.body ?? null,
            apiBaseUrl: process.env.EXPO_PUBLIC_APP_BASE_URL ?? "(missing)",
          })
        );
      }
      captureMessage("Meta auth session starting", "info", {
        authUrlHost: (() => {
          try {
            return new URL(url).host;
          } catch {
            return "invalid-url";
          }
        })(),
        callbackUrl: META_CALLBACK_URL,
        apiBaseUrl: process.env.EXPO_PUBLIC_APP_BASE_URL ?? "(missing)",
      });
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        META_CALLBACK_URL
      );
      captureMessage("Meta auth session completed", "info", {
        resultType: result.type,
        returnedUrl: "url" in result ? result.url : null,
        callbackUrl: META_CALLBACK_URL,
      });
      if (result.type !== "success") {
        throw new Error(
          JSON.stringify({
            reason: "meta-auth-session-not-success",
            resultType: result.type,
            returnedUrl: "url" in result ? result.url : null,
            callbackUrl: META_CALLBACK_URL,
            apiBaseUrl: process.env.EXPO_PUBLIC_APP_BASE_URL ?? "(missing)",
          })
        );
      }
      // Regardless of deep-link params, refresh status to pick up new state
      return result;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.metaAdsStatus(restaurantId) });
      qc.invalidateQueries({ queryKey: qk.metaAdAccounts(restaurantId) });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "cancelled") return;
      captureException(err, { source: "meta-auth-connect" });
      let debug = "";
      try {
        const parsed = JSON.parse(message) as {
          reason?: string;
          status?: number | null;
          body?: unknown;
          message?: string;
          resultType?: string;
          returnedUrl?: string | null;
          callbackUrl?: string;
          apiBaseUrl?: string;
        };
        if (parsed.reason === "meta-auth-url-fetch-failed") {
          debug =
            `\n\nreason: ${parsed.reason}` +
            `\nstatus: ${parsed.status ?? "(missing)"}` +
            `\nmessage: ${parsed.message ?? "(missing)"}` +
            `\nbody: ${
              typeof parsed.body === "string"
                ? parsed.body
                : JSON.stringify(parsed.body ?? null)
            }` +
            `\nbaseUrl: ${parsed.apiBaseUrl ?? "(missing)"}`;
        } else {
          debug =
            `\n\nresult.type: ${parsed.resultType ?? "(missing)"}` +
            `\nreturnedUrl: ${parsed.returnedUrl ?? "(none)"}` +
            `\ncallback: ${parsed.callbackUrl ?? "(missing)"}` +
            `\nbaseUrl: ${parsed.apiBaseUrl ?? "(missing)"}`;
        }
      } catch {
        debug = `\n\n${message}`;
      }
      Alert.alert("خطأ", `فشل ربط حساب Meta. حاول مرة أخرى.${debug}`);
    },
  });

  // Select ad account mutation
  const selectAccountMutation = useMutation({
    mutationFn: (acc: MetaAdAccount) =>
      selectMetaAdAccount(acc.id, acc.name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.metaAdsStatus(restaurantId) });
      qc.invalidateQueries({ queryKey: qk.metaCampaigns(restaurantId) });
    },
    onError: () => Alert.alert("خطأ", "فشل اختيار الحساب. حاول مرة أخرى."),
  });

  // Toggle campaign status mutation
  const toggleMutation = useMutation({
    mutationFn: ({
      id,
      next,
    }: {
      id: string;
      next: "ACTIVE" | "PAUSED";
    }) => updateMetaCampaignStatus(id, next),
    onMutate: ({ id }) => setConnectingId(id),
    onSettled: () => {
      setConnectingId(null);
      qc.invalidateQueries({ queryKey: qk.metaCampaigns(restaurantId) });
    },
    onError: () => Alert.alert("خطأ", "فشل تحديث الحملة. حاول مرة أخرى."),
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: disconnectMetaAds,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.metaAdsStatus(restaurantId) });
      qc.invalidateQueries({ queryKey: qk.metaCampaigns(restaurantId) });
    },
  });

  function handleDisconnect() {
    Alert.alert(
      "فصل حساب Meta",
      "هل أنت متأكد من فصل حساب الإعلانات؟ ستحتاج إلى إعادة الربط لاحقًا.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "فصل",
          style: "destructive",
          onPress: () => disconnectMutation.mutate(),
        },
      ]
    );
  }

  function handleToggle(id: string, next: "ACTIVE" | "PAUSED") {
    const label = next === "PAUSED" ? "إيقاف" : "تفعيل";
    Alert.alert(`${label} الحملة`, `هل تريد ${label} هذه الحملة؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: label, onPress: () => toggleMutation.mutate({ id, next }) },
    ]);
  }

  const isRefreshing =
    statusQuery.isFetching ||
    campaignsQuery.isFetching ||
    adAccountsQuery.isFetching;

  function onRefresh() {
    qc.invalidateQueries({ queryKey: qk.metaAdsStatus(restaurantId) });
    qc.invalidateQueries({ queryKey: qk.metaCampaigns(restaurantId) });
    qc.invalidateQueries({ queryKey: qk.metaAdAccounts(restaurantId) });
  }

  // ---- render ----------------------------------------------------------------

  if (statusQuery.isPending) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: managerColors.bg }}
      >
        <ActivityIndicator size="large" color={managerColors.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b"
        style={{
          backgroundColor: managerColors.surface,
          borderBottomColor: managerColors.border,
          ...softShadow,
        }}
      >
        <View className="flex-row items-center gap-3 flex-1">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={managerColors.ink} />
          </Pressable>
          <Ionicons name={theme.icon} size={20} color={theme.color} />
          <Text className="text-[17px] font-bold" style={{ color: managerColors.ink }}>
            {theme.name}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          {status?.connected ? (
            <Pressable
              onPress={() =>
                router.push(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (`/(app)/campaigns/compose?platform=${platform}`) as any
                )
              }
              hitSlop={8}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: theme.color }}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text className="text-white font-semibold text-[13px]">منشور</Text>
            </Pressable>
          ) : null}
          {status?.connected ? (
            <Pressable onPress={handleDisconnect} hitSlop={8}>
              <Ionicons name="log-out-outline" size={22} color={managerColors.danger} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Not connected */}
      {!status?.connected ? (
        connectMutation.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={managerColors.brand} />
            <Text className="mt-4" style={{ color: managerColors.muted }}>
              جارٍ ربط حساب Meta…
            </Text>
          </View>
        ) : (
          <ConnectScreen platform={platform} onConnect={() => connectMutation.mutate()} />
        )
      ) : /* Connected, no account selected */
      !status.accountSelected ? (
        <AccountPickerScreen
          accounts={adAccountsQuery.data ?? []}
          isLoading={adAccountsQuery.isPending}
          onSelect={(acc) => selectAccountMutation.mutate(acc)}
        />
      ) : (
        /* Connected + account selected — campaign list */
        <ScrollView
          contentContainerClassName="p-4 gap-3 pb-10"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={managerColors.brand}
            />
          }
        >
          {/* Account chip */}
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center gap-2">
              <View
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "#22c55e" }}
              />
              <Text className="text-[13px] font-medium" style={{ color: managerColors.muted }}>
                {status.adAccountName ?? status.adAccountId}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                Alert.alert(
                  "تغيير الحساب",
                  "سيُعاد ربط حساب Meta لاختيار حساب إعلاني مختلف.",
                  [
                    { text: "إلغاء", style: "cancel" },
                    { text: "تغيير", onPress: () => connectMutation.mutate() },
                  ]
                )
              }
              hitSlop={8}
            >
              <Text className="text-[13px]" style={{ color: managerColors.brand }}>
                تغيير
              </Text>
            </Pressable>
          </View>

          {/* New campaign button */}
          <Pressable
            onPress={() =>
              router.push(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (`/(app)/campaigns/new-campaign?platform=${platform}`) as any
              )
            }
            className="flex-row items-center justify-center gap-2 rounded-[14px] py-3.5 mb-1"
            style={{ backgroundColor: theme.color }}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text className="text-white font-bold text-[15px]">إنشاء حملة جديدة</Text>
          </Pressable>

          {/* Campaigns */}
          {campaignsQuery.isPending ? (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color={managerColors.brand} />
            </View>
          ) : campaignsQuery.isError ? (
            <ManagerCard>
              <Text className="text-center" style={{ color: managerColors.danger }}>
                فشل تحميل الحملات. اسحب للأعلى للمحاولة مجددًا.
              </Text>
            </ManagerCard>
          ) : !campaignsQuery.data?.length ? (
            <View className="items-center py-16">
              <Ionicons name="megaphone-outline" size={44} color={managerColors.muted} />
              <Text
                className="mt-4 font-semibold text-[16px]"
                style={{ color: managerColors.ink }}
              >
                لا توجد حملات
              </Text>
              <Text className="mt-1 text-center" style={{ color: managerColors.muted }}>
                لم يتم العثور على حملات في هذا الحساب الإعلاني.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-[12px]" style={{ color: managerColors.muted }}>
                البيانات تمثل آخر 7 أيام
              </Text>
              {campaignsQuery.data.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onToggle={handleToggle}
                  isToggling={connectingId === campaign.id}
                />
              ))}
            </>
          )}

          {/* Recent posts section */}
          {status?.pageSelected ? (
            <View className="mt-6 gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-bold" style={{ color: managerColors.ink }}>
                  آخر المنشورات
                </Text>
                {recentPostsQuery.data?.length ? (
                  <Text className="text-[11px]" style={{ color: managerColors.muted }}>
                    {recentPostsQuery.data.length} منشور
                  </Text>
                ) : null}
              </View>

              {recentPostsQuery.isPending ? (
                <View className="items-center py-6">
                  <ActivityIndicator size="small" color={managerColors.brand} />
                </View>
              ) : recentPostsQuery.isError ? (
                <ManagerCard>
                  <Text className="text-center text-[12px]" style={{ color: managerColors.muted }}>
                    تعذّر تحميل المنشورات.
                  </Text>
                </ManagerCard>
              ) : !recentPostsQuery.data?.length ? (
                <ManagerCard className="items-center gap-2 py-6">
                  <Ionicons name="newspaper-outline" size={32} color={managerColors.muted} />
                  <Text className="text-[13px] text-center" style={{ color: managerColors.muted }}>
                    لا توجد منشورات بعد. أنشئ منشورًا جديدًا من زر "منشور" في الأعلى.
                  </Text>
                </ManagerCard>
              ) : (
                recentPostsQuery.data.map((post) => (
                  <RecentPostCard key={`${post.platform}-${post.id}`} post={post} />
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
