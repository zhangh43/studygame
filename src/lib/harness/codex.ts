import path from "node:path";
import { Codex, type ThreadEvent, type ThreadItem } from "@openai/codex-sdk";
import { config } from "@/lib/config";
import { buildGamePrompt } from "@/lib/harness/prompt";
import type { GameHarness, HarnessEvent, HarnessRequest } from "@/lib/harness/types";

function activityFor(item: ThreadItem): HarnessEvent | null {
  switch (item.type) {
    case "file_change":
      return { type: "files", paths: item.changes.map((change) => path.basename(change.path)) };
    case "command_execution":
      return { type: "activity", message: "Building and checking the game" };
    case "reasoning":
      return { type: "activity", message: "Designing the next change" };
    case "error":
      return { type: "activity", message: item.message };
    default:
      return null;
  }
}

export class CodexHarness implements GameHarness {
  private readonly codex = new Codex({
    apiKey: config.openAiApiKey(),
    // Do not expose database/session configuration to the Codex child process.
    // Provider credentials are still required by the CLI and are checked again
    // by artifact validation before any generated HTML becomes accessible.
    env: Object.fromEntries(
      [
        "PATH",
        "HOME",
        "USER",
        "LOGNAME",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "CODEX_HOME",
        "AZURE_OPENAI_API_KEY",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
      ]
        .map((key) => [key, process.env[key]])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    ),
  });

  async *run(request: HarnessRequest): AsyncGenerator<HarnessEvent> {
    const startedAt = Date.now();
    let firstItemMs: number | null = null;
    let commandCount = 0;
    let commandMs = 0;
    const commandStartedAt = new Map<string, number>();
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    const options = {
      model: config.codexModel(),
      modelReasoningEffort: config.codexReasoningEffort(),
      workingDirectory: request.workspace,
      sandboxMode: "workspace-write" as const,
      approvalPolicy: "never" as const,
      networkAccessEnabled: false,
      webSearchMode: "disabled" as const,
      skipGitRepoCheck: true,
      threadSource: "tenant-game-studio",
    };

    const thread = request.sessionId
      ? this.codex.resumeThread(request.sessionId, options)
      : this.codex.startThread(options);
    const streamed = await thread.runStreamed(buildGamePrompt(request.message), {
      signal: request.signal,
    });

    try {
      for await (const event of streamed.events) {
        if (firstItemMs === null && event.type === "item.started") {
          firstItemMs = Date.now() - startedAt;
        }
        if (event.type === "item.started" && event.item.type === "command_execution") {
          commandStartedAt.set(event.item.id, Date.now());
        }
        if (event.type === "item.completed" && event.item.type === "command_execution") {
          commandCount += 1;
          const commandStart = commandStartedAt.get(event.item.id);
          if (commandStart !== undefined) commandMs += Date.now() - commandStart;
          commandStartedAt.delete(event.item.id);
        }
        if (event.type === "turn.completed") {
          inputTokens = event.usage.input_tokens;
          outputTokens = event.usage.output_tokens;
        }
        const mapped = this.mapEvent(event);
        if (mapped) yield mapped;
      }
    } finally {
      const totalMs = Date.now() - startedAt;
      console.info("Codex harness timing", {
        model: options.model ?? "provider-default",
        reasoningEffort: options.modelReasoningEffort ?? "provider-default",
        totalMs,
        firstItemMs,
        commandCount,
        commandMs,
        modelAndQueueMs: totalMs - commandMs,
        inputTokens,
        outputTokens,
      });
    }
    yield { type: "done" };
  }

  private mapEvent(event: ThreadEvent): HarnessEvent | null {
    if (event.type === "thread.started") {
      return { type: "session", sessionId: event.thread_id };
    }
    if (event.type === "turn.started") {
      return { type: "activity", message: "Codex is working" };
    }
    if (event.type === "turn.failed") throw new Error(event.error.message);
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "item.completed") {
      if (event.item.type === "agent_message") {
        return { type: "assistant", message: event.item.text };
      }
      return activityFor(event.item);
    }
    return null;
  }
}
