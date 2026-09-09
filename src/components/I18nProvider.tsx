"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { makeTranslator, type Locale, type Translate } from "@/lib/i18n";

type I18nValue = { locale: Locale; setLocale: (locale: Locale) => void; t: Translate };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState(initialLocale);
  const value = useMemo(() => ({ locale, setLocale, t: makeTranslator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
