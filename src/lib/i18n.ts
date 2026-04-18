import en from "./dictionaries/en.json";
import ar from "./dictionaries/ar.json";

export type Locale = "ar" | "en";
export const defaultLocale: Locale = "ar";
export const locales: Locale[] = ["ar", "en"];

const dictionaries: Record<Locale, Record<string, string>> = { en, ar };

export async function getLocale(): Promise<Locale> {
  return defaultLocale;
}

export function getDirection(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function createTranslator(locale: Locale) {
  const dict = dictionaries[locale];
  return function t(key: string, fallback?: string): string {
    return dict[key] ?? fallback ?? key;
  };
}

/** Client-side locale reader (reads from document.cookie). */
export function getClientLocale(): Locale {
  return defaultLocale;
}
