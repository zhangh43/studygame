import { NextResponse } from "next/server";
import { getSession, hashPassword, isTrustedMutation, verifyPassword } from "@/lib/auth";
import { adminMutation, courseSheet } from "@/lib/admin";
import { db, transaction } from "@/lib/db";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const course = new URL(request.url).searchParams.get("course")?.trim();
  if (!course || course.length > 100) return NextResponse.json({ error: "Choose a course." }, { status: 400 });
  return NextResponse.json({ groups: await courseSheet(course) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const parsed = adminMutation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes. Passwords need 6–200 characters; course and group numbers allow up to 100." }, { status: 400 });
  const data = parsed.data;
  try {
    if (data.action === "signup") {
      await db.query("UPDATE site_settings SET signup_enabled = $1 WHERE id = true", [data.enabled]);
    } else if (data.action === "evaluation") {
      const result = await db.query(`INSERT INTO group_evaluations(course_number, group_number, completed, presented, notes)
        SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM users WHERE course_number = $1 AND group_number = $2 AND NOT is_admin)
        ON CONFLICT (course_number, group_number) DO UPDATE SET completed = EXCLUDED.completed, presented = EXCLUDED.presented, notes = EXCLUDED.notes, updated_at = now() RETURNING group_number`,
      [data.courseNumber, data.groupNumber, data.completed, data.presented, data.notes]);
      if (!result.rowCount) return NextResponse.json({ error: "Group no longer exists in this course. Refresh the sheet." }, { status: 404 });
    } else if (data.action === "user") {
      const passwordHash = data.password ? await hashPassword(data.password) : null;
      const updated = await transaction(async client => {
        const result = await client.query(`UPDATE users SET group_number = $2, course_number = $3, password_hash = coalesce($4, password_hash) WHERE id = $1 AND NOT is_admin RETURNING id`, [data.userId, data.groupNumber, data.courseNumber, passwordHash]);
        if (result.rowCount && passwordHash) await client.query("DELETE FROM sessions WHERE user_id = $1", [data.userId]);
        return result.rowCount;
      });
      if (!updated) return NextResponse.json({ error: "User not found or account is an administrator." }, { status: 404 });
    } else {
      const updated = await transaction(async client => {
        const account = await client.query("SELECT password_hash FROM users WHERE id = $1 FOR UPDATE", [session.userId]);
        if (!account.rows[0] || !await verifyPassword(data.currentPassword, account.rows[0].password_hash)) return false;
        await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(data.password), session.userId]);
        await client.query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [session.userId, session.sessionId]);
        return true;
      });
      if (!updated) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save changes. Please try again." }, { status: 500 });
  }
}
