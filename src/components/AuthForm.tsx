"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { translateApiError } from "@/lib/i18n";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        identifier: data.get("identifier"),
        password: data.get("password"),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(translateApiError(locale, result.error, t("auth.genericError")));
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      {mode === "register" && (
        <label>{t("auth.displayName")}<input name="name" autoComplete="name" minLength={2} required /></label>
      )}
      <label>{t("auth.identifier")}<input name="identifier" type="text" autoComplete="username" maxLength={254} required /></label>
      <label>{t("auth.password")}<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 6 : 1} placeholder={mode === "register" ? t("auth.passwordHint") : undefined} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? t("auth.wait") : mode === "login" ? t("auth.signIn") : t("auth.createStudio")}</button>
    </form>
  );
}
