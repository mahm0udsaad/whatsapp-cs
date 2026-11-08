import { Children, isValidElement, useState, type ComponentProps, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Switch as RNSwitch, View, type ViewProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Text } from "./text";
import { useTheme, type ThemeToken } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Separator({ className }: { className?: string }) {
  return <View className={cn("h-px w-full bg-border", className)} />;
}

/** Linear progress, value 0–1. */
export function Progress({ value, className, indicatorClassName, accessibilityLabel }: { value: number; className?: string; indicatorClassName?: string; accessibilityLabel?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: pct }} className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <View className={cn("h-full rounded-full bg-primary", indicatorClassName)} style={{ width: `${pct}%` }} />
    </View>
  );
}

const iconTileVariants = cva("items-center justify-center", {
  variants: {
    variant: {
      default: "bg-secondary",
      primary: "bg-primary",
      success: "bg-success-soft",
      warning: "bg-warning-soft",
      destructive: "bg-destructive-soft",
      accent: "bg-accent",
      muted: "bg-muted",
    },
    size: { sm: "h-10 w-10 rounded-xl", md: "h-12 w-12 rounded-2xl", lg: "h-20 w-20 rounded-[28px]", xl: "h-24 w-24 rounded-[32px]" },
  },
  defaultVariants: { variant: "default", size: "md" },
});
const iconTone: Record<NonNullable<VariantProps<typeof iconTileVariants>["variant"]>, ThemeToken> = {
  default: "secondary-foreground", primary: "primary-foreground", success: "success", warning: "warning", destructive: "destructive", accent: "accent-foreground", muted: "muted-foreground",
};
const iconSize = { sm: 20, md: 24, lg: 36, xl: 44 } as const;

/** Rounded square holding an icon; the "avatar" for rows and hero states. */
export function IconTile({ name, variant = "default", size = "md", className }: VariantProps<typeof iconTileVariants> & { name: IconName; className?: string }) {
  const { color } = useTheme();
  return (
    <View className={cn(iconTileVariants({ variant, size }), className)} style={{ borderCurve: "continuous" }}>
      <Ionicons name={name} size={iconSize[size ?? "md"]} color={color(iconTone[variant ?? "default"])} />
    </View>
  );
}

/** shadcn Tabs (list + triggers) as a segmented control. */
export function SegmentedControl<T extends string>({ value, onChange, options, className, testIDPrefix }: { value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[]; className?: string; testIDPrefix?: string }) {
  return (
    <View accessibilityRole="tablist" className={cn("flex-row gap-1 rounded-2xl bg-muted p-1", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className={cn("min-h-[44px] flex-1 items-center justify-center rounded-xl px-2", selected && "bg-card")}
            style={selected ? { boxShadow: "0 1px 3px rgba(15, 26, 61, 0.12)" } : undefined}
          >
            <Text align="center" className={cn("text-sm font-semibold", selected ? "text-foreground" : "text-muted-foreground")}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const alertVariants = cva("flex-row gap-3 rounded-2xl border p-4", {
  variants: {
    variant: {
      default: "border-border bg-card",
      info: "border-primary/15 bg-secondary",
      success: "border-success/20 bg-success-soft",
      warning: "border-warning/25 bg-warning-soft",
      destructive: "border-destructive/25 bg-destructive-soft",
    },
  },
  defaultVariants: { variant: "default" },
});
const alertTone: Record<NonNullable<VariantProps<typeof alertVariants>["variant"]>, ThemeToken> = {
  default: "foreground", info: "primary", success: "success", warning: "warning", destructive: "destructive",
};
const alertIcon: Record<NonNullable<VariantProps<typeof alertVariants>["variant"]>, IconName> = {
  default: "information-circle-outline", info: "information-circle-outline", success: "checkmark-circle-outline", warning: "warning-outline", destructive: "alert-circle-outline",
};

export function Alert({ variant = "default", title, description, icon, children, className }: VariantProps<typeof alertVariants> & { title: string; description?: string; icon?: IconName; children?: ReactNode; className?: string }) {
  const { color } = useTheme();
  const v = variant ?? "default";
  return (
    <View accessibilityRole="alert" className={cn(alertVariants({ variant }), className)}>
      <Ionicons name={icon ?? alertIcon[v]} size={22} color={color(alertTone[v])} />
      <View className="flex-1 gap-1">
        <Text className="text-[15px] font-bold leading-6" style={{ color: color(alertTone[v]) }}>{title}</Text>
        {description ? <Text variant="muted" className="text-foreground/80">{description}</Text> : null}
        {children}
      </View>
    </View>
  );
}

/** Grouped settings-style list (iOS inset grouped look). */
export function List({ children, className, ...props }: ViewProps & { className?: string }) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn("overflow-hidden rounded-3xl border border-border bg-card", className)} style={{ borderCurve: "continuous" }} {...props}>
      {items.map((child, i) => (
        <View key={child.key ?? i}>
          {i > 0 ? <View className="ms-16 h-px bg-border" /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListItem({ icon, iconVariant = "default", title, subtitle, trailing, onPress, chevron = !!onPress, testID, destructive = false }: {
  icon?: IconName;
  iconVariant?: VariantProps<typeof iconTileVariants>["variant"];
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  testID?: string;
  destructive?: boolean;
}) {
  const { color, forwardIcon } = useTheme();
  const body = (
    <View className="min-h-[60px] flex-row items-center gap-3 px-4 py-3">
      {icon ? <IconTile name={icon} variant={destructive ? "destructive" : iconVariant} size="sm" /> : null}
      <View className="flex-1 gap-0.5">
        <Text className={cn("text-[15px] font-semibold leading-6", destructive && "text-destructive")}>{title}</Text>
        {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
      </View>
      {trailing}
      {chevron ? <Ionicons name={forwardIcon} size={18} color={color("muted-foreground")} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}، ${subtitle}` : title} onPress={onPress} className="active:bg-muted">{body}</Pressable>;
}

export function Switch({ value, onValueChange, accessibilityLabel, testID }: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel: string; testID?: string }) {
  const { color } = useTheme();
  return <RNSwitch testID={testID} accessibilityLabel={accessibilityLabel} value={value} onValueChange={onValueChange} trackColor={{ true: color("primary"), false: color("input") }} thumbColor="#FFFFFF" ios_backgroundColor={color("input")} />;
}

/** Collapsible FAQ row (shadcn Accordion item). */
export function AccordionItem({ title, children, icon, defaultOpen = false, testID }: { title: string; children: ReactNode; icon?: IconName; defaultOpen?: boolean; testID?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const { color } = useTheme();
  return (
    <View>
      <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[60px] flex-row items-center gap-3 px-4 py-3 active:bg-muted">
        {icon ? <IconTile name={icon} size="sm" /> : null}
        <Text className="flex-1 text-[15px] font-semibold leading-6">{title}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={color("muted-foreground")} />
      </Pressable>
      {open ? <View className={cn("px-4 pb-4", icon && "ps-[68px]")}>{typeof children === "string" ? <Text variant="muted">{children}</Text> : children}</View> : null}
    </View>
  );
}

/** Bottom sheet (shadcn Sheet, side="bottom"). Content scrolls if tall. */
export function Sheet({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { color } = useTheme();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(5, 10, 30, 0.45)" }} />
      <View className="max-h-[85%] rounded-t-[28px] border-t border-border bg-card" style={{ paddingBottom: insets.bottom + 12 }}>
        <View className="items-center pt-3"><View className="h-1.5 w-10 rounded-full bg-border" /></View>
        <View className="flex-row items-start gap-3 px-5 pb-2 pt-3">
          <View className="flex-1 gap-1">
            <Text variant="h3">{title}</Text>
            {description ? <Text variant="muted">{description}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Ionicons name="close" size={20} color={color("foreground")} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}
