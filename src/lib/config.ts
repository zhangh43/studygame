import path from "node:path";

const CODEX_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
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
  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
  sessionSecret: () => required("SESSION_SECRET"),
  workspaceRoot: () => path.resolve(/* turbopackIgnore: true */ process.env.WORKSPACE_ROOT ?? "./data/workspaces"),
  publishedRoot: () => path.resolve(/* turbopackIgnore: true */ process.env.PUBLISHED_ROOT ?? "./data/published"),
  harnessProvider: () => process.env.HARNESS_PROVIDER ?? "codex",
  codexModel: () => process.env.CODEX_MODEL || undefined,
  codexReasoningEffort,
  openAiApiKey: () => process.env.OPENAI_API_KEY || undefined,
  nodeEnv: () => process.env.NODE_ENV ?? "development",
};
