import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PublishedGameCard, type PublishedGameSummary } from "@/components/PublishedGameCard";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

type CreatorRank = { id: string; name: string; starCount: number; gameCount: number };

export default async function LeaderboardsPage() {
  const [session, games, creators] = await Promise.all([
    getSession(),
    db.query<PublishedGameSummary>(
      `SELECT g.id, g.title, g.public_slug AS "publicSlug", u.id AS "creatorId",
              u.display_name AS "creatorName", count(DISTINCT gs.user_id)::int AS "starCount",
              count(DISTINCT gc.id)::int AS "commentCount", g.updated_at::text AS "publishedAt"
         FROM games g JOIN users u ON u.id = g.creator_user_id
         LEFT JOIN game_stars gs ON gs.game_id = g.id
         LEFT JOIN game_comments gc ON gc.game_id = g.id
        WHERE g.status = 'published'
        GROUP BY g.id, u.id
        ORDER BY count(DISTINCT gs.user_id) DESC, g.updated_at DESC
        LIMIT 12`,
    ),
    db.query<CreatorRank>(
      `SELECT u.id, u.display_name AS name, count(gs.user_id)::int AS "starCount",
              count(DISTINCT g.id)::int AS "gameCount"
         FROM users u JOIN games g ON g.creator_user_id = u.id AND g.status = 'published'
         LEFT JOIN game_stars gs ON gs.game_id = g.id
        GROUP BY u.id
        ORDER BY count(gs.user_id) DESC, count(DISTINCT g.id) DESC, u.display_name
        LIMIT 20`,
    ),
  ]);
  return (
    <main className="app-shell">
      <SiteHeader session={session} />
      <section className="community-content">
        <div className="community-hero compact-hero"><p className="eyebrow">Hall of fame</p><h1>Community leaderboards</h1><p>Ranked by stars on currently published games.</p></div>
        <div className="leaderboard-layout">
          <section><h2 className="section-title">Top games</h2>{games.rows.length ? <div className="ranked-game-grid">{games.rows.map((game, index) => <PublishedGameCard game={game} rank={index + 1} key={game.id} />)}</div> : <p className="muted">No published games yet.</p>}</section>
          <aside><h2 className="section-title">Top creators</h2><ol className="creator-ranking">{creators.rows.map((creator, index) => <li key={creator.id}><b>{index + 1}</b><div><Link href={`/creators/${creator.id}`}>{creator.name}</Link><span>{creator.gameCount} published {creator.gameCount === 1 ? "game" : "games"}</span></div><strong>★ {creator.starCount}</strong></li>)}</ol></aside>
        </div>
      </section>
    </main>
  );
}
