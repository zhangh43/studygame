const PROTECTED_ENV_NAMES = [
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "DATABASE_URL",
  "SESSION_SECRET",
  "POSTGRES_PASSWORD",
] as const;

export function configuredProtectedValues(): Array<{ name: string; value: string }> {
  return PROTECTED_ENV_NAMES.flatMap((name) => {
    const value = process.env[name];
    return value && value.length >= 8 ? [{ name, value }] : [];
  });
}

export function redactProtectedValues(text: string): string {
  return configuredProtectedValues().reduce(
    (redacted, secret) => redacted.split(secret.value).join(`[REDACTED ${secret.name}]`),
    text,
  );
}
