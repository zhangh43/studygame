import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, isTrustedMutation, verifyPassword } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  identifier: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(200),
});

type Account = { userId: string; tenantId: string; passwordHash: string };

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email/user name or password." }, { status: 400 });

  const account = await queryOne<Account>(
    `SELECT u.id AS "userId", tm.tenant_id AS "tenantId", u.password_hash AS "passwordHash"
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
      WHERE u.email = $1
      ORDER BY tm.created_at
      LIMIT 1`,
    [parsed.data.identifier],
  );
  if (!account || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
    return NextResponse.json({ error: "Invalid email/user name or password." }, { status: 401 });
  }
  await createSession(account.userId, account.tenantId);
  return NextResponse.json({ ok: true });
}
