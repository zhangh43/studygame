import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, queryOne } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { SocialGame, type PublicComment } from "@/components/SocialGame";

export const dynamic = "force-dynamic";

type PublicGame = { id: string; title: string; publicSlug: string; creatorId: string; creatorName: string; starCount: number; commentCount: number; viewerStarred: boolean };

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  const { slug } = await params;
  const game = await queryOne<PublicGame>(
    `SELECT g.id, g.title, g.public_slug AS "publicSlug", u.id AS "creatorId", u.display_name AS "creatorName",
            (SELECT count(*)::int FROM game_stars gs WHERE gs.game_id = g.id) AS "starCount",
            (SELECT count(*)::int FROM game_comments gc WHERE gc.game_id = g.id) AS "commentCount",
            EXISTS(SELECT 1 FROM game_stars vs WHERE vs.game_id = g.id AND vs.user_id = $2::uuid) AS "viewerStarred"
       FROM games g JOIN users u ON u.id = g.creator_user_id
      WHERE g.public_slug = $1 AND g.status = 'published'`,
    [slug, session?.userId ?? null],
  );
  if (!game) notFound();
  const comments = await db.query<PublicComment>(
    `SELECT gc.id::text, u.id AS "authorId", u.display_name AS "authorName", gc.body,
            gc.created_at::text AS "createdAt"
       FROM game_comments gc JOIN users u ON u.id = gc.user_id
      WHERE gc.game_id = $1 ORDER BY gc.created_at DESC, gc.id DESC LIMIT 50`,
    [game.id],
  );
  return <div className="app-shell"><SiteHeader session={session} /><SocialGame game={game} initialComments={comments.rows} signedIn={Boolean(session)} /></div>;
}
