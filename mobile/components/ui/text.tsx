import { createContext, useContext } from "react";
import { Text as RNText, type TextProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { useTheme } from "./theme";

export const textVariants = cva("text-foreground", {
  variants: {
    variant: {
      default: "text-base leading-6",
      display: "text-[44px] font-extrabold leading-[52px]",
      h1: "text-[28px] font-extrabold leading-[38px]",
      h2: "text-[22px] font-bold leading-[30px]",
      h3: "text-lg font-bold leading-7",
      large: "text-lg font-semibold leading-7",
      lead: "text-base leading-6 text-muted-foreground",
      small: "text-sm font-medium leading-5",
      muted: "text-sm leading-5 text-muted-foreground",
      caption: "text-xs leading-4 text-muted-foreground",
      label: "text-xs font-semibold uppercase leading-4 tracking-wide text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

/** Lets a parent (Button, Badge) style nested Text, like shadcn's TextClassContext. */
export const TextClassContext = createContext<string | undefined>(undefined);

export type TextVariantProps = VariantProps<typeof textVariants>;

export function Text({ className, variant, align, style, ...props }: TextProps & TextVariantProps & { className?: string; align?: "start" | "center" | "end" }) {
  const inherited = useContext(TextClassContext);
  const { start, dir } = useTheme();
  const textAlign = align === "center" ? "center" : align === "end" ? "right" : start;
  return <RNText className={cn(textVariants({ variant }), inherited, className)} style={[{ textAlign, writingDirection: dir }, style]} {...props} />;
}

/**
 * Numbers, codes and times with even digit widths. The run is isolated as
 * left-to-right ("08:00 → 17:00" never flips) while the line keeps aligning
 * to the reading start edge.
 */
export function NumberText({ className, style, children, ...props }: TextProps & TextVariantProps & { className?: string; align?: "start" | "center" | "end" }) {
  const content = typeof children === "string" || typeof children === "number" ? `⁦${children}⁩` : children;
  return <Text className={className} style={[{ fontVariant: ["tabular-nums"] }, style]} {...props}>{content}</Text>;
}
