// Universal report order/job safety against a real disposable Postgres database.
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('universal report job lifecycle (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let sweepStaleReportOrders: typeof import('../../server/reportOrders')['sweepStaleReportOrders'];
  let typeId: string;

  const newUser = async (balance = '1000.00') => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${id}@universal.test`]);
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [id, balance]);
    return id;
  };
  const place = (userId: string, subjectName = 'Synthetic Chart') => storage.placeReportOrder({
    userId,
    reportTypeId: typeId,
    subjectName,
    price: 299,
    description: 'Report: Career',
    generationJob: {
      reportName: 'Career Report',
      category: 'career',
      payload: { kundli: { name: subjectName, chartData: { canonical: { version: 3 } } } },
    },
  });
  const balanceOf = async (userId: string) => (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId])).rows[0].balance as string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ sweepStaleReportOrders } = await import('../../server/reportOrders'));
    await (await import('../../server/migrate')).runMigrations();
    typeId = (await pool.query("SELECT id FROM report_types WHERE slug = 'career-report'")).rows[0].id;
  }, 60_000);

  afterAll(async () => { await pool?.end(); });

  it('creates the debit, order and queued job atomically, and creates none on insufficient balance', async () => {
    const funded = await newUser('299.00');
    const placed = await place(funded);
    expect(placed && 'order' in placed ? placed.order.status : null).toBe('processing');
    expect(await balanceOf(funded)).toBe('0.00');
    const rows = (await pool.query(
      `SELECT o.status AS order_status, j.status AS job_status, j.pipeline, j.attempts
         FROM report_orders o JOIN report_generation_jobs j ON j.order_id = o.id
        WHERE o.user_id = $1`, [funded],
    )).rows;
    expect(rows).toEqual([{ order_status: 'processing', job_status: 'queued', pipeline: 'universal-v1', attempts: 0 }]);

    const poor = await newUser('298.99');
    expect(await place(poor)).toBeNull();
    expect(await balanceOf(poor)).toBe('298.99');
    expect((await pool.query('SELECT count(*)::int AS n FROM report_orders WHERE user_id = $1', [poor])).rows[0].n).toBe(0);
  });

  it('charges and enqueues a duplicate request exactly once under concurrency', async () => {
    const userId = await newUser('1000.00');
    const results = await Promise.all(Array.from({ length: 10 }, () => place(userId, 'Duplicate Chart')));
    expect(results.filter((result) => result && 'order' in result && !('refused' in result))).toHaveLength(1);
    expect(results.filter((result) => result && 'refused' in result && result.refused === 'duplicate')).toHaveLength(9);
    expect(await balanceOf(userId)).toBe('701.00');
    expect((await pool.query('SELECT count(*)::int AS n FROM report_orders WHERE user_id = $1', [userId])).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM report_generation_jobs j JOIN report_orders o ON o.id = j.order_id WHERE o.user_id = $1', [userId])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND type = 'debit'", [userId])).rows[0].n).toBe(1);
  });

  it('uses row locking so concurrent workers claim each queued job at most once', async () => {
    const userA = await newUser();
    const userB = await newUser();
    const first = await place(userA, 'Worker A');
    const second = await place(userB, 'Worker B');
    const orderIds = [first, second].map((result) => result && 'order' in result ? result.order.id : '').sort();
    const claims = (await Promise.all(Array.from({ length: 12 }, () => storage.claimReportGenerationJob()))).filter(Boolean)!;
    const relevant = claims.filter((claim) => orderIds.includes(claim.orderId));
    expect(relevant.map((claim) => claim.orderId).sort()).toEqual(orderIds);
    expect(new Set(relevant.map((claim) => claim.orderId)).size).toBe(2);
    expect(relevant.every((claim) => claim.attempts === 1)).toBe(true);
  });

  it('a queued job survives worker absence and is claimable later without a second charge', async () => {
    const userId = await newUser('299.00');
    const placed = await place(userId, 'Restart Queue');
    const orderId = placed && 'order' in placed ? placed.order.id : '';
    const before = (await pool.query('SELECT status, attempts FROM report_generation_jobs WHERE order_id = $1', [orderId])).rows[0];
    expect(before).toEqual({ status: 'queued', attempts: 0 });
    const claim = await storage.claimReportGenerationJob();
    expect(claim).toMatchObject({ orderId, attempts: 1 });
    expect(await balanceOf(userId)).toBe('0.00');
    expect((await pool.query("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND type = 'debit'", [userId])).rows[0].n).toBe(1);
  });

  it('a worker crash after claim is not replayed; the stale sweep fails and refunds it exactly once', async () => {
    const userId = await newUser('299.00');
    const placed = await place(userId, 'Crashed Worker');
    const orderId = placed && 'order' in placed ? placed.order.id : '';
    const claim = await storage.claimReportGenerationJob();
    expect(claim?.orderId).toBe(orderId);
    await pool.query("UPDATE report_orders SET created_at = now() - interval '2 hours' WHERE id = $1", [orderId]);

    expect(await sweepStaleReportOrders()).toBeGreaterThanOrEqual(1);
    expect(await sweepStaleReportOrders()).toBe(0);
    expect(await balanceOf(userId)).toBe('299.00');
    expect((await pool.query('SELECT status, refunded_at IS NOT NULL AS refunded FROM report_orders WHERE id = $1', [orderId])).rows[0]).toEqual({ status: 'failed', refunded: true });
    expect((await pool.query('SELECT status, attempts, last_error FROM report_generation_jobs WHERE order_id = $1', [orderId])).rows[0]).toEqual({ status: 'failed', attempts: 1, last_error: 'generation did not finish' });
    expect((await pool.query("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND type = 'refund'", [userId])).rows[0].n).toBe(1);
    expect((await Promise.all(Array.from({ length: 4 }, () => storage.claimReportGenerationJob()))).filter((job) => job?.orderId === orderId)).toHaveLength(0);
  });

  it('delivery and refund races cannot both win, and repeated finalisation is harmless', async () => {
    const userId = await newUser('299.00');
    const placed = await place(userId, 'Finalisation Race');
    const orderId = placed && 'order' in placed ? placed.order.id : '';
    expect((await storage.claimReportGenerationJob())?.orderId).toBe(orderId);
    const [delivery, ...refunds] = await Promise.all([
      storage.setReportOrderContent(orderId, { title: 'Accepted report' }),
      ...Array.from({ length: 8 }, () => storage.failAndRefundReportOrder(orderId, 'worker failed')),
    ]);
    const final = (await pool.query('SELECT status, refunded_at FROM report_orders WHERE id = $1', [orderId])).rows[0];
    expect(['ready', 'failed']).toContain(final.status);
    if (delivery) {
      expect(final.status).toBe('ready');
      expect(refunds.filter(Boolean)).toHaveLength(0);
      expect(await balanceOf(userId)).toBe('0.00');
    } else {
      expect(final.status).toBe('failed');
      expect(refunds.filter(Boolean)).toHaveLength(1);
      expect(await balanceOf(userId)).toBe('299.00');
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND type = 'refund'", [userId])).rows[0].n).toBe(delivery ? 0 : 1);
    await Promise.all([
      storage.finishReportGenerationJob(orderId, final.status === 'ready' ? 'completed' : 'failed'),
      storage.finishReportGenerationJob(orderId, final.status === 'ready' ? 'completed' : 'failed'),
    ]);
  });
});
