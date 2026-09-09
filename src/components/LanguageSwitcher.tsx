"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale || busy) return;
    setBusy(true);
    const previous = locale;
    setLocale(nextLocale);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) throw new Error("Could not save language");
      router.refresh();
    } catch {
      setLocale(previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      <button className={locale === "en" ? "active" : ""} disabled={busy} onClick={() => changeLocale("en")}>EN</button>
      <button className={locale === "zh" ? "active" : ""} disabled={busy} onClick={() => changeLocale("zh")}>中文</button>
    </div>
  );
}
