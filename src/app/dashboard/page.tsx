import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardClient, type GameSummary } from "@/components/DashboardClient";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const result = await db.query<GameSummary>(
    `SELECT id, title, status, public_slug AS "publicSlug", draft_revision AS "draftRevision",
            published_revision AS "publishedRevision", updated_at::text AS "updatedAt"
       FROM games WHERE tenant_id = $1 ORDER BY updated_at DESC`,
    [session.tenantId],
  );
  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="brand-mark small">AF</span><strong>Arcade Forge</strong></div>
        <div className="topbar-user"><span>{session.tenantName}</span><LogoutButton /></div>
      </header>
      <DashboardClient initialGames={result.rows} displayName={session.displayName} />
    </main>
  );
}
