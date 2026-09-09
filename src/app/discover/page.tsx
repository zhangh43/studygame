import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PublishedGameCard, type PublishedGameSummary } from "@/components/PublishedGameCard";
import { SiteHeader } from "@/components/SiteHeader";
import { getTranslations } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const [session, games, t] = await Promise.all([
    getSession(),
    db.query<PublishedGameSummary>(
      `SELECT g.id, g.title, g.public_slug AS "publicSlug", u.id AS "creatorId",
              u.display_name AS "creatorName", count(DISTINCT gs.user_id)::int AS "starCount",
              count(DISTINCT gc.id)::int AS "commentCount", g.updated_at::text AS "publishedAt"
         FROM games g
         JOIN users u ON u.id = g.creator_user_id
         LEFT JOIN game_stars gs ON gs.game_id = g.id
         LEFT JOIN game_comments gc ON gc.game_id = g.id
        WHERE g.status = 'published'
        GROUP BY g.id, u.id
        ORDER BY g.updated_at DESC
        LIMIT 60`,
    ),
    getTranslations(),
  ]);
  return (
    <main className="app-shell">
      <SiteHeader session={session} />
      <section className="community-content">
        <div className="community-hero"><p className="eyebrow">{t("discover.eyebrow")}</p><h1>{t("discover.title")}</h1><p>{t("discover.subtitle")}</p></div>
        {games.rows.length ? <div className="game-grid">{games.rows.map((game) => <PublishedGameCard game={game} key={game.id} />)}</div> : <div className="empty-state"><span>✦</span><h2>{t("discover.emptyTitle")}</h2><p>{t("discover.emptyText")}</p></div>}
      </section>
    </main>
  );
}
