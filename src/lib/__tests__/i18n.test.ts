import { describe, it, expect } from "vitest";
import { defaultLocale, locales, getDirection, createTranslator } from "@/lib/i18n";

describe("i18n constants", () => {
  it("defaultLocale is 'ar'", () => {
    expect(defaultLocale).toBe("ar");
  });

  it("locales contains both 'ar' and 'en'", () => {
    expect(locales).toContain("ar");
    expect(locales).toContain("en");
    expect(locales).toHaveLength(2);
  });
});

describe("getDirection", () => {
  it("returns 'rtl' for Arabic", () => {
    expect(getDirection("ar")).toBe("rtl");
  });

  it("returns 'ltr' for English", () => {
    expect(getDirection("en")).toBe("ltr");
  });
});

describe("createTranslator", () => {
  it("returns English strings for known keys", () => {
    const t = createTranslator("en");
    expect(t("nav.overview")).toBe("Overview");
    expect(t("nav.menu")).toBe("Menu");
  });

  it("returns Arabic strings for known keys", () => {
    const t = createTranslator("ar");
    expect(t("nav.overview")).toBe("نظرة عامة");
    expect(t("nav.menu")).toBe("قائمة الطعام");
  });

  it("returns the key itself if key not found and no fallback", () => {
    const t = createTranslator("en");
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("returns fallback if key not found and fallback provided", () => {
    const t = createTranslator("en");
    expect(t("nonexistent.key", "my fallback")).toBe("my fallback");
  });
});
