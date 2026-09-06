import { NextResponse } from "next/server";
import { getSession, isTrustedMutation } from "@/lib/auth";
import { db, queryOne, transaction } from "@/lib/db";
import { snapshotPublishedGame } from "@/lib/game-files";

type GameRow = { id: string; slug: string; revision: number };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const game = await queryOne<GameRow>(
    `SELECT id, public_slug AS slug, draft_revision AS revision
       FROM games WHERE id = $1 AND tenant_id = $2`,
    [id, session.tenantId],
  );
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const running = await queryOne<{ id: string }>(
    "SELECT id FROM generation_jobs WHERE game_id = $1 AND status = 'running'",
    [id],
  );
  if (running) {
    return NextResponse.json({ error: "Wait for the current generation to finish before publishing." }, { status: 409 });
  }

  try {
    const artifact = await snapshotPublishedGame(session.tenantId, id, game.slug, game.revision);
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO game_versions(tenant_id, game_id, revision, artifact_path, sha256)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (game_id, revision) DO UPDATE
         SET artifact_path = EXCLUDED.artifact_path, sha256 = EXCLUDED.sha256`,
        [session.tenantId, id, game.revision, artifact.artifactPath, artifact.sha256],
      );
      await client.query(
        `UPDATE games SET status = 'published', published_revision = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [game.revision, id, session.tenantId],
      );
    });
    return NextResponse.json({ ok: true, url: `/play/${game.slug}` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not publish game" },
      { status: 422 },
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const result = await db.query(
    `UPDATE games SET status = 'draft', updated_at = now()
      WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, session.tenantId],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
