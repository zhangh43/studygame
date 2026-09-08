import path from "node:path";

const CODEX_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function codexReasoningEffort(): CodexReasoningEffort | undefined {
  const value = process.env.CODEX_REASONING_EFFORT;
  if (!value) return undefined;
  if (!CODEX_REASONING_EFFORTS.includes(value as CodexReasoningEffort)) {
    throw new Error(`CODEX_REASONING_EFFORT must be one of: ${CODEX_REASONING_EFFORTS.join(", ")}`);
  }
  return value as CodexReasoningEffort;
}

export const config = {
  databaseUrl: () => process.env.DATABASE_URL ?? "postgres://game_studio:game_studio@localhost:5432/game_studio",
  databasePoolMax: () => boundedInteger("DB_POOL_MAX", 30, 1, 90),
  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
  sessionSecret: () => required("SESSION_SECRET"),
  workspaceRoot: () => path.resolve(/* turbopackIgnore: true */ process.env.WORKSPACE_ROOT ?? "./data/workspaces"),
  publishedRoot: () => path.resolve(/* turbopackIgnore: true */ process.env.PUBLISHED_ROOT ?? "./data/published"),
  harnessProvider: () => process.env.HARNESS_PROVIDER ?? "codex",
  codexModel: () => process.env.CODEX_MODEL || undefined,
  codexReasoningEffort,
  harnessMaxConcurrency: () => boundedInteger("HARNESS_MAX_CONCURRENCY", 4, 1, 30),
  openAiApiKey: () => process.env.OPENAI_API_KEY || undefined,
  nodeEnv: () => process.env.NODE_ENV ?? "development",
};
