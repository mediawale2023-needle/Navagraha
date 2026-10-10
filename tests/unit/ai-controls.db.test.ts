// Release A: AI spend controls against a real Postgres — shared daily usage, atomic Pro
// credits, and report orders that cannot be duplicated or taken free without limit.
// Runs only when TEST_DATABASE_URL points at a disposable database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;
const ADMIN = `release-a-admin-${crypto.randomUUID()}@ai.test`;

describe.skipIf(!url)('AI spend controls (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let FREE_ACCESS_REPORTS_PER_DAY: number;
  let typeId: string;

  const newUser = async (balance = '0', email?: string) => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, email ?? `${id}@ai.test`]);
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [id, balance]);
    return id;
  };
  const newAstrologer = async (used: number | null, resetAt: string | null) => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO astrologers (id, name, email, is_verified, pro_ai_credits_used, pro_ai_credits_reset_at) VALUES ($1, $2, $3, true, $4, $5)',
      [id, 'Pro', `${id}@astro.test`, used, resetAt]);
    return id;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ADMIN_EMAILS = ADMIN;
    ({ storage, FREE_ACCESS_REPORTS_PER_DAY } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    await (await import('../../server/migrate')).runMigrations();
    typeId = (await pool.query("SELECT id FROM report_types WHERE slug = 'career-report'")).rows[0].id;
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('usage from concurrent calls is summed per subject and day; paid report generation is not counted', async () => {
    const subject = `user:${crypto.randomUUID()}`;
    const day = '2026-10-10';
    await Promise.all(Array.from({ length: 10 }, () =>
      storage.recordAiUsage({ subject, day, feature: '/api/ai/chat', inputTokens: 100, outputTokens: 50, costMicroUsd: 45 })));
    await storage.recordAiUsage({ subject, day, feature: '/api/reports/order', inputTokens: 9000, outputTokens: 9000, costMicroUsd: 112_500 });
    expect(await storage.getAiUsageToday(subject, day)).toEqual({ calls: 10, costMicroUsd: 450 });
    expect(await storage.getAiUsageToday(subject, '2026-10-11')).toEqual({ calls: 0, costMicroUsd: 0 });
  });

  it('twenty concurrent Pro requests with five credits left take exactly five', async () => {
    const id = await newAstrologer(75, new Date().toISOString());
    const results = await Promise.all(Array.from({ length: 20 }, () => storage.consumeProAiCredit(id, 1, 80)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect((await pool.query('SELECT pro_ai_credits_used FROM astrologers WHERE id = $1', [id])).rows[0].pro_ai_credits_used).toBe(80);
  });

  it("last month's usage resets in the same statement, and a refund returns a credit", async () => {
    const id = await newAstrologer(80, '2020-01-15T00:00:00Z');
    expect(await storage.consumeProAiCredit(id, 1, 80)).toMatchObject({ ok: true, used: 1 });
    await storage.refundProAiCredit(id);
    await storage.refundProAiCredit(id);
    expect((await pool.query('SELECT pro_ai_credits_used FROM astrologers WHERE id = $1', [id])).rows[0].pro_ai_credits_used).toBe(0);
  });

  it('a double-submitted report order charges once', async () => {
    const id = await newUser('1000.00');
    const order = () => storage.placeReportOrder({ userId: id, reportTypeId: typeId, kundliId: undefined, subjectName: 'Me', price: 299, description: 'Report: Career' });
    const results = await Promise.all([order(), order(), order()]);
    expect(results.filter((r) => r && 'order' in r && !('refused' in r))).toHaveLength(1);
    expect(results.filter((r) => r && 'refused' in r && r.refused === 'duplicate')).toHaveLength(2);
    expect((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0].balance).toBe('701.00');
  });

  it('the same report for another person is a separate order', async () => {
    const id = await newUser('1000.00');
    const a = await storage.placeReportOrder({ userId: id, reportTypeId: typeId, subjectName: 'A', price: 299, description: 'Report: Career' });
    const b = await storage.placeReportOrder({ userId: id, reportTypeId: typeId, subjectName: 'B', price: 299, description: 'Report: Career' });
    expect(a && !('refused' in a)).toBe(true);
    expect(b && !('refused' in b)).toBe(true);
  });

  it('a free-access (admin) account can generate only a few free reports a day', async () => {
    const id = await newUser('0', ADMIN);
    expect(await storage.hasFreeAccess(id)).toBe(true);
    const results = [];
    for (let i = 0; i < FREE_ACCESS_REPORTS_PER_DAY + 2; i++) {
      results.push(await storage.placeReportOrder({ userId: id, reportTypeId: typeId, subjectName: `S${i}`, price: 299, description: 'Report: Career' }));
    }
    expect(results.filter((r) => r && !('refused' in r))).toHaveLength(FREE_ACCESS_REPORTS_PER_DAY);
    expect(results.filter((r) => r && 'refused' in r && r.refused === 'free_daily_limit')).toHaveLength(2);
  });
});
