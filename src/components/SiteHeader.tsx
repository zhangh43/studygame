"use client";

import Link from "next/link";
import type { Session } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { useI18n } from "@/components/I18nProvider";

export function SiteHeader({ session }: { session: Session | null }) {
  const { t } = useI18n();
  return (
    <header className="topbar social-topbar">
      <Link className="site-brand" href="/discover"><span className="brand-mark small">AF</span><strong>Arcade Forge</strong></Link>
      <nav className="main-nav" aria-label={t("nav.main")}>
        <Link href="/discover">{t("nav.discover")}</Link>
        <Link href="/leaderboards">{t("nav.leaderboards")}</Link>
        {session && <Link href="/dashboard">{t("nav.workshop")}</Link>}
      </nav>
      <div className="topbar-user">
        {session ? <><span>{session.displayName}</span><LogoutButton /></> : <><Link href="/login">{t("nav.signIn")}</Link><Link className="primary-button compact" href="/register">{t("nav.join")}</Link></>}
      </div>
    </header>
  );
}
