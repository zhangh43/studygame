import assert from "node:assert/strict";
import test from "node:test";
import { adminMutation } from "../src/lib/admin";
import { Pool } from "pg";

test("admin input validates optional assignments and prevents editable star totals", () => {
  const user = { action: "user", userId: "65fda5f0-997b-4e8d-bd99-7eb6c681e588", courseNumber: " CS 01 ", groupNumber: " " };
  assert.deepEqual(adminMutation.parse(user), { ...user, courseNumber: "CS 01", groupNumber: null });
  assert.equal(adminMutation.safeParse({ ...user, password: "short" }).success, false);
  assert.equal(adminMutation.safeParse({ ...user, isAdmin: true }).success, false);
  const evaluation = { action: "evaluation", courseNumber: "CS 01", groupNumber: "A", completed: true, presented: false, notes: "Done" };
  assert.equal(adminMutation.safeParse(evaluation).success, true);
  assert.equal(adminMutation.safeParse({ ...evaluation, stars: 100 }).success, false);
  assert.equal(adminMutation.safeParse({ ...evaluation, courseNumber: " " }).success, false);
});

test("lesson validation requires one optional winner and 10–20 lessons", () => {
  for (const count of [0, 9, 21, 10.5]) assert.equal(adminMutation.safeParse({ action: "lessons", courseNumber: "C1", count }).success, false);
  for (const count of [10, 15, 20]) assert.equal(adminMutation.safeParse({ action: "lessons", courseNumber: "C1", count }).success, true);
  const star = { action: "lessonStar", courseNumber: "C1", lessonId: "65fda5f0-997b-4e8d-bd99-7eb6c681e588", groupNumber: "A" };
  assert.equal(adminMutation.safeParse(star).success, true);
  assert.equal(adminMutation.safeParse({ ...star, groupNumber: null }).success, true);
  assert.equal(adminMutation.safeParse({ ...star, groupNumber: ["A", "B"] }).success, false);
  assert.equal(adminMutation.safeParse({ ...star, groupNumber: " " }).success, false);
});

test("user edits validate names and normalize login identifiers", () => {
  const user = { action: "user", userId: "65fda5f0-997b-4e8d-bd99-7eb6c681e588", courseNumber: "", groupNumber: "", displayName: " New Name ", identifier: " USER@Example.COM " };
  const parsed = adminMutation.parse(user);
  assert.ok(parsed.action === "user");
  assert.equal(parsed.displayName, "New Name");
  assert.equal(parsed.identifier, "user@example.com");
  for (const update of [{ displayName: " " }, { displayName: "x" }, { displayName: "x".repeat(81) }, { identifier: " " }, { identifier: "x".repeat(255) }]) {
    assert.equal(adminMutation.safeParse({ ...user, ...update }).success, false);
  }
  assert.equal(adminMutation.safeParse({ action: "deleteUser", userId: user.userId }).success, true);
  assert.equal(adminMutation.safeParse({ action: "deleteUser", userId: "invalid" }).success, false);
});

// Opt in only against a freshly migrated disposable database and a server using it.
const base = process.env.ADMIN_TEST_URL;
test("admin HTTP flows and real PostgreSQL star aggregation", { skip: !base || !process.env.ADMIN_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.ADMIN_TEST_DATABASE_URL });
  async function request(path: string, body?: unknown, cookie = "", origin = base!) {
    const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { origin, cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual" });
    return response;
  }
  async function login(identifier: string, password: string) {
    const response = await request("/api/auth/login", { identifier, password });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  try {
    assert.equal((await request("/api/admin?course=C1")).status, 403);
    const admin = await login("admin", "admin123");
    for (const [locale, usersTitle, evaluationsTitle] of [["en", "User management", "Course evaluations"], ["zh", "用户管理", "课程评价"]]) {
      for (const [path, title] of [["/admin", usersTitle], ["/admin/evaluations", evaluationsTitle]]) {
        const page = await request(path, undefined, `${admin}; locale=${locale}`);
        assert.equal(page.status, 200);
        assert.ok((await page.text()).includes(`<h1>${title}</h1>`));
      }
    }
    const suffix = Date.now().toString();
    const names = ["alice", "bob", "carol"].map(name => `${name}-${suffix}`);
    for (const identifier of names) assert.equal((await request("/api/auth/register", { name: identifier, identifier, password: "initial123" })).status, 200);
    const regular = await login(names[0], "initial123");
    assert.equal((await request("/api/admin?course=C1", undefined, regular)).status, 403);
    assert.equal((await request("/api/admin", { action: "signup", enabled: false }, regular)).status, 403);
    assert.equal((await request("/api/admin", { action: "signup", enabled: false }, admin, "https://evil.example")).status, 403);
    assert.equal((await request("/api/admin", { action: "signup", enabled: false }, admin)).status, 200);
    assert.equal((await request("/api/auth/register", { name: "Blocked", identifier: `blocked-${suffix}`, password: "initial123" })).status, 403);
    assert.match(await (await request("/register")).text(), /New user signup is currently disabled/);
    assert.equal((await request("/api/admin", { action: "signup", enabled: true }, admin)).status, 200);
    const users = (await pool.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE email = ANY($1) ORDER BY email", [names])).rows;
    for (let i = 0; i < users.length; i++) assert.equal((await request("/api/admin", { action: "user", userId: users[i].id, courseNumber: i === 2 ? "C2" : "C1", groupNumber: "01" }, admin)).status, 200);
    const games: string[] = [];
    for (const user of [users[0], users[0], users[1], users[2]]) {
      const game = await pool.query(`INSERT INTO games(tenant_id, creator_user_id, title, public_slug) SELECT tenant_id, user_id, 'Test', gen_random_uuid()::text FROM tenant_memberships WHERE user_id = $1 RETURNING id`, [user.id]);
      games.push(game.rows[0].id);
    }
    for (const [index, game] of games.entries()) {
      await pool.query("INSERT INTO game_stars(game_id, user_id) VALUES ($1, $2)", [game, users[0].id]);
      if (index === 0) await pool.query("INSERT INTO game_stars(game_id, user_id) VALUES ($1, $2)", [game, users[1].id]);
    }
    async function sheet(course: string) { return (await (await request(`/api/admin?course=${course}`, undefined, admin)).json()).groups; }
    let groups = await sheet("C1");
    assert.equal(groups.length, 1); assert.equal(groups[0].stars, 4); assert.equal(groups[0].members.length, 2);
    assert.equal((await sheet("C2"))[0].stars, 1);
    const evaluation = { action: "evaluation", courseNumber: "C1", groupNumber: "01", completed: true, presented: true, notes: "Presented in class" };
    assert.equal((await request("/api/admin", { ...evaluation, stars: 99 }, admin)).status, 400);
    assert.equal((await request("/api/admin", evaluation, admin)).status, 200);
    groups = await sheet("C1"); assert.equal(groups[0].completed, true); assert.equal(groups[0].presented, true); assert.equal(groups[0].notes, evaluation.notes);
    assert.equal((await sheet("C2"))[0].completed, false);
    await pool.query("DELETE FROM game_stars WHERE game_id = $1 AND user_id = $2", [games[0], users[1].id]);
    assert.equal((await sheet("C1"))[0].stars, 3);
    const secondSession = await login(users[0].email, "initial123");
    const otherUserSession = await login(users[1].email, "initial123");
    const changeUser = { action: "user", userId: users[0].id, courseNumber: "C1", groupNumber: "01" };
    const originalHash = (await pool.query("SELECT password_hash FROM users WHERE id = $1", [users[0].id])).rows[0].password_hash;
    const sessionCount = (await pool.query("SELECT 1 FROM sessions WHERE user_id = $1", [users[0].id])).rowCount;
    for (const password of ["", "short", "a".repeat(201)]) {
      assert.equal((await request("/api/admin", { ...changeUser, password }, admin)).status, 400);
    }
    for (const cookie of ["", regular]) {
      assert.equal((await request("/api/admin", { ...changeUser, password: "changed123" }, cookie)).status, 403);
    }
    assert.equal((await request("/api/admin", { ...changeUser, password: "changed123" }, admin, "https://evil.example")).status, 403);
    const adminId = (await pool.query("SELECT id FROM users WHERE email = 'admin'")).rows[0].id;
    for (const userId of [adminId, "00000000-0000-4000-8000-000000000000"]) {
      assert.equal((await request("/api/admin", { ...changeUser, userId, password: "changed123" }, admin)).status, 404);
    }
    // An omitted password preserves the password and every existing session.
    assert.equal((await request("/api/admin", changeUser, admin)).status, 200);
    assert.equal((await pool.query("SELECT password_hash FROM users WHERE id = $1", [users[0].id])).rows[0].password_hash, originalHash);
    assert.equal((await pool.query("SELECT 1 FROM sessions WHERE user_id = $1", [users[0].id])).rowCount, sessionCount);
    assert.equal((await request("/api/games", undefined, regular)).status, 200);
    assert.equal((await request("/api/admin", { ...changeUser, groupNumber: "", password: "changed123" }, admin)).status, 200);
    assert.equal((await pool.query("SELECT 1 FROM sessions WHERE user_id = $1", [users[0].id])).rowCount, 0);
    for (const cookie of [regular, secondSession]) assert.equal((await request("/api/games", undefined, cookie)).status, 401);
    assert.equal((await request("/api/games", undefined, otherUserSession)).status, 200);
    assert.equal((await sheet("C1"))[0].stars, 1);
    assert.equal((await request("/api/auth/login", { identifier: users[0].email, password: "initial123" })).status, 401);
    const changedSession = await login(users[0].email, "changed123");
    assert.equal((await request("/api/games", undefined, changedSession)).status, 200);
    assert.equal((await pool.query("SELECT 1 FROM sessions WHERE user_id = $1", [users[0].id])).rowCount, 1);
    // Independent lesson records, course isolation, and single-winner awards.
    assert.equal((await request("/admin/evaluations", undefined, admin)).status, 200);
    assert.equal((await request("/admin/evaluations", undefined, regular)).status, 307);
    for (let i = 0; i < users.length; i++) {
      assert.equal((await request("/api/admin", { action: "user", userId: users[i].id, courseNumber: i === 2 ? "L2" : "L1", groupNumber: i === 1 ? "B" : "A" }, admin)).status, 200);
    }
    for (const courseNumber of ["L1", "L2"]) {
      assert.equal((await request("/api/admin", { action: "lessons", courseNumber, count: 10 }, admin)).status, 200);
    }
    async function fullSheet(course: string) { return (await request(`/api/admin?course=${course}`, undefined, admin)).json(); }
    const initialLessons = (await fullSheet("L1")).lessons;
    assert.equal(initialLessons.length, 10);
    const first = initialLessons[0].id, second = initialLessons[1].id;
    const lessonEvaluation = { action: "lessonEvaluation", courseNumber: "L1", lessonId: first, groupNumber: "A", completed: true, presented: false, notes: "Lesson one" };
    assert.equal((await request("/api/admin", lessonEvaluation, admin)).status, 200);
    assert.equal((await request("/api/admin", { ...lessonEvaluation, lessonId: second, completed: false, presented: true, notes: "Lesson two" }, admin)).status, 200);
    assert.equal((await request("/api/admin", { ...lessonEvaluation, courseNumber: "L2" }, admin)).status, 404);
    assert.equal((await request("/api/admin", { ...lessonEvaluation, groupNumber: "missing" }, admin)).status, 404);
    const star = { action: "lessonStar", courseNumber: "L1", lessonId: first, groupNumber: "A" };
    assert.equal((await request("/api/admin", star, regular)).status, 403);
    assert.equal((await request("/api/admin", { ...star, courseNumber: "L2" }, admin)).status, 404);
    assert.equal((await request("/api/admin", { ...star, groupNumber: "missing" }, admin)).status, 404);
    assert.equal((await request("/api/admin", star, admin)).status, 200);
    assert.equal((await request("/api/admin", { ...star, groupNumber: "B" }, admin)).status, 200);
    let lessonSheet = await fullSheet("L1");
    assert.equal(lessonSheet.lessons[0].starGroupNumber, "B");
    assert.equal(lessonSheet.lessons[1].starGroupNumber, null);
    assert.equal(lessonSheet.evaluations.length, 2);
    assert.equal(lessonSheet.evaluations.filter((item: { completed: boolean }) => item.completed).length, 1);
    assert.equal(lessonSheet.evaluations.filter((item: { presented: boolean }) => item.presented).length, 1);
    assert.equal((await fullSheet("L2")).evaluations.length, 0);
    // Concurrent award changes still leave exactly one winner.
    const concurrent = await Promise.all([request("/api/admin", star, admin), request("/api/admin", { ...star, groupNumber: "B" }, admin)]);
    assert.ok(concurrent.every(response => response.status === 200));
    assert.ok(["A", "B"].includes((await fullSheet("L1")).lessons[0].starGroupNumber));
    assert.equal((await request("/api/admin", { ...star, groupNumber: null }, admin)).status, 200);
    assert.equal((await fullSheet("L1")).lessons[0].starGroupNumber, null);
    assert.equal((await request("/api/admin", { action: "lessons", courseNumber: "L1", count: 20 }, admin)).status, 200);
    assert.equal((await request("/api/admin", { action: "lessons", courseNumber: "L1", count: 10 }, admin)).status, 200);
    lessonSheet = await fullSheet("L1");
    assert.equal(lessonSheet.lessons.length, 20);
    assert.equal(lessonSheet.lessons[0].id, first);
    assert.equal(lessonSheet.evaluations.length, 2);
    // Existing final evaluations and lesson history survive membership changes.
    assert.equal((await fullSheet("C1")).groups[0].notes, "Presented in class");
    assert.equal((await fullSheet("C1")).groups[0].members.length, 0);
    assert.equal((await request("/api/admin", { action: "user", userId: users[0].id, courseNumber: "", groupNumber: "" }, admin)).status, 200);
    assert.equal((await fullSheet("L1")).groups.find((group: { groupNumber: string }) => group.groupNumber === "A").members.length, 0);
    assert.equal((await request("/api/admin", { ...lessonEvaluation, notes: "Retained history" }, admin)).status, 200);
    assert.equal((await request("/api/auth/resetpassword", { identifier: "admin", password: "hijacked123", credential: "whoisyourteacher" })).status, 400);
    const otherAdmin = await login("admin", "admin123");
    assert.equal((await request("/api/admin", { action: "password", currentPassword: "wrong", password: "newadmin123" }, admin)).status, 400);
    assert.equal((await request("/api/admin", { action: "password", currentPassword: "admin123", password: "newadmin123" }, admin)).status, 200);
    assert.equal((await request("/api/admin?course=C1", undefined, otherAdmin)).status, 403);
    assert.equal((await request("/api/auth/login", { identifier: "admin", password: "admin123" })).status, 401);
    const updatedAdmin = await login("admin", "newadmin123");
    assert.equal((await request("/api/admin", { action: "password", currentPassword: "newadmin123", password: "admin123" }, updatedAdmin)).status, 200);
    const target = users[2];
    const renamed = `renamed-${suffix}@example.com`;
    const edit = { action: "user", userId: target.id, courseNumber: "L2", groupNumber: "A", displayName: "Updated Display Name", identifier: ` ${renamed.toUpperCase()} ` };
    const actor = updatedAdmin;
    const regularActive = await login(users[1].email, "initial123");
    assert.equal((await request("/api/admin", edit, regularActive)).status, 403);
    assert.equal((await request("/api/admin", edit, actor)).status, 200);
    const renamedRow = (await pool.query("SELECT email, display_name FROM users WHERE id = $1", [target.id])).rows[0];
    assert.equal(renamedRow.email, renamed);
    assert.equal(renamedRow.display_name, edit.displayName);
    assert.equal((await request("/api/auth/login", { identifier: target.email, password: "initial123" })).status, 401);
    const renamedSession = await login(renamed, "initial123");
    assert.equal((await request("/api/admin", { ...edit, identifier: users[1].email.toUpperCase(), displayName: "Should roll back" }, actor)).status, 409);
    assert.equal((await pool.query("SELECT display_name FROM users WHERE id = $1", [target.id])).rows[0].display_name, edit.displayName);
    assert.equal((await request("/api/admin", { ...edit, identifier: " ADMIN " }, actor)).status, 409);
    assert.equal((await request("/api/admin", { ...edit, userId: adminId }, actor)).status, 404);
    assert.equal((await request("/api/admin", { action: "deleteUser", userId: adminId }, actor)).status, 404);
    const ownGame = games[3];
    await pool.query("INSERT INTO game_comments(game_id, user_id, body) VALUES ($1, $2, 'Comment')", [games[0], target.id]);
    await pool.query("INSERT INTO game_stars(game_id, user_id) VALUES ($1, $2)", [games[0], target.id]);
    await pool.query("INSERT INTO messages(tenant_id, game_id, role, content) SELECT tenant_id, id, 'user', 'test' FROM games WHERE id = $1", [ownGame]);
    await pool.query("INSERT INTO generation_jobs(tenant_id, game_id, status) SELECT tenant_id, id, 'succeeded' FROM games WHERE id = $1", [ownGame]);
    const beforeDelete = await fullSheet("L1");
    const remove = { action: "deleteUser", userId: target.id };
    assert.equal((await request("/api/admin", remove)).status, 403);
    assert.equal((await request("/api/admin", remove, regularActive)).status, 403);
    assert.equal((await request("/api/admin", remove, actor, "https://evil.example")).status, 403);
    assert.equal((await request("/api/admin", remove, actor)).status, 200);
    for (const table of ["users", "games", "sessions", "tenant_memberships", "game_comments", "game_stars"]) {
      const column = table === "users" ? "id" : table === "games" ? "creator_user_id" : "user_id";
      assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [target.id])).rowCount, 0, table);
    }
    for (const table of ["messages", "generation_jobs", "game_stars"]) assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE game_id = $1`, [ownGame])).rowCount, 0);
    assert.equal((await request("/api/auth/login", { identifier: renamed, password: "initial123" })).status, 401);
    assert.equal((await request("/dashboard", undefined, renamedSession)).status, 307);
    assert.equal((await request("/api/admin", remove, actor)).status, 404);
    assert.equal((await pool.query("SELECT 1 FROM games WHERE id = $1", [games[0]])).rowCount, 1);
    assert.deepEqual((await fullSheet("L1")).evaluations, beforeDelete.evaluations);
  } finally { await pool.end(); }
});
