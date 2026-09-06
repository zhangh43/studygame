import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isTrustedMutation } from "@/lib/auth";
import { db, queryOne } from "@/lib/db";
import { ensureWorkspace, readDraft, validateDraft, writeDraft } from "@/lib/game-files";
import { getGameHarness, type HarnessEvent } from "@/lib/harness";
import { redactProtectedValues } from "@/lib/secrets";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ message: z.string().trim().min(1).max(12_000) });
type GameRow = { id: string; threadId: string | null; revision: number };

function htmlHash(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

function sse(controller: ReadableStreamDefaultController, event: HarnessEvent | { type: "error"; message: string } | { type: "revision"; revision: number }) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  const { id } = await context.params;
  const game = await queryOne<GameRow>(
    `SELECT id, harness_thread_id AS "threadId", draft_revision AS revision
       FROM games WHERE id = $1 AND tenant_id = $2`,
    [id, session.tenantId],
  );
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  let jobId: string;
  try {
    const result = await db.query<{ id: string }>(
      `INSERT INTO generation_jobs(tenant_id, game_id, status)
       VALUES ($1, $2, 'running') RETURNING id`,
      [session.tenantId, id],
    );
    jobId = result.rows[0].id;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "This game already has a generation in progress." }, { status: 409 });
    }
    throw error;
  }

  await db.query(
    "INSERT INTO messages(tenant_id, game_id, role, content) VALUES ($1, $2, 'user', $3)",
    [session.tenantId, id, parsed.data.message],
  );
  const workspace = await ensureWorkspace(session.tenantId, id);
  const initialDraft = await readDraft(session.tenantId, id);
  const initialDraftHash = htmlHash(initialDraft);

  const stream = new ReadableStream({
    async start(controller) {
      let sessionId = game.threadId;
      let assistantMessage = "The game was updated successfully.";
      try {
        const runHarness = async (message: string) => {
          for await (const event of getGameHarness().run({
            workspace,
            sessionId,
            message,
            signal: request.signal,
          })) {
            if (event.type === "session") {
              sessionId = event.sessionId;
              await db.query(
                `UPDATE games SET harness_thread_id = $1
                  WHERE id = $2 AND tenant_id = $3`,
                [sessionId, id, session.tenantId],
              );
            }
            if (event.type === "assistant") {
              assistantMessage = redactProtectedValues(event.message)
                .replaceAll(workspace, "")
                .replace(/\[index\.html\]\([^)]*\)/g, "index.html");
            } else if (event.type !== "done") {
              sse(
                controller,
                event.type === "activity"
                  ? { ...event, message: redactProtectedValues(event.message) }
                  : event,
              );
            }
          }
        };

        await runHarness(parsed.data.message);
        let validation = await validateDraft(session.tenantId, id);
        if (!validation.ok) {
          sse(controller, { type: "activity", message: "Repairing validation problems" });
          await runHarness(
            `The generated index.html failed publication validation. Fix all of these problems without changing the requested game:\n- ${validation.errors.join("\n- ")}`,
          );
          validation = await validateDraft(session.tenantId, id);
        }
        if (!validation.ok) throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
        if (htmlHash(validation.html) === initialDraftHash) {
          throw new Error("The coding agent completed without changing index.html.");
        }

        const updated = await db.query<{ revision: number }>(
          `UPDATE games SET draft_revision = draft_revision + 1, updated_at = now()
            WHERE id = $1 AND tenant_id = $2 RETURNING draft_revision AS revision`,
          [id, session.tenantId],
        );
        await db.query(
          "INSERT INTO messages(tenant_id, game_id, role, content) VALUES ($1, $2, 'assistant', $3)",
          [session.tenantId, id, assistantMessage],
        );
        await db.query(
          "UPDATE generation_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
          [jobId],
        );
        sse(controller, { type: "assistant", message: assistantMessage });
        sse(controller, { type: "revision", revision: updated.rows[0].revision });
        sse(controller, { type: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed";
        console.error("Harness generation failed", error);
        await db.query(
          "UPDATE generation_jobs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1",
          [jobId, message.slice(0, 2_000)],
        );
        await writeDraft(session.tenantId, id, initialDraft).catch((restoreError) => {
          console.error("Could not restore the previous draft", restoreError);
        });
        const publicMessage = message.startsWith("Validation failed:")
          ? message
          : "The coding agent could not complete this request. Please try again.";
        sse(controller, { type: "error", message: publicMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
