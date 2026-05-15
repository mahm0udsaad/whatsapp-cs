import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  selectMetaAdAccount,
  updateMetaCampaignStatus,
  type MetaAdAccount,
  type MetaCampaign,
} from "../../../lib/api";
import { captureException, captureMessage } from "../../../lib/observability";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { ManagerCard, managerColors, softShadow } from "../../../components/manager-ui";

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
  const isActive = campaign.status === "ACTIVE";
  const canToggle =
    campaign.effective_status !== "DELETED" &&
    campaign.effective_status !== "ARCHIVED";
  const budget = formatBudget(campaign.daily_budget, campaign.lifetime_budget);

  return (
    <ManagerCard className="gap-3">
      {/* Header row */}
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text
            className="font-bold text-[15px] leading-5"
            style={{ color: managerColors.ink }}
            numberOfLines={2}
          >
            {campaign.name}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <View
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: statusColor(campaign.effective_status) }}
            />
            <Text className="text-[12px]" style={{ color: managerColors.muted }}>
              {statusLabel(campaign.effective_status)}
            </Text>
            {budget ? (
              <>
                <Text style={{ color: managerColors.border }}>·</Text>
                <Text className="text-[12px]" style={{ color: managerColors.muted }}>
                  {budget} / يوم
                </Text>
              </>
            ) : null}
          </View>
        </View>

        {canToggle ? (
          isToggling ? (
            <ActivityIndicator size="small" color={managerColors.brand} />
          ) : (
            <Switch
              value={isActive}
              onValueChange={(next) =>
                onToggle(campaign.id, next ? "ACTIVE" : "PAUSED")
              }
              trackColor={{
                false: managerColors.border,
                true: managerColors.brand,
              }}
              thumbColor="#fff"
            />
          )
        ) : null}
      </View>

      {/* Insights row */}
      {insights ? (
        <View
          className="flex-row rounded-[12px] p-3 gap-0"
          style={{ backgroundColor: managerColors.surfaceTint }}
        >
          <MetricCell label="الإنفاق" value={formatSpend(insights.spend)} />
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
    </ManagerCard>
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

  // Connect mutation (opens in-app browser)
  const connectMutation = useMutation({
    mutationFn: async () => {
      const { url } = await getMetaAdsAuthUrl();
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
          resultType?: string;
          returnedUrl?: string | null;
          callbackUrl?: string;
          apiBaseUrl?: string;
        };
        debug =
          `\n\nresult.type: ${parsed.resultType ?? "(missing)"}` +
          `\nreturnedUrl: ${parsed.returnedUrl ?? "(none)"}` +
          `\ncallback: ${parsed.callbackUrl ?? "(missing)"}` +
          `\nbaseUrl: ${parsed.apiBaseUrl ?? "(missing)"}`;
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
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
