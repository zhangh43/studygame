import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/auth/resetpassword/route";
import { db } from "../src/lib/db";
import { verifyPassword } from "../src/lib/auth";
import { makeTranslator, translateApiError } from "../src/lib/i18n";

function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/auth/resetpassword", {
    method: "POST",
    headers: { origin, host: "localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { identifier: " Alice ", password: "new-password", credential: "whoisyourteacher" };

test("invalid credentials, passwords, payloads, and origins cannot access the database", async (t) => {
  const connect = t.mock.method(db, "connect", () => { throw new Error("Unexpected database access"); });
  for (const body of [
    { ...valid, credential: "wrong" },
    { ...valid, credential: "WHOISYOURTEACHER" },
    { ...valid, credential: "whoisyourteacher " },
    { ...valid, credential: undefined },
    { ...valid, password: "short" },
    { ...valid, password: "a".repeat(201) },
    { ...valid, identifier: " " },
    null,
  ]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal((await POST(request(valid, "https://other.example"))).status, 403);
  const malformed = request(valid);
  t.mock.method(malformed, "json", async () => { throw new SyntaxError(); });
  assert.equal((await POST(malformed)).status, 400);
  assert.equal(connect.mock.callCount(), 0);
});

test("reset hashes the new password and revokes sessions in a transaction", async (t) => {
  const queries: { sql: string; values?: unknown[] }[] = [];
  let released = false;
  t.mock.method(db, "connect", async () => ({
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      return { rows: sql.startsWith("UPDATE") ? [{ id: "alice-id" }] : [] };
    },
    release: () => { released = true; },
  }));
  const response = await POST(request(valid));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(queries[0].sql, "BEGIN");
  assert.equal(queries[1].values?.[1], "alice");
  const hash = queries[1].values?.[0] as string;
  assert.notEqual(hash, valid.password);
  assert.equal(await verifyPassword(valid.password, hash), true);
  assert.equal(await verifyPassword("old-password", hash), false);
  assert.deepEqual(queries[2], { sql: "DELETE FROM sessions WHERE user_id = $1", values: ["alice-id"] });
  assert.equal(queries[3].sql, "COMMIT");
  assert.equal(released, true);
});

test("missing accounts fail and database failures roll back", async (t) => {
  for (const fail of [false, true]) {
    const queries: string[] = [];
    let released = false;
    const connect = t.mock.method(db, "connect", async () => ({
      query: async (sql: string) => {
        queries.push(sql);
        if (fail && sql.startsWith("DELETE")) throw new Error("Database unavailable");
        return { rows: fail && sql.startsWith("UPDATE") ? [{ id: "alice-id" }] : [] };
      },
      release: () => { released = true; },
    }));
    const response = await POST(request(valid));
    assert.equal(response.status, fail ? 500 : 400);
    assert.equal(queries.at(-1), fail ? "ROLLBACK" : "COMMIT");
    if (!fail) assert.equal(queries.some((sql) => sql.startsWith("DELETE")), false);
    assert.equal(released, true);
    connect.mock.restore();
  }
});

test("reset feedback supports English and Chinese", async () => {
  const response = await POST(request({ ...valid, credential: "wrong" }));
  const { error } = await response.json();
  assert.equal(translateApiError("en", error, "fallback"), error);
  assert.equal(translateApiError("zh", error, "fallback"), "密码重置失败，请检查用户名、新密码和重置凭据。");
  assert.equal(makeTranslator("en")("auth.resetPassword"), "Reset password");
  assert.equal(makeTranslator("zh")("auth.resetPassword"), "重置密码");
});
