"use client";

import { FormEvent, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { translateApiError } from "@/lib/i18n";

export function ResetPasswordForm() {
  const { locale, t } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const response = await fetch("/api/auth/resetpassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: data.get("identifier"),
          password: data.get("password"),
          credential: data.get("credential"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(translateApiError(locale, result.error, t("auth.resetError")));
        return;
      }
      form.reset();
      setSuccess(true);
    } catch {
      setError(t("auth.resetError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <label>{t("auth.identifier")}<input name="identifier" type="text" autoComplete="username" maxLength={254} required /></label>
      <label>{t("auth.newPassword")}<input name="password" type="password" autoComplete="new-password" minLength={6} maxLength={200} placeholder={t("auth.passwordHint")} required /></label>
      <label>{t("auth.resetCredential")}<input name="credential" type="password" autoComplete="off" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p role="status">{t("auth.resetSuccess")}</p>}
      <button className="primary-button" disabled={busy}>{busy ? t("auth.wait") : t("auth.resetPassword")}</button>
    </form>
  );
}
