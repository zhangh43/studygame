import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isTrustedMutation } from "@/lib/auth";
import { queryOne } from "@/lib/db";

const schema = z.object({ body: z.string().trim().min(1).max(1000) });

type CommentRow = { id: string; authorId: string; authorName: string; body: string; createdAt: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comment must be between 1 and 1000 characters." }, { status: 400 });
  const { id } = await context.params;
  const comment = await queryOne<CommentRow>(
    `WITH inserted AS (
       INSERT INTO game_comments(game_id, user_id, body)
       SELECT g.id, $2, $3 FROM games g WHERE g.id = $1 AND g.status = 'published'
       RETURNING id, user_id, body, created_at
     )
     SELECT i.id::text, i.user_id AS "authorId", u.display_name AS "authorName",
            i.body, i.created_at::text AS "createdAt"
       FROM inserted i JOIN users u ON u.id = i.user_id`,
    [id, session.userId, parsed.data.body],
  );
  if (!comment) return NextResponse.json({ error: "Published game not found" }, { status: 404 });
  return NextResponse.json({ comment }, { status: 201 });
}
