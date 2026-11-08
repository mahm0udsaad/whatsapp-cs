import { createContext, useContext, useMemo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { vars } from "nativewind";

/**
 * Semantic tokens (RGB channels), shadcn naming. Light mirrors global.css.
 * Brand: Nehgz blue #011F91 and yellow #FCBD05.
 */
export const themes = {
  light: {
    background: "245 247 252",
    foreground: "15 26 61",
    card: "255 255 255",
    border: "227 231 241",
    input: "214 220 235",
    ring: "1 31 145",
    muted: "238 241 248",
    "muted-foreground": "88 100 130",
    primary: "1 31 145",
    "primary-foreground": "255 255 255",
    secondary: "232 237 255",
    "secondary-foreground": "1 31 145",
    accent: "252 189 5",
    "accent-foreground": "61 46 0",
    success: "14 120 80",
    "success-soft": "226 245 236",
    warning: "146 96 0",
    "warning-soft": "255 244 214",
    destructive: "190 30 60",
    "destructive-soft": "253 232 236",
  },
  dark: {
    background: "11 16 32",
    foreground: "238 241 250",
    card: "20 27 48",
    border: "38 48 82",
    input: "52 64 104",
    ring: "142 166 255",
    // Inset surfaces sit below cards in dark mode, so selected segments read as raised.
    muted: "14 20 40",
    "muted-foreground": "166 177 205",
    primary: "142 166 255",
    "primary-foreground": "6 18 63",
    secondary: "30 42 85",
    "secondary-foreground": "201 213 255",
    accent: "252 189 5",
    "accent-foreground": "42 31 0",
    success: "95 211 162",
    "success-soft": "16 48 38",
    warning: "245 196 81",
    "warning-soft": "52 41 10",
    destructive: "255 143 163",
    "destructive-soft": "60 22 33",
  },
} as const;

export type ThemeName = keyof typeof themes;
export type ThemeToken = keyof typeof themes.light;
export type Direction = "rtl" | "ltr";

const themeVars = {
  light: vars(Object.fromEntries(Object.entries(themes.light).map(([k, v]) => [`--${k}`, v]))),
  dark: vars(Object.fromEntries(Object.entries(themes.dark).map(([k, v]) => [`--${k}`, v]))),
};

type ThemeContextValue = {
  theme: ThemeName;
  dir: Direction;
  /** Concrete colour for props that cannot take classes (icons, spinners, Switch). */
  color: (token: ThemeToken, alpha?: number) => string;
  /** Text alignment for the start edge in the current direction. */
  start: "left";
  /** Ionicons glyph that points "forward" (towards reading end). */
  forwardIcon: "chevron-back" | "chevron-forward";
  backIcon: "chevron-back" | "chevron-forward";
  forwardArrow: "arrow-back" | "arrow-forward";
};

function makeValue(theme: ThemeName, dir: Direction): ThemeContextValue {
  const rtl = dir === "rtl";
  return {
    theme,
    dir,
    color: (token, alpha = 1) => {
      const [r, g, b] = themes[theme][token].split(" ");
      return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    // React Native swaps left/right text alignment inside an RTL layout,
    // so "left" already means the start edge in both directions.
    start: "left",
    forwardIcon: rtl ? "chevron-back" : "chevron-forward",
    backIcon: rtl ? "chevron-forward" : "chevron-back",
    forwardArrow: rtl ? "arrow-back" : "arrow-forward",
  };
}

const ThemeContext = createContext<ThemeContextValue>(makeValue("light", "rtl"));

/** Applies tokens and reading direction to a subtree. */
export function ThemeScope({ theme, dir, children, style, className }: { theme: ThemeName; dir: Direction; children: ReactNode; style?: StyleProp<ViewStyle>; className?: string }) {
  const value = useMemo(() => makeValue(theme, dir), [theme, dir]);
  return (
    <ThemeContext.Provider value={value}>
      <View className={className} style={[themeVars[theme], { flex: 1, direction: dir }, style]}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
