import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { adminUsers, signupEnabled } from "@/lib/admin";
import { SiteHeader } from "@/components/SiteHeader";
import { AdminPortal } from "@/components/AdminPortal";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/dashboard");
  const [users, enabled] = await Promise.all([adminUsers(), signupEnabled()]);
  return <div className="app-shell"><SiteHeader session={session} /><main className="community-content"><div className="community-hero compact-hero"><p className="eyebrow">Arcade Forge</p><h1>Admin portal</h1><p>Manage accounts and evaluate groups by course.</p></div><AdminPortal initialUsers={users} initialSignupEnabled={enabled} /></main></div>;
}
