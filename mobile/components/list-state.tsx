import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { managerColors } from "./manager-ui";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  description,
}: EmptyStateProps) {
  return (
    <View className="items-center px-8 py-20">
      <View className="h-14 w-14 items-center justify-center rounded-lg bg-[#F1F5F3]">
        <Ionicons name={icon} size={26} color={managerColors.brand} />
      </View>
      <Text className="mt-4 text-center text-base font-bold text-gray-950">
        {title}
      </Text>
      {description ? (
        <Text className="mt-1 text-center text-sm leading-6 text-gray-500">
          {description}
        </Text>
      ) : null}
    </View>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "تعذّر تحميل البيانات",
  description = "تحققي من الاتصال ثم حاولي مرة أخرى.",
  onRetry,
  retryLabel = "إعادة المحاولة",
}: ErrorStateProps) {
  return (
    <View className="items-center px-8 py-20">
      <View className="h-14 w-14 items-center justify-center rounded-lg bg-red-50">
        <Ionicons
          name="cloud-offline-outline"
          size={26}
          color={managerColors.danger}
        />
      </View>
      <Text className="mt-4 text-center text-base font-bold text-gray-950">
        {title}
      </Text>
      <Text className="mt-1 text-center text-sm leading-6 text-gray-500">
        {description}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="mt-4 rounded-lg bg-[#052E26] px-5 py-2.5"
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text className="text-sm font-bold text-white">{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
