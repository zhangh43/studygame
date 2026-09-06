import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isTrustedMutation } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPublicSlug, ensureWorkspace } from "@/lib/game-files";

export const runtime = "nodejs";

const createSchema = z.object({ title: z.string().trim().min(1).max(100) });

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await db.query(
    `SELECT g.id, g.title, g.status, g.public_slug AS "publicSlug", g.draft_revision AS "draftRevision",
            g.published_revision AS "publishedRevision", g.updated_at AS "updatedAt",
            count(gs.user_id)::int AS "starCount"
       FROM games g LEFT JOIN game_stars gs ON gs.game_id = g.id
      WHERE g.tenant_id = $1 GROUP BY g.id ORDER BY g.updated_at DESC`,
    [session.tenantId],
  );
  return NextResponse.json({ games: result.rows });
}

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Game title is required." }, { status: 400 });

  const result = await db.query<{ id: string }>(
    `INSERT INTO games(tenant_id, creator_user_id, title, public_slug)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [session.tenantId, session.userId, parsed.data.title, createPublicSlug(parsed.data.title)],
  );
  await ensureWorkspace(session.tenantId, result.rows[0].id);
  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
