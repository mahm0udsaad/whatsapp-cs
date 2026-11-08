import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Text, TextClassContext } from "./text";
import { useTheme, type ThemeToken } from "./theme";

export const buttonVariants = cva("flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80", {
  variants: {
    variant: {
      default: "bg-primary",
      secondary: "bg-secondary",
      outline: "border border-border bg-card",
      ghost: "bg-transparent",
      accent: "bg-accent",
      destructive: "bg-destructive",
      "destructive-outline": "border border-destructive/30 bg-destructive-soft",
    },
    size: {
      default: "min-h-[52px] px-5 py-3",
      lg: "min-h-[58px] px-6 py-4",
      sm: "min-h-[44px] rounded-xl px-4 py-2",
      icon: "h-12 w-12 rounded-2xl",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

const textByVariant = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  outline: "text-foreground",
  ghost: "text-primary",
  accent: "text-accent-foreground",
  destructive: "text-card",
  "destructive-outline": "text-destructive",
} as const;

const iconByVariant: Record<keyof typeof textByVariant, ThemeToken> = {
  default: "primary-foreground",
  secondary: "secondary-foreground",
  outline: "foreground",
  ghost: "primary",
  accent: "accent-foreground",
  destructive: "card",
  "destructive-outline": "destructive",
};

type IconName = ComponentProps<typeof Ionicons>["name"];

export type ButtonProps = Omit<PressableProps, "children"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    children?: ReactNode;
    /** Shown before the label. */
    icon?: IconName;
    /** Shown after the label (e.g. a direction-aware arrow). */
    iconEnd?: IconName;
    loading?: boolean;
    /** Required when the button only shows an icon. */
    accessibilityLabel?: string;
  };

export function Button({ className, variant = "default", size, children, icon, iconEnd, loading = false, disabled, accessibilityLabel, ...props }: ButtonProps) {
  const { color } = useTheme();
  const v = variant ?? "default";
  const iconColor = color(iconByVariant[v]);
  const label = accessibilityLabel ?? (typeof children === "string" ? children : undefined);
  return (
    <TextClassContext.Provider value={cn("text-base font-bold", textByVariant[v])}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled || loading, busy: loading }}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), (disabled || loading) && "opacity-50", className)}
        {...props}
      >
        {loading ? <ActivityIndicator color={iconColor} /> : icon ? <Ionicons name={icon} size={size === "icon" ? 22 : 20} color={iconColor} /> : null}
        {typeof children === "string" ? <Text align="center" className="shrink">{children}</Text> : children}
        {iconEnd && !loading ? <Ionicons name={iconEnd} size={20} color={iconColor} /> : null}
      </Pressable>
    </TextClassContext.Provider>
  );
}
