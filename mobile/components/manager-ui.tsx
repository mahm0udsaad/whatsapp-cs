import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, { card: string; text: string; icon: string }> = {
  neutral: {
    card: "border-gray-100 bg-white",
    text: "text-gray-950",
    icon: "#374151",
  },
  success: {
    card: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-900",
    icon: "#047857",
  },
  warning: {
    card: "border-amber-200 bg-amber-50",
    text: "text-amber-900",
    icon: "#B45309",
  },
  danger: {
    card: "border-red-200 bg-red-50",
    text: "text-red-900",
    icon: "#B91C1C",
  },
  info: {
    card: "border-indigo-200 bg-indigo-50",
    text: "text-indigo-900",
    icon: "#3730A3",
  },
};

export function ManagerCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`rounded-2xl border border-gray-100 bg-white p-4 ${className}`}>
      {children}
    </View>
  );
}

export function ManagerMetric({
  label,
  value,
  tone = "neutral",
  compact = false,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  compact?: boolean;
}) {
  const classes = toneClasses[tone];
  return (
    <View
      className={`flex-1 rounded-xl border ${classes.card} ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <Text className={`text-right font-bold ${compact ? "text-xl" : "text-3xl"} ${classes.text}`}>
        {value}
      </Text>
      <Text
        className="mt-1 text-right text-xs font-medium text-gray-600"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

export function PriorityAction({
  title,
  description,
  value,
  tone,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  value: number;
  tone: Exclude<Tone, "neutral">;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const classes = toneClasses[tone];
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row-reverse items-center gap-3 rounded-xl border p-3 ${classes.card}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
        <Ionicons name={icon} size={21} color={classes.icon} />
      </View>
      <View className="flex-1">
        <Text className={`text-right text-sm font-bold ${classes.text}`}>
          {title}
        </Text>
        <Text className="mt-0.5 text-right text-xs leading-5 text-gray-600">
          {description}
        </Text>
      </View>
      <Text className={`text-2xl font-bold ${classes.text}`}>{value}</Text>
    </Pressable>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  const classes = toneClasses[tone];
  return (
    <View className={`rounded-full border px-2.5 py-1 ${classes.card}`}>
      <Text className={`text-xs font-semibold ${classes.text}`}>{label}</Text>
    </View>
  );
}
