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
    assert.equal((await request("/admin", undefined, admin)).status, 200);
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
    assert.equal((await request("/api/admin", { action: "user", userId: users[0].id, courseNumber: "C1", groupNumber: "", password: "changed123" }, admin)).status, 200);
    assert.equal((await sheet("C1"))[0].stars, 1);
    assert.equal((await request("/api/auth/login", { identifier: users[0].email, password: "initial123" })).status, 401);
    await login(users[0].email, "changed123");
    assert.equal((await pool.query("SELECT 1 FROM sessions WHERE user_id = $1", [users[0].id])).rowCount, 1);
    assert.equal((await request("/api/auth/resetpassword", { identifier: "admin", password: "hijacked123", credential: "whoisyourteacher" })).status, 400);
    const otherAdmin = await login("admin", "admin123");
    assert.equal((await request("/api/admin", { action: "password", currentPassword: "wrong", password: "newadmin123" }, admin)).status, 400);
    assert.equal((await request("/api/admin", { action: "password", currentPassword: "admin123", password: "newadmin123" }, admin)).status, 200);
    assert.equal((await request("/api/admin?course=C1", undefined, otherAdmin)).status, 403);
    assert.equal((await request("/api/auth/login", { identifier: "admin", password: "admin123" })).status, 401);
    const updatedAdmin = await login("admin", "newadmin123");
    assert.equal((await request("/api/admin", { action: "password", currentPassword: "newadmin123", password: "admin123" }, updatedAdmin)).status, 200);
  } finally { await pool.end(); }
});
