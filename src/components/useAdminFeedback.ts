"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { translateApiError, type MessageKey } from "@/lib/i18n";

type Feedback = { key: MessageKey } | { error: unknown } | null;

// Keep the original message so existing feedback follows language changes too.
export function useAdminFeedback() {
  const { locale, t } = useI18n();
  const [value, setFeedback] = useState<Feedback>(null);
  const feedback = !value ? "" : "key" in value ? t(value.key) : translateApiError(
    locale,
    value.error instanceof Error ? value.error.message : undefined,
    t("admin.requestError"),
  );
  return { feedback, setFeedback };
}
