import { z } from "zod";
import { db, queryOne } from "@/lib/db";

export const optionalNumber = z.string().trim().max(100).transform(value => value || null);
const courseNumber = z.string().trim().min(1).max(100);
const groupNumber = z.string().trim().min(1).max(100);
export const adminMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lessons"), courseNumber, count: z.number().int().min(10).max(20) }).strict(),
  z.object({ action: z.literal("lessonEvaluation"), courseNumber, lessonId: z.uuid(), groupNumber, completed: z.boolean(), presented: z.boolean(), notes: z.string().max(4000) }).strict(),
  z.object({ action: z.literal("lessonStar"), courseNumber, lessonId: z.uuid(), groupNumber: groupNumber.nullable() }).strict(),
  z.object({ action: z.literal("signup"), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("user"), userId: z.uuid(), groupNumber: optionalNumber, courseNumber: optionalNumber, password: z.string().min(6).max(200).optional(), displayName: z.string().trim().min(2).max(80).optional(), identifier: z.string().trim().toLowerCase().min(1).max(254).optional() }).strict(),
  z.object({ action: z.literal("deleteUser"), userId: z.uuid() }).strict(),
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
    , group_numbers AS (
      SELECT group_number FROM member_stars
      UNION SELECT group_number FROM group_evaluations WHERE course_number = $1
      UNION SELECT e.group_number FROM lesson_evaluations e JOIN course_lessons l ON l.id = e.lesson_id WHERE l.course_number = $1
      UNION SELECT star_group_number FROM course_lessons WHERE course_number = $1 AND star_group_number IS NOT NULL
    )
    SELECT n.group_number AS "groupNumber",
           coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'email', m.email) ORDER BY m.email) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS members,
           coalesce(sum(m.stars), 0)::integer AS stars,
           coalesce(e.completed, false) AS completed, coalesce(e.presented, false) AS presented,
           coalesce(e.notes, '') AS notes
    FROM group_numbers n LEFT JOIN member_stars m ON m.group_number = n.group_number
    LEFT JOIN group_evaluations e ON e.course_number = $1 AND e.group_number = n.group_number
    GROUP BY n.group_number, e.completed, e.presented, e.notes ORDER BY n.group_number`, [course]);
  return groups.rows;
}

export type Lesson = { id: string; lessonNumber: number; starGroupNumber: string | null };
export type LessonEvaluation = { lessonId: string; groupNumber: string; completed: boolean; presented: boolean; notes: string };
export type CourseSheet = { groups: GroupEvaluation[]; lessons: Lesson[]; evaluations: LessonEvaluation[] };
export async function courseLessons(course: string) {
  return (await db.query<Lesson>(`SELECT id, lesson_number AS "lessonNumber", star_group_number AS "starGroupNumber" FROM course_lessons WHERE course_number = $1 ORDER BY lesson_number`, [course])).rows;
}
export async function lessonEvaluations(course: string) {
  return (await db.query<LessonEvaluation>(`SELECT e.lesson_id AS "lessonId", e.group_number AS "groupNumber", e.completed, e.presented, e.notes FROM lesson_evaluations e JOIN course_lessons l ON l.id = e.lesson_id WHERE l.course_number = $1`, [course])).rows;
}
export async function evaluationCourses() {
  return (await db.query<{ courseNumber: string }>(`SELECT course_number AS "courseNumber" FROM users WHERE course_number IS NOT NULL AND NOT is_admin UNION SELECT course_number FROM course_lessons UNION SELECT course_number FROM group_evaluations ORDER BY "courseNumber"`)).rows.map(row => row.courseNumber);
}
