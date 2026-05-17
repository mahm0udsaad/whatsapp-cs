import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={26} color={managerColors.brand} />
      </View>
      <Text style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text style={styles.description}>
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
  description = "تحقق من الاتصال ثم حاول مرة أخرى.",
  onRetry,
  retryLabel = "إعادة المحاولة",
}: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.errorIconWrap}>
        <Ionicons
          name="cloud-offline-outline"
          size={26}
          color={managerColors.danger}
        />
      </View>
      <Text style={styles.title}>
        {title}
      </Text>
      <Text style={styles.description}>
        {description}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text style={styles.retryButtonText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  iconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: managerColors.brandSoft,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  title: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#030712",
  },
  description: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 24,
    color: "#6B7280",
  },
  retryButton: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: managerColors.brandDark,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
