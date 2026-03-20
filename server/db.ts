import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { logger } from "./logger";

if (!process.env.DATABASE_URL) {
  logger.warn("[db] DATABASE_URL not set — database features will be unavailable");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  max: Math.max(1, parseInt(process.env.PGPOOL_MAX || "20", 10) || 20),
  idleTimeoutMillis: Math.max(1000, parseInt(process.env.PGPOOL_IDLE_TIMEOUT_MS || "30000", 10) || 30000),
  // Railway Postgres commonly requires SSL in production
  ssl:
    process.env.PGSSLMODE === "disable"
      ? undefined
      : process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  // Apply server-side query timeouts for safety
  options: `-c statement_timeout=${Math.max(1000, parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || "10000", 10) || 10000)} ` +
    `-c idle_in_transaction_session_timeout=${Math.max(1000, parseInt(process.env.PG_IDLE_TX_TIMEOUT_MS || "30000", 10) || 30000)}`,
});

pool.on('error', (err, client) => {
  logger.error({ err }, "[db] Unexpected error on idle client");
});

export const db = drizzle({ client: pool, schema });

export async function waitForDatabase(retries = 10, delayMs = 3000) {
  if (!process.env.DATABASE_URL) return;
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      logger.info(`[db] Successfully connected to database (attempt ${i + 1}/${retries})`);
      return;
    } catch (err: any) {
      logger.warn(`[db] Failed to connect to database (attempt ${i + 1}/${retries}). Retrying in ${delayMs}ms...`);
      logger.warn(`[db] Error: ${err.message}`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw new Error(`[db] Failed to connect to database after ${retries} attempts.`);
}
