"use client";

import { useCallback } from "react";
import { Languages } from "lucide-react";
import { getClientLocale, createTranslator } from "@/lib/i18n";

export function LanguageSwitcher() {
  const locale = getClientLocale();
  const t = createTranslator(locale);

  const toggle = useCallback(() => {
    const next = locale === "ar" ? "en" : "ar";
    document.cookie = `locale=${next};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    window.location.reload();
  }, [locale]);

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
    >
      <Languages size={16} className="shrink-0" />
      <span>{t("lang.switch")}</span>
      <span className="ms-auto rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide">
        {t("lang.code")}
      </span>
    </button>
  );
}
