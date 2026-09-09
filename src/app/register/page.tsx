import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";
import { getTranslations } from "@/lib/i18n-server";

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  const t = await getTranslations();
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">AF</div>
        <p className="eyebrow">Arcade Forge</p>
        <h1>{t("auth.registerTitle")}</h1>
        <p className="muted">{t("auth.registerSubtitle")}</p>
        <AuthForm mode="register" />
        <p className="auth-switch">{t("auth.alreadyRegistered")} <Link href="/login">{t("auth.signIn")}</Link></p>
      </section>
    </main>
  );
}
