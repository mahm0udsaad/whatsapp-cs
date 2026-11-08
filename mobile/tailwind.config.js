/** @type {import('tailwindcss').Config} */

// shadcn-style semantic tokens. Values are RGB channels set by <ThemeScope>
// (components/ui/theme.tsx), with light defaults in global.css.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: "#25D366",
        background: token("background"),
        foreground: token("foreground"),
        card: token("card"),
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        destructive: { DEFAULT: token("destructive"), soft: token("destructive-soft") },
      },
    },
  },
  plugins: [],
};
