import en from "./dictionaries/en.json";
import ar from "./dictionaries/ar.json";

export type Locale = "ar" | "en";
export const defaultLocale: Locale = "ar";
export const locales: Locale[] = ["ar", "en"];

const dictionaries: Record<Locale, Record<string, string>> = { en, ar };

export async function getLocale(): Promise<Locale> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value as Locale;
  return locales.includes(locale) ? locale : defaultLocale;
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
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(/locale=(\w+)/);
  return (match?.[1] as Locale) || defaultLocale;
}
