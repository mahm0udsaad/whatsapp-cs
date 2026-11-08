import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./text";
import type { ComponentProps } from "react";

type P = ViewProps & { className?: string };

export function Card({ className, style, ...props }: P) {
  return <View className={cn("gap-4 rounded-3xl border border-border bg-card p-5", className)} style={[{ borderCurve: "continuous" }, style]} {...props} />;
}
export function CardHeader({ className, ...props }: P) {
  return <View className={cn("gap-1", className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<typeof Text>) {
  return <Text variant="h3" accessibilityRole="header" className={className} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<typeof Text>) {
  return <Text variant="muted" className={className} {...props} />;
}
export function CardContent({ className, ...props }: P) {
  return <View className={cn("gap-3", className)} {...props} />;
}
export function CardFooter({ className, ...props }: P) {
  return <View className={cn("flex-row items-center gap-3", className)} {...props} />;
}
