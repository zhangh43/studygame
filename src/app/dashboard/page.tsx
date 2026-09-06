import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardClient, type GameSummary } from "@/components/DashboardClient";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const result = await db.query<GameSummary>(
    `SELECT g.id, g.title, g.status, g.public_slug AS "publicSlug", g.draft_revision AS "draftRevision",
            g.published_revision AS "publishedRevision", g.updated_at::text AS "updatedAt",
            count(gs.user_id)::int AS "starCount"
       FROM games g LEFT JOIN game_stars gs ON gs.game_id = g.id
      WHERE g.tenant_id = $1 GROUP BY g.id ORDER BY g.updated_at DESC`,
    [session.tenantId],
  );
  return (
    <main className="app-shell">
      <SiteHeader session={session} />
      <DashboardClient initialGames={result.rows} displayName={session.displayName} />
    </main>
  );
}
