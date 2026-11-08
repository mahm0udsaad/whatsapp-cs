import { createContext, useContext, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, SegmentedControl, Text, ThemeScope, useTheme } from "../../components/ui";
import { cn } from "../../lib/utils";
import { useHrDemo } from "./hooks";
import { HrDemoControls } from "./demo-controls";

export const hrPath = (page = "") => `/(hub)/(tabs)/hr${page ? `/${page}` : ""}` as Href;

/** Scenario controls are for development and preview builds only. */
export const hrDemoControlsEnabled = __DEV__ || process.env.EXPO_PUBLIC_HR_DEMO_CONTROLS === "1";

const HrRouteContext = createContext<{ routeBase: string; identity?: string }>({ routeBase: "/(hub)/(tabs)/hr" });

export function HrUiProvider({ children, routeBase = "/(hub)/(tabs)/hr", identity }: { children: ReactNode; routeBase?: string; identity?: string }) {
  return <HrRouteContext.Provider value={{ routeBase, identity }}>{children}</HrRouteContext.Provider>;
}

export function useHrUi() {
  const { routeBase, identity } = useContext(HrRouteContext);
  const demo = useHrDemo(identity);
  const ar = demo.state.locale === "ar";
  const path = (page = "") => `${routeBase}${page ? `/${page}` : ""}` as Href;
  return {
    ...demo,
    ar,
    dir: (ar ? "rtl" : "ltr") as "rtl" | "ltr",
    path,
    t: (arabic: string, english: string) => (ar ? arabic : english),
    pick: (pair: readonly [string, string]) => (ar ? pair[0] : pair[1]),
    /** Back within HR; falls back to a known page when there is no history (cold link). */
    goBack: (fallback = "today") => (router.canGoBack() ? router.back() : router.replace(path(fallback))),
  };
}

type Section = "today" | "history" | "account";

/**
 * Every HR page renders inside this shell:
 * tokens + direction, safe-area top bar, demo label, optional section switcher,
 * scrolling content and an optional sticky footer for the main action.
 */
export function HrScreen({ children, title, header, section, back, footer, flow = false, immersive = false, testID = "hr-screen" }: {
  children: ReactNode;
  title?: string;
  /** Replaces the title (e.g. greeting on Today). */
  header?: ReactNode;
  section?: Section;
  /** Shows a back button; the value is the fallback page. */
  back?: string;
  footer?: ReactNode;
  /** Focused step: the Hub tab bar is hidden, so pad for the home indicator. */
  flow?: boolean;
  /** Dark full-bleed surface (scanner). */
  immersive?: boolean;
  testID?: string;
}) {
  const { state } = useHrUi();
  const theme = immersive ? "dark" : state.theme;
  return (
    <ThemeScope theme={theme} dir={state.locale === "ar" ? "rtl" : "ltr"}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <HrScreenBody title={title} header={header} section={section} back={back} footer={footer} flow={flow} testID={testID}>{children}</HrScreenBody>
    </ThemeScope>
  );
}

function HrScreenBody({ children, title, header, section, back, footer, flow, testID }: { children: ReactNode; title?: string; header?: ReactNode; section?: Section; back?: string; footer?: ReactNode; flow: boolean; testID: string }) {
  const insets = useSafeAreaInsets();
  const { color, backIcon } = useTheme();
  const { t, path, goBack } = useHrUi();
  const [demoOpen, setDemoOpen] = useState(false);
  const bottomPad = flow ? insets.bottom + 12 : 16;
  return (
    <View testID={testID} className="flex-1 bg-background" style={{ paddingTop: insets.top + 6 }}>
      <View className="mx-auto w-full max-w-[560px] flex-row items-center gap-2 px-4 pb-2" style={{ minHeight: 52 }}>
        {back ? (
          <Pressable testID="hr-back" accessibilityRole="button" accessibilityLabel={t("رجوع", "Back")} onPress={() => goBack(back)} className="h-11 w-11 items-center justify-center rounded-full bg-card active:bg-muted">
            <Ionicons name={backIcon} size={22} color={color("foreground")} />
          </Pressable>
        ) : null}
        <View className={cn("flex-1", !back && "ps-1")}>
          {header ?? (title ? <Text variant="h2" accessibilityRole="header" numberOfLines={1}>{title}</Text> : null)}
        </View>
        <DemoChip onPress={hrDemoControlsEnabled ? () => setDemoOpen(true) : undefined} />
      </View>
      {section ? (
        <View className="mx-auto w-full max-w-[560px] px-4 pb-1">
          <SegmentedControl
            testIDPrefix="hr-tab"
            value={section}
            onChange={(next) => next !== section && router.replace(path(next))}
            options={[
              { value: "today", label: t("اليوم", "Today") },
              { value: "history", label: t("السجل", "History") },
              { value: "account", label: t("حسابي", "Account") },
            ]}
          />
        </View>
      ) : null}
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" className="flex-1" contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 16, paddingBottom: footer ? 16 : bottomPad + 8, width: "100%", maxWidth: 560, alignSelf: "center", flexGrow: 1 }}>
        {children}
      </ScrollView>
      {footer ? <View className="mx-auto w-full max-w-[560px] gap-2 px-4 pt-3" style={{ paddingBottom: bottomPad }}>{footer}</View> : null}
      {hrDemoControlsEnabled ? <HrDemoControls open={demoOpen} onClose={() => setDemoOpen(false)} /> : null}
    </View>
  );
}

/** Always-visible demo label; opens scenario controls in dev/preview builds. */
function DemoChip({ onPress }: { onPress?: () => void }) {
  const { t } = useHrUi();
  const { color } = useTheme();
  const body = (
    <View className="flex-row items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1">
      <Ionicons name="flask-outline" size={13} color={color("warning")} />
      <Text className="text-xs font-bold text-warning">{t("تجريبي", "Demo")}</Text>
    </View>
  );
  if (!onPress) return <View accessibilityLabel={t("نسخة تجريبية ببيانات وهمية", "Demo version with test data")}>{body}</View>;
  return <Pressable testID="hr-demo-controls" accessibilityRole="button" accessibilityLabel={t("أدوات التجربة", "Demo controls")} onPress={onPress} hitSlop={8} className="min-h-[44px] justify-center">{body}</Pressable>;
}

/** Centered hero for empty, success and error states. */
export function HrHero({ icon, tone = "default", title, body, children }: { icon: React.ComponentProps<typeof Ionicons>["name"]; tone?: "default" | "success" | "warning" | "destructive" | "primary"; title: string; body?: string; children?: ReactNode }) {
  const { color } = useTheme();
  const bg = { default: "bg-secondary", success: "bg-success-soft", warning: "bg-warning-soft", destructive: "bg-destructive-soft", primary: "bg-primary" }[tone];
  const fg = { default: "secondary-foreground", success: "success", warning: "warning", destructive: "destructive", primary: "primary-foreground" }[tone] as Parameters<typeof color>[0];
  return (
    <View className="items-center gap-4 py-6">
      <View className={cn("h-24 w-24 items-center justify-center rounded-[32px]", bg)} style={{ borderCurve: "continuous" }}>
        <Ionicons name={icon} size={46} color={color(fg)} />
      </View>
      <Text variant="h1" align="center" accessibilityRole="header">{title}</Text>
      {body ? <Text variant="lead" align="center" className="max-w-[420px]">{body}</Text> : null}
      {children}
    </View>
  );
}

/** Steps 1/2/3 of phone setup. */
export function HrStepper({ step, total = 3, label }: { step: number; total?: number; label: string }) {
  const { t } = useHrUi();
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="small" className="text-muted-foreground">{label}</Text>
        <Text variant="small">{t(`الخطوة ${step} من ${total}`, `Step ${step} of ${total}`)}</Text>
      </View>
      <View className="flex-row gap-1.5">
        {Array.from({ length: total }, (_, i) => <View key={i} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-border")} />)}
      </View>
    </View>
  );
}

export { Button };
export function minutesLabel(minutes: number) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`; }
export function countdown(seconds: number) { const s = Math.max(0, seconds); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
export function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join(""); }
/** Keep Western digits everywhere (times, codes, dates) for consistency. */
export function latinDigits(text: string) { return text.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)); }
/** Isolate a left-to-right run (e.g. "08:00 – 17:00") inside Arabic text. */
export function ltr(text: string) { return `\u2066${text}\u2069`; }
