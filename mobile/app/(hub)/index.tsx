import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, SafeAreaView, View } from "../../components/tw";
import { getHubStatus } from "../../lib/hub-api";
import { getApiErrorMessage } from "../../lib/api";
import { managerColors } from "../../components/manager-ui";
import { ErrorState } from "../../components/list-state";

/**
 * Hub entry point. Decides whether the merchant still needs to pair their
 * Nehgz Hub account, or can go straight into the Hub tabs.
 */
export default function HubIndex() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hub", "status"],
    queryFn: getHubStatus,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: managerColors.bg }}
      >
        <ActivityIndicator color={managerColors.brand} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
        <View className="flex-1 items-center justify-center">
          <ErrorState
            title="تعذّر الاتصال بنِحجز هَب"
            description={getApiErrorMessage(
              error,
              "تحقّق من الاتصال ثم حاول مرة أخرى."
            )}
            onRetry={refetch}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Redirect href={data?.paired ? "/(hub)/(tabs)/dashboard" : "/(hub)/pair"} />
  );
}
