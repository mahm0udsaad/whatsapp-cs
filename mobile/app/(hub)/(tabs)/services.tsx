import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, RefreshControl } from "react-native";
import { Pressable, Text, View } from "../../../components/tw";
import {
  deleteHubService,
  listHubServices,
  updateHubService,
  type HubService,
} from "../../../lib/hub-api";
import { getApiErrorMessage } from "../../../lib/api";
import { localized } from "../../../lib/hub-format";
import { useHubRepairGuard } from "../../../hooks/use-hub";
import {
  ListSkeleton,
  StatusPill,
  managerColors,
  softShadow,
} from "../../../components/manager-ui";
import { EmptyState, ErrorState } from "../../../components/list-state";

export default function HubServicesScreen() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["hub", "services"],
    queryFn: () => listHubServices(),
  });
  useHubRepairGuard(query.error);

  const toggle = useMutation({
    mutationFn: (svc: HubService) =>
      updateHubService(svc.id, { status: !svc.status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["hub", "services"] }),
    onError: (e) => Alert.alert("تعذّر التحديث", getApiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteHubService(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["hub", "services"] }),
    onError: (e) => Alert.alert("تعذّر الحذف", getApiErrorMessage(e)),
  });

  function confirmRemove(svc: HubService) {
    Alert.alert(
      "حذف الخدمة",
      `هل تريد حذف "${localized(svc.title) || "الخدمة"}"؟`,
      [
        { text: "تراجع", style: "cancel" },
        { text: "حذف", style: "destructive", onPress: () => remove.mutate(svc.id) },
      ]
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={query.refetch}
            tintColor={managerColors.brand}
          />
        }
        ListEmptyComponent={
          query.isLoading ? (
            <ListSkeleton count={5} />
          ) : query.isError ? (
            <ErrorState onRetry={query.refetch} />
          ) : (
            <EmptyState
              icon="pricetags-outline"
              title="لا توجد خدمات"
              description="أضف خدمات من لوحة تحكم نِحجز."
            />
          )
        }
        renderItem={({ item }) => (
          <View
            className="rounded-[20px] border bg-white p-4"
            style={[{ borderColor: managerColors.border }, softShadow]}
          >
            <View className="flex-row-reverse items-center justify-between">
              <Text
                className="flex-1 text-right text-base font-bold"
                style={{ color: managerColors.ink }}
                numberOfLines={1}
              >
                {localized(item.title) || `خدمة #${item.id}`}
              </Text>
              <StatusPill
                label={item.status ? "مُفعّلة" : "متوقفة"}
                tone={item.status ? "success" : "neutral"}
              />
            </View>
            <Text
              className="mt-1 text-right text-xs"
              style={{ color: managerColors.muted }}
            >
              {typeof item.price === "number" ? `${item.price} ر.س` : ""}
              {typeof item.duration_minutes === "number"
                ? `  ·  ${item.duration_minutes} دقيقة`
                : ""}
            </Text>
            <View className="mt-3 flex-row-reverse gap-2">
              <Pressable
                onPress={() => toggle.mutate(item)}
                disabled={toggle.isPending}
                className="rounded-lg border px-3 py-1.5"
                style={{ borderColor: managerColors.border }}
              >
                <Text className="text-xs font-semibold" style={{ color: managerColors.brand }}>
                  {item.status ? "إيقاف" : "تفعيل"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => confirmRemove(item)}
                disabled={remove.isPending}
                className="rounded-lg border px-3 py-1.5"
                style={{ borderColor: managerColors.danger }}
              >
                <Text className="text-xs font-semibold" style={{ color: managerColors.danger }}>
                  حذف
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
