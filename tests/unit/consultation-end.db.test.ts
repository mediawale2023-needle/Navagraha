// Ending a consultation against a real Postgres: an already-closed consultation is never
// re-timed or re-priced, earnings are based on what was billed, and a consultation can carry
// at most one earning. Runs only with TEST_DATABASE_URL (a disposable database).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('ending consultations (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let user: string; let astro: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    await (await import('../../server/migrate')).runMigrations();
    user = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [user, `${user}@end.test`]);
    astro = (await pool.query("INSERT INTO astrologers (name, email, price_per_minute) VALUES ('A', $1, '25') RETURNING id", [`${user}@astro.test`])).rows[0].id;
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  const consultation = async (status: string, startedHoursAgo: number) => (await pool.query(
    `INSERT INTO consultations (user_id, astrologer_id, type, status, price_per_minute, started_at, duration_seconds, total_amount)
     VALUES ($1, $2, 'chat', $3, '25', now() - ($4 || ' hours')::interval, 120, '50.00') RETURNING id`,
    [user, astro, status, String(startedHoursAgo)],
  )).rows[0].id as string;

  it('an ended consultation keeps its duration and total when ended again days later', async () => {
    const id = await consultation('ended', 72);
    const again = await storage.endConsultation(id);
    expect(again).toMatchObject({ status: 'ended', durationSeconds: 120, totalAmount: '50.00' });
  });

  it('an active consultation is timed and closed once', async () => {
    const id = await consultation('active', 0);
    const ended = await storage.endConsultation(id);
    expect(ended.status).toBe('ended');
    const second = await storage.endConsultation(id);
    expect(second.endedAt?.toISOString()).toBe(ended.endedAt?.toISOString());
  });

  it('the billed amount is the sum of the per-minute debits', async () => {
    const id = await consultation('ended', 1);
    for (const amount of ['25', '25', '-25']) {
      await pool.query("INSERT INTO transactions (user_id, amount, type, status, consultation_id) VALUES ($1, $2, 'debit', 'completed', $3)", [user, amount, id]);
    }
    await pool.query("INSERT INTO transactions (user_id, amount, type, status, consultation_id) VALUES ($1, '999', 'debit', 'pending', $2)", [user, id]);
    expect(await storage.getBilledAmountForConsultation(id)).toBe(75);
  });

  it('a consultation earns once, with totals moved once, even when ends race', async () => {
    const id = await consultation('ended', 1);
    const earning = { astrologerId: astro, consultationId: id, grossAmount: '75.00', platformFee: '18.75', netAmount: '56.25' };
    const before = Number((await pool.query('SELECT pending_payout FROM astrologers WHERE id = $1', [astro])).rows[0].pending_payout);
    const results = await Promise.all(Array.from({ length: 5 }, () => storage.createEarning(earning)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = Number((await pool.query('SELECT pending_payout FROM astrologers WHERE id = $1', [astro])).rows[0].pending_payout);
    expect(after - before).toBeCloseTo(56.25);
  });

  it('still earns once where historical duplicates kept the unique index from being created', async () => {
    await pool.query('DROP INDEX IF EXISTS astrologer_earnings_consultation_uq');
    try {
      const id = await consultation('ended', 1);
      const earning = { astrologerId: astro, consultationId: id, grossAmount: '50.00', platformFee: '12.50', netAmount: '37.50' };
      const results = await Promise.all(Array.from({ length: 5 }, () => storage.createEarning(earning)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await pool.query('SELECT count(*)::int AS n FROM astrologer_earnings WHERE consultation_id = $1', [id])).rows[0].n).toBe(1);
    } finally {
      await (await import('../../server/migrate')).runMigrations();
    }
  });
});
