import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Text, TextClassContext } from "./text";
import { useTheme, type ThemeToken } from "./theme";

const badgeVariants = cva("flex-row items-center gap-1.5 self-start rounded-full px-3 py-1", {
  variants: {
    variant: {
      default: "bg-secondary",
      outline: "border border-border bg-transparent",
      success: "bg-success-soft",
      warning: "bg-warning-soft",
      destructive: "bg-destructive-soft",
      accent: "bg-accent",
      muted: "bg-muted",
    },
  },
  defaultVariants: { variant: "default" },
});

const tone: Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, { text: string; token: ThemeToken }> = {
  default: { text: "text-secondary-foreground", token: "secondary-foreground" },
  outline: { text: "text-foreground", token: "foreground" },
  success: { text: "text-success", token: "success" },
  warning: { text: "text-warning", token: "warning" },
  destructive: { text: "text-destructive", token: "destructive" },
  accent: { text: "text-accent-foreground", token: "accent-foreground" },
  muted: { text: "text-muted-foreground", token: "muted-foreground" },
};

/** Status chip. Always pair colour with words (and optionally an icon). */
export function Badge({ variant = "default", label, icon, dot = false, className }: VariantProps<typeof badgeVariants> & { label: string; icon?: ComponentProps<typeof Ionicons>["name"]; dot?: boolean; className?: string }) {
  const { color } = useTheme();
  const t = tone[variant ?? "default"];
  return (
    <TextClassContext.Provider value={cn("text-xs font-bold", t.text)}>
      <View className={cn(badgeVariants({ variant }), className)}>
        {dot ? <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color(t.token) }} /> : null}
        {icon ? <Ionicons name={icon} size={13} color={color(t.token)} /> : null}
        <Text>{label}</Text>
      </View>
    </TextClassContext.Provider>
  );
}
