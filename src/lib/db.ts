import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "@/lib/config";
import { logError } from "@/lib/logging";

const globalForDb = globalThis as unknown as { gameStudioPool?: Pool };

export const db =
  globalForDb.gameStudioPool ??
  new Pool({
    connectionString: config.databaseUrl(),
    max: config.databasePoolMax(),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

db.on("error", (error) => logError("database.pool_error", error, {
  totalConnections: db.totalCount,
  idleConnections: db.idleCount,
  waitingRequests: db.waitingCount,
}));

if (config.nodeEnv() !== "production") globalForDb.gameStudioPool = db;

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const result = await db.query<T>(text, values);
  return result.rows[0] ?? null;
}

export async function transaction<T>(
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
