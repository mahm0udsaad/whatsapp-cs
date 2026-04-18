import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const managerColors = {
  bg: "#F4F3EF",
  surface: "#FFFDF8",
  surfaceMuted: "#F8F7F2",
  ink: "#151515",
  muted: "#6B6A63",
  border: "#E5E1D8",
  brand: "#128C5B",
  brandDark: "#0B3D2E",
  bot: "#34308A",
  danger: "#B42318",
  warning: "#A15C07",
};

export const premiumShadow = {
  boxShadow: "0 10px 24px rgba(21, 21, 21, 0.07)",
} as const;

const toneClasses: Record<Tone, { card: string; text: string; icon: string }> = {
  neutral: {
    card: "border-stone-200 bg-[#FFFDF8]",
    text: "text-[#151515]",
    icon: managerColors.muted,
  },
  success: {
    card: "border-emerald-100 bg-emerald-50",
    text: "text-emerald-950",
    icon: managerColors.brand,
  },
  warning: {
    card: "border-amber-200 bg-amber-50",
    text: "text-amber-900",
    icon: managerColors.warning,
  },
  danger: {
    card: "border-red-200 bg-red-50",
    text: "text-red-900",
    icon: managerColors.danger,
  },
  info: {
    card: "border-indigo-100 bg-indigo-50",
    text: "text-indigo-950",
    icon: managerColors.bot,
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
    <View
      className={`rounded-lg border border-stone-200 bg-[#FFFDF8] p-4 ${className}`}
      style={premiumShadow}
    >
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
      className={`flex-1 rounded-lg border ${classes.card} ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <Text className={`text-right font-bold ${compact ? "text-xl" : "text-3xl"} ${classes.text}`}>
        {value}
      </Text>
      <Text
        className="mt-1 text-right text-xs font-medium text-stone-600"
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
      className={`flex-row-reverse items-center gap-3 rounded-lg border p-3 ${classes.card}`}
      style={tone === "danger" ? premiumShadow : undefined}
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-white/80">
        <Ionicons name={icon} size={21} color={classes.icon} />
      </View>
      <View className="flex-1">
        <Text className={`text-right text-sm font-bold ${classes.text}`}>
          {title}
        </Text>
        <Text className="mt-0.5 text-right text-xs leading-5 text-stone-600">
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
    <View className={`rounded-lg border px-2.5 py-1 ${classes.card}`}>
      <Text className={`text-xs font-semibold ${classes.text}`}>{label}</Text>
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onActionPress,
}: {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  return (
    <View className="flex-row-reverse items-center justify-between">
      <Text className="text-right text-base font-bold text-[#151515]">{title}</Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <Text className="text-sm font-semibold text-[#128C5B]">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <View className={`bg-stone-200/80 ${className}`} />;
}

export function CardSkeleton({
  rows = 2,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <View className={`rounded-lg border border-stone-200 bg-[#FFFDF8] p-4 ${className}`}>
      <View className="items-end gap-2">
        <SkeletonBlock className="h-4 w-32 rounded-lg" />
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBlock
            key={index}
            className={`h-3 rounded-lg ${index % 2 === 0 ? "w-52" : "w-40"}`}
          />
        ))}
      </View>
    </View>
  );
}

export function ListSkeleton({
  count = 5,
  showAvatar = false,
}: {
  count?: number;
  showAvatar?: boolean;
}) {
  return (
    <View className="px-4 py-4">
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          className="mb-2 flex-row-reverse items-center gap-3 rounded-lg border border-stone-200 bg-[#FFFDF8] p-4"
        >
          {showAvatar ? <SkeletonBlock className="h-11 w-11 rounded-full" /> : null}
          <View className="flex-1 items-end gap-2">
            <SkeletonBlock className="h-4 w-36 rounded-lg" />
            <SkeletonBlock className="h-3 w-52 rounded-lg" />
            {index % 2 === 0 ? (
              <SkeletonBlock className="h-3 w-28 rounded-lg" />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View className="gap-3 p-4">
      <View className="rounded-lg bg-gray-950 p-5">
        <View className="flex-row-reverse items-start justify-between gap-4">
          <View className="flex-1 items-end gap-3">
            <SkeletonBlock className="h-3 w-24 rounded-lg bg-gray-700" />
            <SkeletonBlock className="h-6 w-44 rounded-lg bg-gray-700" />
            <SkeletonBlock className="h-4 w-56 rounded-lg bg-gray-700" />
          </View>
          <SkeletonBlock className="h-20 w-20 rounded-lg bg-gray-700" />
        </View>
        <View className="mt-5 flex-row-reverse gap-2">
          <SkeletonBlock className="h-11 flex-1 rounded-lg bg-gray-700" />
          <SkeletonBlock className="h-11 flex-1 rounded-lg bg-gray-700" />
        </View>
      </View>
      <CardSkeleton rows={3} />
      <CardSkeleton rows={4} />
      <CardSkeleton rows={2} />
    </View>
  );
}
