import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPublicSlug, ensureWorkspace, validateDraft, workspacePath } from "../src/lib/game-files";

const tenantId = "11111111-1111-4111-8111-111111111111";
const gameId = "22222222-2222-4222-8222-222222222222";

test("workspace paths stay under the configured root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "game-studio-test-"));
  process.env.WORKSPACE_ROOT = root;
  const workspace = await ensureWorkspace(tenantId, gameId);
  assert.equal(workspace, path.join(root, tenantId, gameId));
  assert.equal(workspacePath(tenantId, gameId), workspace);
  assert.throws(() => workspacePath("../../etc", gameId));
});

test("validation accepts a self-contained game and rejects network access", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "game-studio-test-"));
  process.env.WORKSPACE_ROOT = root;
  const workspace = await ensureWorkspace(tenantId, gameId);
  await writeFile(path.join(workspace, "index.html"), "<!doctype html><html><body><canvas></canvas><script>let score = 0;</script></body></html>");
  assert.deepEqual(await validateDraft(tenantId, gameId), {
    ok: true,
    html: "<!doctype html><html><body><canvas></canvas><script>let score = 0;</script></body></html>",
  });
  await writeFile(path.join(workspace, "index.html"), "<html><body><script>fetch('https://example.com')</script></body></html>");
  const invalid = await validateDraft(tenantId, gameId);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.errors.length >= 2);
});

test("public slugs are readable and randomized", () => {
  const first = createPublicSlug("Space Runner!");
  const second = createPublicSlug("Space Runner!");
  assert.match(first, /^space-runner-[a-z0-9_-]+$/);
  assert.notEqual(first, second);
});

test("validation rejects configured secrets in generated HTML", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "game-studio-test-"));
  process.env.WORKSPACE_ROOT = root;
  process.env.SESSION_SECRET = "test-secret-that-must-never-be-published";
  const workspace = await ensureWorkspace(tenantId, gameId);
  await writeFile(
    path.join(workspace, "index.html"),
    `<html><body><script>const leaked = "${process.env.SESSION_SECRET}";</script></body></html>`,
  );
  const result = await validateDraft(tenantId, gameId);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((error) => error.includes("SESSION_SECRET")));
});
