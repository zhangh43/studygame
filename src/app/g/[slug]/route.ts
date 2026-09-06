import { readFile } from "node:fs/promises";
import path from "node:path";
import { queryOne } from "@/lib/db";
import { config } from "@/lib/config";
import { gameContentSecurityPolicy } from "@/lib/game-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Published = { artifactPath: string; sha256: string };

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const published = await queryOne<Published>(
    `SELECT gv.artifact_path AS "artifactPath", gv.sha256
       FROM games g
       JOIN game_versions gv ON gv.game_id = g.id AND gv.revision = g.published_revision
      WHERE g.public_slug = $1 AND g.status = 'published'`,
    [slug],
  );
  if (!published) return new Response("Game not found", { status: 404 });

  const artifactPath = path.resolve(published.artifactPath);
  if (!artifactPath.startsWith(`${config.publishedRoot()}${path.sep}`)) {
    return new Response("Invalid artifact", { status: 500 });
  }
  try {
    const html = await readFile(artifactPath, "utf8");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": gameContentSecurityPolicy,
        "Cache-Control": "public, max-age=60",
        ETag: `"${published.sha256}"`,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
    });
  } catch {
    return new Response("Published artifact is unavailable", { status: 404 });
  }
}
