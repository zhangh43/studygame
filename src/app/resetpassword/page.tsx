import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { getTranslations } from "@/lib/i18n-server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const t = await getTranslations();
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">AF</div>
        <p className="eyebrow">Arcade Forge</p>
        <h1>{t("auth.resetPassword")}</h1>
        <p className="muted">{t("auth.resetSubtitle")}</p>
        <ResetPasswordForm />
        <p className="auth-switch"><Link href="/login">{t("auth.signIn")}</Link></p>
      </section>
    </main>
  );
}
