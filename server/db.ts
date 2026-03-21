import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL not set — database features will be unavailable");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err, client) => {
  console.error('[db] Unexpected error on idle client', err);
});

export const db = drizzle({ client: pool, schema });

export async function waitForDatabase(retries = 10, delayMs = 3000) {
  if (!process.env.DATABASE_URL) return;
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log(`[db] Successfully connected to database (attempt ${i + 1}/${retries})`);
      return;
    } catch (err: any) {
      console.warn(`[db] Failed to connect to database (attempt ${i + 1}/${retries}). Retrying in ${delayMs}ms...`);
      console.warn(`[db] Error: ${err.message}`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw new Error(`[db] Failed to connect to database after ${retries} attempts.`);
}
