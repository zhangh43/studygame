import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isTrustedMutation } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ title: z.string().trim().min(1).max(100) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid title" }, { status: 400 });
  const { id } = await context.params;
  const result = await db.query(
    `UPDATE games SET title = $1, updated_at = now()
      WHERE id = $2 AND tenant_id = $3 RETURNING id`,
    [parsed.data.title, id, session.tenantId],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
