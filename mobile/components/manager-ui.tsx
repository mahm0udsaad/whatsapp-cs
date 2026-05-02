import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const managerColors = {
  bg: "#EFF3FF",
  surface: "#FCFEFC",
  surfaceMuted: "#F5F7FF",
  surfaceTint: "#E8EEFF",
  ink: "#16245C",
  muted: "#5E6A99",
  border: "#D6DDF8",
  brand: "#273B9A",
  brandDark: "#1A2A78",
  brandSoft: "#E2E8FF",
  bot: "#FFC928",
  danger: "#E11D48",
  warning: "#C98500",
};

export const premiumShadow = {
  boxShadow: "0 18px 40px rgba(39, 59, 154, 0.14)",
} as const;

export const softShadow = {
  boxShadow: "0 10px 24px rgba(39, 59, 154, 0.08)",
} as const;

const toneClasses: Record<Tone, { card: string; text: string; icon: string }> = {
  neutral: {
    card: "border-[#D6DDF8] bg-[#FCFEFC]",
    text: "text-[#16245C]",
    icon: managerColors.muted,
  },
  success: {
    card: "border-[#D6DDF8] bg-[#EDF2FF]",
    text: "text-[#1A2A78]",
    icon: managerColors.brand,
  },
  warning: {
    card: "border-[#F4D774] bg-[#FFF7D8]",
    text: "text-[#8A5E00]",
    icon: managerColors.warning,
  },
  danger: {
    card: "border-red-200 bg-red-50",
    text: "text-red-900",
    icon: managerColors.danger,
  },
  info: {
    card: "border-[#F4D774] bg-[#FFF7D8]",
    text: "text-[#8A5E00]",
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
      className={`rounded-[24px] border border-[#D6DDF8] bg-[#FCFEFC] p-4 ${className}`}
      style={softShadow}
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
      className={`flex-1 rounded-[18px] border ${classes.card} ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <Text className={`text-right font-bold ${compact ? "text-xl" : "text-3xl"} ${classes.text}`}>
        {value}
      </Text>
      <Text
        className="mt-1 text-right text-xs font-medium text-[#5E6A99]"
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
      className={`flex-row-reverse items-center gap-3 rounded-[20px] border p-3.5 ${classes.card}`}
      style={tone === "danger" ? premiumShadow : undefined}
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/90">
        <Ionicons name={icon} size={21} color={classes.icon} />
      </View>
      <View className="flex-1">
        <Text className={`text-right text-sm font-bold ${classes.text}`}>
          {title}
        </Text>
        <Text className="mt-0.5 text-right text-xs leading-5 text-[#5E6A99]">
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
      <Text className="text-right text-base font-bold text-[#16245C]">{title}</Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <Text className="text-sm font-semibold text-[#273B9A]">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <View className={`bg-slate-200/80 ${className}`} />;
}

export function CardSkeleton({
  rows = 2,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <View className={`rounded-[24px] border border-[#D6DDF8] bg-[#FCFEFC] p-4 ${className}`}>
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
          className="mb-2 flex-row-reverse items-center gap-3 rounded-[20px] border border-[#D6DDF8] bg-[#FCFEFC] p-4"
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
      <View className="rounded-[28px] bg-[#1A2A78] p-5">
        <View className="flex-row-reverse items-start justify-between gap-4">
          <View className="flex-1 items-end gap-3">
            <SkeletonBlock className="h-3 w-24 rounded-lg bg-[#4157B4]" />
            <SkeletonBlock className="h-6 w-44 rounded-lg bg-[#4157B4]" />
            <SkeletonBlock className="h-4 w-56 rounded-lg bg-[#4157B4]" />
          </View>
          <SkeletonBlock className="h-20 w-20 rounded-[20px] bg-[#4157B4]" />
        </View>
        <View className="mt-5 flex-row-reverse gap-2">
          <SkeletonBlock className="h-11 flex-1 rounded-[18px] bg-[#4157B4]" />
          <SkeletonBlock className="h-11 flex-1 rounded-[18px] bg-[#4157B4]" />
        </View>
      </View>
      <CardSkeleton rows={3} />
      <CardSkeleton rows={4} />
      <CardSkeleton rows={2} />
    </View>
  );
}
