import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, isTrustedMutation } from "@/lib/auth";
import { transaction } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  identifier: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(6).max(200),
  credential: z.literal("whoisyourteacher"),
});

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Password reset failed. Check your username, new password, and reset credential." }, { status: 400 });

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const updated = await transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        "UPDATE users SET password_hash = $1 WHERE email = $2 AND is_admin = false RETURNING id",
        [passwordHash, parsed.data.identifier],
      );
      if (!result.rows[0]) return false;
      await client.query("DELETE FROM sessions WHERE user_id = $1", [result.rows[0].id]);
      return true;
    });
    if (!updated) return NextResponse.json({ error: "Password reset failed. Check your username, new password, and reset credential." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reset the password. Please try again." }, { status: 500 });
  }
}
