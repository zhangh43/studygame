import { NextResponse } from "next/server";
import { getSession, hashPassword, isTrustedMutation, verifyPassword } from "@/lib/auth";
import { adminMutation, courseSheet, courseLessons, lessonEvaluations } from "@/lib/admin";
import { db, transaction } from "@/lib/db";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const course = new URL(request.url).searchParams.get("course")?.trim();
  if (!course || course.length > 100) return NextResponse.json({ error: "Choose a course." }, { status: 400 });
  const [groups, lessons, evaluations] = await Promise.all([courseSheet(course), courseLessons(course), lessonEvaluations(course)]);
  return NextResponse.json({ groups, lessons, evaluations }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const parsed = adminMutation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes. Check the required fields; lessons must total 10–20, passwords need 6–200 characters, and course/group numbers allow up to 100." }, { status: 400 });
  const data = parsed.data;
  try {
    if (data.action === "lessons") {
      const exists = await db.query(`SELECT 1 FROM users WHERE course_number = $1 AND NOT is_admin UNION SELECT 1 FROM course_lessons WHERE course_number = $1 UNION SELECT 1 FROM group_evaluations WHERE course_number = $1 LIMIT 1`, [data.courseNumber]);
      if (!exists.rowCount) return NextResponse.json({ error: "Course not found." }, { status: 404 });
      // Add missing lessons only; never erase existing lesson evaluations.
      await db.query(`INSERT INTO course_lessons(course_number, lesson_number) SELECT $1, n FROM generate_series(1, $2::integer) n ON CONFLICT (course_number, lesson_number) DO NOTHING`, [data.courseNumber, data.count]);
    } else if (data.action === "lessonStar") {
      const result = await db.query(`UPDATE course_lessons l SET star_group_number = $3
        WHERE l.id = $1 AND l.course_number = $2 AND ($3::text IS NULL OR
          EXISTS (SELECT 1 FROM users WHERE course_number = $2 AND group_number = $3 AND NOT is_admin) OR
          EXISTS (SELECT 1 FROM lesson_evaluations e JOIN course_lessons cl ON cl.id = e.lesson_id WHERE cl.course_number = $2 AND e.group_number = $3) OR
          EXISTS (SELECT 1 FROM group_evaluations WHERE course_number = $2 AND group_number = $3) OR
          EXISTS (SELECT 1 FROM course_lessons WHERE course_number = $2 AND star_group_number = $3)) RETURNING l.id`,
        [data.lessonId, data.courseNumber, data.groupNumber]);
      if (!result.rowCount) return NextResponse.json({ error: "Lesson or group not found in this course." }, { status: 404 });
    } else if (data.action === "lessonEvaluation") {
      const result = await db.query(`INSERT INTO lesson_evaluations(lesson_id, group_number, completed, presented, notes)
        SELECT l.id, $3, $4, $5, $6 FROM course_lessons l WHERE l.id = $1 AND l.course_number = $2 AND (
          EXISTS (SELECT 1 FROM users WHERE course_number = $2 AND group_number = $3 AND NOT is_admin) OR
          EXISTS (SELECT 1 FROM lesson_evaluations e JOIN course_lessons cl ON cl.id = e.lesson_id WHERE cl.course_number = $2 AND e.group_number = $3) OR
          EXISTS (SELECT 1 FROM group_evaluations WHERE course_number = $2 AND group_number = $3) OR
          EXISTS (SELECT 1 FROM course_lessons WHERE course_number = $2 AND star_group_number = $3))
        ON CONFLICT (lesson_id, group_number) DO UPDATE SET completed = EXCLUDED.completed, presented = EXCLUDED.presented, notes = EXCLUDED.notes, updated_at = now() RETURNING lesson_id`,
        [data.lessonId, data.courseNumber, data.groupNumber, data.completed, data.presented, data.notes]);
      if (!result.rowCount) return NextResponse.json({ error: "Lesson or group not found in this course." }, { status: 404 });
    } else if (data.action === "signup") {
      await db.query("UPDATE site_settings SET signup_enabled = $1 WHERE id = true", [data.enabled]);
    } else if (data.action === "evaluation") {
      const result = await db.query(`INSERT INTO group_evaluations(course_number, group_number, completed, presented, notes)
        SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM users WHERE course_number = $1 AND group_number = $2 AND NOT is_admin)
          OR EXISTS (SELECT 1 FROM group_evaluations WHERE course_number = $1 AND group_number = $2)
          OR EXISTS (SELECT 1 FROM lesson_evaluations e JOIN course_lessons l ON l.id = e.lesson_id WHERE l.course_number = $1 AND e.group_number = $2)
          OR EXISTS (SELECT 1 FROM course_lessons WHERE course_number = $1 AND star_group_number = $2)
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
