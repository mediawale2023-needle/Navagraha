// The boot migrations (server/migrate.ts) must create every column the Drizzle tables in
// shared/schema.ts read and write. prediction_feedbacks drifted (the table had
// predicted_event, the code prediction_category), so every feedback read and insert failed
// in production with 42703. Runs only when TEST_DATABASE_URL points at a disposable database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('migrations match shared/schema.ts (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let runMigrations: typeof import('../../server/migrate')['runMigrations'];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ runMigrations } = await import('../../server/migrate'));
    await runMigrations();
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  const drizzleTables = async () => {
    const schema = await import('../../shared/schema');
    return Object.values(schema).filter((v): v is PgTable => v instanceof PgTable).map((t) => getTableConfig(t));
  };

  it('every Drizzle table and column exists after the migrations', async () => {
    const { rows } = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()");
    const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = (await drizzleTables()).flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`)).filter((k) => !have.has(k));
    expect(missing).toEqual([]);
  });

  it('no Drizzle table has a required database-only column that its inserts would leave empty', async () => {
    const tables = await drizzleTables();
    const known = new Set(tables.flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`)));
    const { rows } = await pool.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND is_nullable = 'NO' AND column_default IS NULL",
    );
    const names = new Set(tables.map((t) => t.name));
    expect(rows.filter((r) => names.has(r.table_name) && !known.has(`${r.table_name}.${r.column_name}`))).toEqual([]);
  });

  it('a prediction_feedbacks table in its original shape is upgraded in place, keeping its rows', async () => {
    const userId = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@feedback.test`]);
    await pool.query('DROP TABLE prediction_feedbacks');
    await pool.query(`CREATE TABLE prediction_feedbacks (
      id serial PRIMARY KEY, user_id varchar NOT NULL REFERENCES users(id), kundli_id varchar REFERENCES kundlis(id),
      predicted_event text NOT NULL, predicted_start_date timestamp, predicted_end_date timestamp,
      actual_occurrence_date timestamp, was_accurate boolean NOT NULL, dasha_system_used varchar NOT NULL,
      processed_at timestamp, created_at timestamp DEFAULT now())`);
    await pool.query("INSERT INTO prediction_feedbacks (user_id, predicted_event, was_accurate, dasha_system_used) VALUES ($1, 'old', true, 'Vimshottari')", [userId]);

    await runMigrations();

    await storage.createPredictionFeedback({ userId, predictionCategory: 'career', wasAccurate: true, dashaSystemUsed: 'Vimshottari', predictedDate: new Date('2026-01-01') });
    const rows = await storage.getPredictionFeedbacksByUser(userId);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.predictionCategory === 'career')).toMatchObject({ wasAccurate: true, dashaSystemUsed: 'Vimshottari' });
    expect((await pool.query("SELECT predicted_event FROM prediction_feedbacks WHERE user_id = $1 AND predicted_event IS NOT NULL", [userId])).rows).toEqual([{ predicted_event: 'old' }]);
    expect((await storage.getPatternStatistics()).total).toBeGreaterThanOrEqual(2);
  });
});
