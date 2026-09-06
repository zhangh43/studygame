import { config } from "@/lib/config";
import { CodexHarness } from "@/lib/harness/codex";
import type { GameHarness } from "@/lib/harness/types";

let harness: GameHarness | undefined;

export function getGameHarness(): GameHarness {
  if (harness) return harness;
  const provider = config.harnessProvider();
  if (provider !== "codex") {
    throw new Error(`Unsupported HARNESS_PROVIDER: ${provider}`);
  }
  harness = new CodexHarness();
  return harness;
}

export type { GameHarness, HarnessEvent, HarnessRequest } from "@/lib/harness/types";
