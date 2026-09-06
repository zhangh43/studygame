import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { gameContentSecurityPolicy, readDraft } from "@/lib/game-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const game = await queryOne<{ id: string }>(
    "SELECT id FROM games WHERE id = $1 AND tenant_id = $2",
    [id, session.tenantId],
  );
  if (!game) return new Response("Not found", { status: 404 });
  try {
    const html = await readDraft(session.tenantId, id);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": gameContentSecurityPolicy,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
    });
  } catch {
    return new Response("Draft not found", { status: 404 });
  }
}
