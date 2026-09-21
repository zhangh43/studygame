import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { adminUsers, signupEnabled } from "@/lib/admin";
import { SiteHeader } from "@/components/SiteHeader";
import { AdminPortal } from "@/components/AdminPortal";
import { getTranslations } from "@/lib/i18n-server";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/dashboard");
  const [users, enabled, t] = await Promise.all([adminUsers(), signupEnabled(), getTranslations()]);
  return <div className="app-shell"><SiteHeader session={session} /><main className="community-content"><div className="community-hero compact-hero"><p className="eyebrow">Arcade Forge</p><h1>{t("admin.users")}</h1><p>{t("admin.usersSubtitle")}</p></div><AdminPortal initialUsers={users} initialSignupEnabled={enabled} /></main></div>;
}
