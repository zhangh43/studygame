import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, queryOne } from "@/lib/db";
import { GameStudio, type StudioMessage } from "@/components/GameStudio";

export const dynamic = "force-dynamic";

type Game = {
  id: string;
  title: string;
  status: "draft" | "published";
  publicSlug: string;
  draftRevision: number;
  publishedRevision: number | null;
};

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const game = await queryOne<Game>(
    `SELECT id, title, status, public_slug AS "publicSlug", draft_revision AS "draftRevision",
            published_revision AS "publishedRevision"
       FROM games WHERE id = $1 AND tenant_id = $2`,
    [id, session.tenantId],
  );
  if (!game) notFound();
  const messages = await db.query<StudioMessage>(
    `SELECT id::text, role, content, created_at::text AS "createdAt"
       FROM messages WHERE game_id = $1 AND tenant_id = $2 ORDER BY id`,
    [id, session.tenantId],
  );

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div className="studio-title"><Link href="/dashboard" aria-label="Back to dashboard">←</Link><div><span>Game studio</span><h1>{game.title}</h1></div></div>
        <div className="studio-state"><span className={`status ${game.status}`}>{game.status}</span></div>
      </header>
      <GameStudio game={game} initialMessages={messages.rows} />
    </main>
  );
}
