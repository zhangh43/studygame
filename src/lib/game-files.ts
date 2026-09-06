import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { GAME_POLICY } from "@/lib/harness/prompt";
import { configuredProtectedValues } from "@/lib/secrets";

const MAX_HTML_BYTES = 2 * 1024 * 1024;

const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New game</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #f9fafb; font-family: system-ui, sans-serif; }
    main { max-width: 42rem; padding: 2rem; text-align: center; }
  </style>
</head>
<body>
  <main><h1>Your game is ready to be imagined.</h1><p>Describe it in the chat to begin.</p></main>
</body>
</html>
`;

function safeScopedPath(root: string, tenantId: string, gameId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[0-9a-f-]{36}$/i.test(gameId)) {
    throw new Error("Invalid workspace identifier");
  }
  const resolved = path.resolve(root, tenantId, gameId);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error("Workspace escaped its configured root");
  }
  return resolved;
}

export function workspacePath(tenantId: string, gameId: string): string {
  return safeScopedPath(config.workspaceRoot(), tenantId, gameId);
}

export async function ensureWorkspace(tenantId: string, gameId: string): Promise<string> {
  const workspace = workspacePath(tenantId, gameId);
  await mkdir(workspace, { recursive: true });
  await writeFile(
    path.join(workspace, "AGENTS.md"),
    `# Game workspace instructions\n\n${GAME_POLICY}\n`,
    "utf8",
  );
  const htmlPath = path.join(workspace, "index.html");
  try {
    await stat(htmlPath);
  } catch {
    await writeFile(htmlPath, STARTER_HTML, { encoding: "utf8", flag: "wx" });
  }
  return workspace;
}

export async function readDraft(tenantId: string, gameId: string): Promise<string> {
  const file = path.join(workspacePath(tenantId, gameId), "index.html");
  return readFile(file, "utf8");
}

export async function writeDraft(tenantId: string, gameId: string, html: string): Promise<void> {
  const file = path.join(workspacePath(tenantId, gameId), "index.html");
  await writeFile(file, html, "utf8");
}

export type ValidationResult = { ok: true; html: string } | { ok: false; errors: string[] };

export async function validateDraft(tenantId: string, gameId: string): Promise<ValidationResult> {
  let html: string;
  const file = path.join(workspacePath(tenantId, gameId), "index.html");
  try {
    const info = await stat(file);
    if (!info.isFile()) return { ok: false, errors: ["index.html is not a file"] };
    if (info.size > MAX_HTML_BYTES) {
      return { ok: false, errors: ["index.html exceeds the 2 MB limit"] };
    }
    html = await readFile(file, "utf8");
  } catch {
    return { ok: false, errors: ["index.html is missing"] };
  }

  const errors: string[] = [];
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    errors.push("index.html must contain html and body elements");
  }
  const forbidden: Array<[RegExp, string]> = [
    [/<\s*(iframe|object|embed|base|form)\b/i, "embedded documents and forms are not allowed"],
    [/\bhttps?:\/\//i, "external HTTP URLs are not allowed"],
    [/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/i, "network APIs are not allowed"],
    [/navigator\.sendBeacon\s*\(/i, "sendBeacon is not allowed"],
    [/document\.cookie/i, "cookie access is not allowed"],
    [/\b(localStorage|sessionStorage)\b/i, "browser storage is not allowed"],
    [/window\.open\s*\(/i, "opening new windows is not allowed"],
    [/(?:window\.)?(?:top|parent)\s*[.[]/i, "parent-window access is not allowed"],
    [/<script[^>]+src\s*=/i, "external scripts are not allowed"],
    [/<link[^>]+href\s*=/i, "external stylesheets are not allowed"],
  ];
  for (const [pattern, message] of forbidden) {
    if (pattern.test(html)) errors.push(message);
  }
  for (const secret of configuredProtectedValues()) {
    if (html.includes(secret.value)) {
      errors.push(`generated HTML contained the protected value ${secret.name}`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, html };
}

export function createPublicSlug(title: string): string {
  const prefix = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "game";
  return `${prefix}-${randomBytes(5).toString("base64url").toLowerCase()}`;
}

export async function snapshotPublishedGame(
  tenantId: string,
  gameId: string,
  slug: string,
  revision: number,
): Promise<{ artifactPath: string; sha256: string }> {
  const validation = await validateDraft(tenantId, gameId);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  const targetDir = path.resolve(config.publishedRoot(), slug, String(revision));
  if (!targetDir.startsWith(`${config.publishedRoot()}${path.sep}`)) {
    throw new Error("Invalid publication path");
  }
  await mkdir(targetDir, { recursive: true });
  const artifactPath = path.join(targetDir, "index.html");
  await copyFile(path.join(workspacePath(tenantId, gameId), "index.html"), artifactPath);
  return {
    artifactPath,
    sha256: createHash("sha256").update(validation.html).digest("hex"),
  };
}

export const gameContentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "sandbox allow-scripts",
].join("; ");
