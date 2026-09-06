import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db, queryOne } from "@/lib/db";
import { config } from "@/lib/config";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "game_studio_session";
const SESSION_DAYS = 30;

export type Session = {
  sessionId: string;
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  tenantName: string;
};

function tokenHash(token: string): string {
  return createHash("sha256")
    .update(`${config.sessionSecret()}:${token}`)
    .digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: string, tenantId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.query(
    `INSERT INTO sessions(token_hash, user_id, tenant_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash(token), userId, tenantId, expiresAt],
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(config.appUrl()).protocol === "https:",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return queryOne<Session>(
    `SELECT s.id AS "sessionId", u.id AS "userId", t.id AS "tenantId",
            u.email, u.display_name AS "displayName", t.name AS "tenantName"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN tenants t ON t.id = s.tenant_id
       JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = t.id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  );
}

export function isTrustedMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return config.nodeEnv() !== "production";
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
  if (!forwardedHost) return false;
  return origin === `${forwardedProto}://${forwardedHost}`;
}
