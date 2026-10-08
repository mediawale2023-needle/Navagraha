// Paid report orders against a real Postgres: the charge and the order are written together,
// a failed order is refunded exactly once (even when refunds race), a delivered report is
// never refunded by failure handling, orders stranded by a restart are swept and refunded,
// and placeholder reports already sold are listed for an explicit admin refund.
// Runs only with TEST_DATABASE_URL (a disposable database).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('report orders (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let sweepStaleReportOrders: typeof import('../../server/reportOrders')['sweepStaleReportOrders'];
  let typeId: string;

  const newUser = async (balance: string) => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${id}@report.test`]);
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [id, balance]);
    return id;
  };
  const balanceOf = async (id: string) => (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0].balance as string;
  const place = (userId: string) => storage.placeReportOrder({ userId, reportTypeId: typeId, price: 299, description: 'Report: Career' });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ sweepStaleReportOrders } = await import('../../server/reportOrders'));
    await (await import('../../server/migrate')).runMigrations();
    typeId = (await pool.query("SELECT id FROM report_types WHERE slug = 'career-report'")).rows[0].id;
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('the Health report is withdrawn and catalogue copy matches what is delivered', async () => {
    const rows = (await pool.query("SELECT slug, is_active, description FROM report_types WHERE slug IN ('health-report', 'complete-life-report')")).rows;
    expect(rows.find((r) => r.slug === 'health-report')?.is_active ?? false).toBe(false);
    expect(rows.find((r) => r.slug === 'complete-life-report').description).toMatch(/^An in-depth life analysis in 40\+ sections/);
  });

  it('charges and creates the order together; an empty wallet gets neither', async () => {
    const rich = await newUser('500.00');
    const placed = await place(rich);
    expect(placed?.order).toMatchObject({ status: 'processing', chargedAmount: '299.00', amount: '299.00' });
    expect(await balanceOf(rich)).toBe('201.00');

    const poor = await newUser('100.00');
    expect(await place(poor)).toBeNull();
    expect(await balanceOf(poor)).toBe('100.00');
    expect((await pool.query('SELECT count(*)::int AS n FROM report_orders WHERE user_id = $1', [poor])).rows[0].n).toBe(0);
  });

  it('a failed order is refunded exactly once, even when refunds race', async () => {
    const id = await newUser('299.00');
    const { order } = (await place(id))!;
    const results = await Promise.all(Array.from({ length: 5 }, () => storage.failAndRefundReportOrder(order.id, 'quality check failed')));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balanceOf(id)).toBe('299.00');
    const after = await storage.getReportOrderById(order.id);
    expect(after).toMatchObject({ status: 'failed', failureReason: 'quality check failed' });
    expect(after?.refundedAt).toBeTruthy();
    const refunds = (await pool.query("SELECT amount FROM transactions WHERE user_id = $1 AND type = 'refund'", [id])).rows;
    expect(refunds).toEqual([{ amount: '299.00' }]);
  });

  it('a delivered report is never refunded by failure handling, and a refunded one is never delivered', async () => {
    const id = await newUser('600.00');
    const delivered = (await place(id))!.order;
    expect(await storage.setReportOrderContent(delivered.id, { title: 'ok' })).toBeTruthy();
    expect(await storage.failAndRefundReportOrder(delivered.id, 'late')).toBeNull();

    const refunded = (await place(id))!.order;
    await storage.failAndRefundReportOrder(refunded.id, 'failed');
    expect(await storage.setReportOrderContent(refunded.id, { title: 'late' })).toBeUndefined();
    expect(await balanceOf(id)).toBe('301.00');
  });

  it('an order stranded by a restart is swept and refunded once', async () => {
    const id = await newUser('299.00');
    const { order } = (await place(id))!;
    await pool.query("UPDATE report_orders SET created_at = now() - interval '2 hours' WHERE id = $1", [order.id]);
    expect(await sweepStaleReportOrders()).toBeGreaterThanOrEqual(1);
    expect(await sweepStaleReportOrders()).toBe(0);
    expect(await balanceOf(id)).toBe('299.00');
    const note = (await pool.query("SELECT body FROM notifications WHERE user_id = $1", [id])).rows;
    expect(note[0].body).toMatch(/₹299 has been returned to your wallet/);
  });

  it('placeholder reports and unrefunded failures are listed; an admin refund pays the price once', async () => {
    const id = await newUser('0.00');
    const legacy = (await pool.query(
      `INSERT INTO report_orders (user_id, report_type_id, status, amount, content) VALUES ($1, $2, 'ready', '299.00', $3) RETURNING id`,
      [id, typeId, JSON.stringify({ sections: [{ heading: 'Career Overview', body: 'Analysis of career overview based on your ascendant Leo, Moon sign Aries.' }] })],
    )).rows[0].id;
    const failed = (await pool.query(`INSERT INTO report_orders (user_id, report_type_id, status, amount) VALUES ($1, $2, 'failed', '349.00') RETURNING id`, [id, typeId])).rows[0].id;
    const review = await storage.getReportOrdersNeedingReview();
    expect(review.placeholderReports.map((o) => o.id)).toContain(legacy);
    expect(review.unrefundedFailures.map((o) => o.id)).toContain(failed);

    expect((await storage.refundPlaceholderReport(legacy))?.refunded).toBe(299);
    expect(await storage.refundPlaceholderReport(legacy)).toBeNull();
    expect((await storage.failAndRefundReportOrder(failed, 'refunded by admin'))?.refunded).toBe(349);
    expect(await balanceOf(id)).toBe('648.00');
    const again = await storage.getReportOrdersNeedingReview();
    expect(again.placeholderReports.map((o) => o.id)).not.toContain(legacy);
    expect(again.unrefundedFailures.map((o) => o.id)).not.toContain(failed);
  });
  it('a legacy order refunds what was actually debited for it, ₹0 for a free-access order', async () => {
    const id = await newUser('0.00');
    await pool.query("INSERT INTO transactions (user_id, amount, type, description, status, created_at) VALUES ($1, '0', 'debit', 'Report: Career (free access)', 'completed', now() - interval '10 seconds')", [id]);
    const legacy = (await pool.query(`INSERT INTO report_orders (user_id, report_type_id, status, amount) VALUES ($1, $2, 'failed', '299.00') RETURNING id`, [id, typeId])).rows[0].id;
    expect((await storage.failAndRefundReportOrder(legacy, 'refunded by admin'))?.refunded).toBe(0);
    expect(await balanceOf(id)).toBe('0.00');

    const paid = await newUser('0.00');
    await pool.query("INSERT INTO transactions (user_id, amount, type, description, status, created_at) VALUES ($1, '-349', 'debit', 'Report: Marriage', 'completed', now() - interval '5 seconds')", [paid]);
    const order = (await pool.query(`INSERT INTO report_orders (user_id, report_type_id, status, amount) VALUES ($1, $2, 'failed', '349.00') RETURNING id`, [paid, typeId])).rows[0].id;
    expect((await storage.failAndRefundReportOrder(order, 'refunded by admin'))?.refunded).toBe(349);
  });

  it('delivered reports with almost no sections, and short Life Reports, are listed for review', async () => {
    const id = await newUser('0.00');
    const lifeType = (await pool.query("SELECT id FROM report_types WHERE category = 'life_complete'")).rows[0].id;
    const empty = (await pool.query(`INSERT INTO report_orders (user_id, report_type_id, status, amount, content) VALUES ($1, $2, 'ready', '1499.00', $3) RETURNING id`,
      [id, lifeType, JSON.stringify({ summary: 'A complete Vedic life analysis prepared from your birth chart.', sections: [] })])).rows[0].id;
    const short = (await pool.query(`INSERT INTO report_orders (user_id, report_type_id, status, amount, content) VALUES ($1, $2, 'ready', '1499.00', $3) RETURNING id`,
      [id, lifeType, JSON.stringify({ sections: Array.from({ length: 20 }, (_, i) => ({ heading: `S${i}`, body: 'real text' })) })])).rows[0].id;
    const full = (await pool.query(`INSERT INTO report_orders (user_id, report_type_id, status, amount, content) VALUES ($1, $2, 'ready', '299.00', $3) RETURNING id`,
      [id, typeId, JSON.stringify({ sections: Array.from({ length: 8 }, (_, i) => ({ heading: `S${i}`, body: 'real text' })) })])).rows[0].id;
    const listed = (await storage.getReportOrdersNeedingReview()).placeholderReports.map((o) => o.id);
    expect(listed).toEqual(expect.arrayContaining([empty, short]));
    expect(listed).not.toContain(full);
    expect((await storage.getUserReportOrders(id)).find((o) => o.id === empty)?.reportName).toBe('Complete Life Report');
  });
});
