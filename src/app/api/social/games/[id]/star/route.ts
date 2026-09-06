import { NextResponse } from "next/server";
import { getSession, isTrustedMutation } from "@/lib/auth";
import { db, queryOne } from "@/lib/db";

async function publishedGame(id: string) {
  return queryOne<{ id: string }>("SELECT id FROM games WHERE id = $1 AND status = 'published'", [id]);
}

async function starCount(id: string): Promise<number> {
  const row = await queryOne<{ count: number }>("SELECT count(*)::int AS count FROM game_stars WHERE game_id = $1", [id]);
  return row?.count ?? 0;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!await publishedGame(id)) return NextResponse.json({ error: "Published game not found" }, { status: 404 });
  await db.query("INSERT INTO game_stars(game_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, session.userId]);
  return NextResponse.json({ starred: true, starCount: await starCount(id) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!await publishedGame(id)) return NextResponse.json({ error: "Published game not found" }, { status: 404 });
  await db.query("DELETE FROM game_stars WHERE game_id = $1 AND user_id = $2", [id, session.userId]);
  return NextResponse.json({ starred: false, starCount: await starCount(id) });
}
