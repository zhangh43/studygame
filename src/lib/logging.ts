import { redactProtectedValues } from "@/lib/secrets";

type LogContext = Record<string, unknown>;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[maximum log depth]";
  if (typeof value === "string") return redactProtectedValues(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item, depth + 1)]),
    );
  }
  return value;
}

export function serializeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return sanitize(error, depth);
  const extended = error as Error & { code?: unknown; errno?: unknown; syscall?: unknown; cause?: unknown };
  return sanitize({
    name: error.name,
    message: error.message,
    code: extended.code,
    errno: extended.errno,
    syscall: extended.syscall,
    stack: error.stack,
    cause: depth < 3 && extended.cause !== undefined ? serializeError(extended.cause, depth + 1) : undefined,
  });
}

function record(level: "info" | "warn" | "error", event: string, context: LogContext): string {
  return JSON.stringify(sanitize({ timestamp: new Date().toISOString(), level, event, ...context }));
}

export function logInfo(event: string, context: LogContext = {}): void {
  console.info(record("info", event, context));
}

export function logWarn(event: string, context: LogContext = {}): void {
  console.warn(record("warn", event, context));
}

export function logError(event: string, error: unknown, context: LogContext = {}): void {
  console.error(record("error", event, { ...context, error: serializeError(error) }));
}
