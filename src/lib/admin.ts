import { z } from "zod";
import { db, queryOne } from "@/lib/db";

export const optionalNumber = z.string().trim().max(100).transform(value => value || null);
export const adminMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("signup"), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("user"), userId: z.uuid(), groupNumber: optionalNumber, courseNumber: optionalNumber, password: z.string().min(6).max(200).optional() }).strict(),
  z.object({ action: z.literal("password"), currentPassword: z.string().min(1).max(200), password: z.string().min(6).max(200) }).strict(),
  z.object({ action: z.literal("evaluation"), courseNumber: z.string().trim().min(1).max(100), groupNumber: z.string().trim().min(1).max(100), completed: z.boolean(), presented: z.boolean(), notes: z.string().max(4000) }).strict(),
]);
export type AdminUser = { id: string; email: string; displayName: string; groupNumber: string | null; courseNumber: string | null; isAdmin: boolean; createdAt: string };
export type GroupEvaluation = { groupNumber: string; members: { id: string; name: string; email: string }[]; stars: number; completed: boolean; presented: boolean; notes: string };
export async function signupEnabled() {
  return (await queryOne<{ enabled: boolean }>("SELECT signup_enabled AS enabled FROM site_settings WHERE id = true"))?.enabled ?? false;
}
export async function adminUsers() {
  return (await db.query<AdminUser>(`SELECT id, email, display_name AS "displayName", group_number AS "groupNumber", course_number AS "courseNumber", is_admin AS "isAdmin", created_at::text AS "createdAt" FROM users ORDER BY created_at, id`)).rows;
}
export async function courseSheet(course: string) {
  const groups = await db.query<GroupEvaluation>(`
    WITH member_stars AS (
      SELECT u.id, u.display_name, u.email, u.group_number,
             count(s.user_id)::integer AS stars
      FROM users u LEFT JOIN games g ON g.creator_user_id = u.id
      LEFT JOIN game_stars s ON s.game_id = g.id
      WHERE u.course_number = $1 AND u.group_number IS NOT NULL AND NOT u.is_admin
      GROUP BY u.id
    )
    SELECT m.group_number AS "groupNumber",
           jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'email', m.email) ORDER BY m.email) AS members,
           sum(m.stars)::integer AS stars,
           coalesce(e.completed, false) AS completed, coalesce(e.presented, false) AS presented,
           coalesce(e.notes, '') AS notes
    FROM member_stars m LEFT JOIN group_evaluations e ON e.course_number = $1 AND e.group_number = m.group_number
    GROUP BY m.group_number, e.completed, e.presented, e.notes ORDER BY m.group_number`, [course]);
  return groups.rows;
}
