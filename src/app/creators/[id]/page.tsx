import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, queryOne } from "@/lib/db";
import { PublishedGameCard, type PublishedGameSummary } from "@/components/PublishedGameCard";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

type Creator = { id: string; name: string; starCount: number; gameCount: number };

export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([getSession(), params]);
  const creator = await queryOne<Creator>(
    `SELECT u.id, u.display_name AS name,
            count(DISTINCT g.id)::int AS "gameCount", count(gs.user_id)::int AS "starCount"
       FROM users u
       LEFT JOIN games g ON g.creator_user_id = u.id AND g.status = 'published'
       LEFT JOIN game_stars gs ON gs.game_id = g.id
      WHERE u.id = $1 GROUP BY u.id`,
    [id],
  );
  if (!creator) notFound();
  const games = await db.query<PublishedGameSummary>(
    `SELECT g.id, g.title, g.public_slug AS "publicSlug", u.id AS "creatorId", u.display_name AS "creatorName",
            count(DISTINCT gs.user_id)::int AS "starCount", count(DISTINCT gc.id)::int AS "commentCount",
            g.updated_at::text AS "publishedAt"
       FROM games g JOIN users u ON u.id = g.creator_user_id
       LEFT JOIN game_stars gs ON gs.game_id = g.id
       LEFT JOIN game_comments gc ON gc.game_id = g.id
      WHERE g.creator_user_id = $1 AND g.status = 'published'
      GROUP BY g.id, u.id ORDER BY g.updated_at DESC`,
    [id],
  );
  return (
    <main className="app-shell"><SiteHeader session={session} /><section className="community-content">
      <div className="creator-hero"><div className="creator-avatar">{creator.name.slice(0, 2).toUpperCase()}</div><div><p className="eyebrow">Creator profile</p><h1>{creator.name}</h1><p><strong>★ {creator.starCount}</strong> stars across {creator.gameCount} published {creator.gameCount === 1 ? "game" : "games"}</p></div></div>
      {games.rows.length ? <div className="game-grid">{games.rows.map((game) => <PublishedGameCard game={game} key={game.id} />)}</div> : <div className="empty-state"><p>This creator has no published games right now.</p></div>}
    </section></main>
  );
}
