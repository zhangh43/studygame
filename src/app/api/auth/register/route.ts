import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, isTrustedMutation } from "@/lib/auth";
import { transaction } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  identifier: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(6).max(200),
});

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid display name, email/user name, and a password of at least 6 characters." }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const account = await transaction(async (client) => {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users(email, display_name, password_hash)
         VALUES ($1, $2, $3) RETURNING id`,
        [parsed.data.identifier, parsed.data.name, passwordHash],
      );
      const tenant = await client.query<{ id: string }>(
        "INSERT INTO tenants(name) VALUES ($1) RETURNING id",
        [`${parsed.data.name}'s studio`],
      );
      await client.query(
        "INSERT INTO tenant_memberships(tenant_id, user_id, role) VALUES ($1, $2, 'owner')",
        [tenant.rows[0].id, user.rows[0].id],
      );
      return { userId: user.rows[0].id, tenantId: tenant.rows[0].id };
    });
    await createSession(account.userId, account.tenantId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "An account with that email/user name already exists." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
