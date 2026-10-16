// #117: report refunds and the stale-order sweeper must not depend on the Node or Postgres time zone.
// report_orders.created_at and transactions.created_at are `timestamp without time zone`, written by
// DEFAULT now() in the database session's zone. This suite switches the Node process's zone at run
// time (UTC, ahead of UTC, behind UTC); CI runs it with the Postgres session in UTC and in Asia/Kolkata,
// so Node ahead of, equal to and behind the database are all covered.
// Runs only with TEST_DATABASE_URL (a disposable database).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;
const NODE_ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'] as const;

describe.skipIf(!url)('report refunds across time zones (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let sweepStaleReportOrders: typeof import('../../server/reportOrders')['sweepStaleReportOrders'];
  let STALE_REPORT_ORDER_MS: number;
  let typeId: string;
  const originalTz = process.env.TZ;
  const originalAdmins = process.env.ADMIN_EMAILS;
  const ADMIN = `refund-tz-admin-${crypto.randomUUID()}@report.test`;

  const newUser = async (balance: string, email = `${crypto.randomUUID()}@report.test`) => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, email]);
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [id, balance]);
    return id;
  };
  const balanceOf = async (id: string) => (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0].balance as string;
  const statusOf = async (orderId: string) => (await pool.query('SELECT status, refunded_at FROM report_orders WHERE id = $1', [orderId])).rows[0];
  const refunds = async (id: string) => (await pool.query("SELECT amount FROM transactions WHERE user_id = $1 AND type = 'refund'", [id])).rows.map((r) => r.amount);
  const place = (userId: string) => storage.placeReportOrder({ userId, reportTypeId: typeId, price: 299, description: 'Report: Career' });
  const age = (orderId: string, minutes: number) => pool.query(`UPDATE report_orders SET created_at = now() - make_interval(mins => $2) WHERE id = $1`, [orderId, minutes]);
  const legacyOrder = async (userId: string, status = 'failed', amount = '299.00') =>
    (await pool.query(`INSERT INTO report_orders (user_id, report_type_id, status, amount) VALUES ($1, $2, $3, $4) RETURNING id`, [userId, typeId, status, amount])).rows[0].id as string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ sweepStaleReportOrders, STALE_REPORT_ORDER_MS } = await import('../../server/reportOrders'));
    await (await import('../../server/migrate')).runMigrations();
    typeId = (await pool.query("SELECT id FROM report_types WHERE slug = 'career-report'")).rows[0].id;
    process.env.ADMIN_EMAILS = ADMIN;
    console.info(`[refund-tz] Postgres session TimeZone: ${(await pool.query('SHOW timezone')).rows[0].TimeZone}`);
  }, 60_000);
  afterEach(() => { process.env.TZ = originalTz; });
  afterAll(async () => {
    process.env.TZ = originalTz;
    if (originalAdmins === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = originalAdmins;
    await pool?.end();
  });

  describe.each(NODE_ZONES)('Node process in %s', (zone) => {
    beforeAll(() => { process.env.TZ = zone; });
    it('the zone is in effect', () => {
      const offset = new Date('2026-01-15T12:00:00Z').getTimezoneOffset();
      expect(offset).toBe({ UTC: 0, 'Asia/Kolkata': -330, 'America/Los_Angeles': 480 }[zone]);
    });

    it('an order still generating is never swept: just placed, and 29 minutes old', async () => {
      process.env.TZ = zone;
      const id = await newUser('600.00');
      const fresh = (await place(id))!.order;
      await sweepStaleReportOrders();
      expect(await statusOf(fresh.id)).toMatchObject({ status: 'processing', refunded_at: null });
      await age(fresh.id, 29);
      await sweepStaleReportOrders();
      expect(await statusOf(fresh.id)).toMatchObject({ status: 'processing', refunded_at: null });
      expect(await balanceOf(id)).toBe('301.00');
      // It can still be delivered.
      expect(await storage.setReportOrderContent(fresh.id, { title: 'ok' })).toBeTruthy();
    });

    it('an order stranded past 30 minutes is swept and refunded what was charged, once', async () => {
      process.env.TZ = zone;
      expect(STALE_REPORT_ORDER_MS).toBe(30 * 60_000);
      const id = await newUser('299.00');
      const { order } = (await place(id))!;
      await age(order.id, 31);
      await sweepStaleReportOrders();
      await sweepStaleReportOrders();
      expect(await statusOf(order.id)).toMatchObject({ status: 'failed' });
      expect(await balanceOf(id)).toBe('299.00');
      expect(await refunds(id)).toEqual(['299.00']);
    });

    it('a ₹0 free-access (admin) order refunds ₹0, on failure and when swept', async () => {
      process.env.TZ = zone;
      const failed = await newUser('0.00', ADMIN.replace('@', `+${zone.replace('/', '-').toLowerCase()}-f@`));
      const swept = await newUser('0.00', ADMIN.replace('@', `+${zone.replace('/', '-').toLowerCase()}-s@`));
      process.env.ADMIN_EMAILS = [ADMIN, ...(await pool.query('SELECT email FROM users WHERE id = ANY($1)', [[failed, swept]])).rows.map((r) => r.email)].join(',');
      const a = (await place(failed))!.order;
      const b = (await place(swept))!.order;
      expect([a.chargedAmount, b.chargedAmount]).toEqual(['0.00', '0.00']);
      expect((await storage.failAndRefundReportOrder(a.id, 'quality check failed'))?.refunded).toBe(0);
      await age(b.id, 31);
      await sweepStaleReportOrders();
      expect(await statusOf(b.id)).toMatchObject({ status: 'failed' });
      expect([await balanceOf(failed), await balanceOf(swept)]).toEqual(['0.00', '0.00']);
      expect([...(await refunds(failed)), ...(await refunds(swept))]).toEqual(['0.00', '0.00']);
    });

    it('a legacy order (no charged amount) refunds the debit made for it: ₹0 free access, ₹349 paid', async () => {
      process.env.TZ = zone;
      const free = await newUser('0.00');
      await pool.query("INSERT INTO transactions (user_id, amount, type, description, status, created_at) VALUES ($1, '0', 'debit', 'Report: Career (free access)', 'completed', now() - interval '10 seconds')", [free]);
      expect((await storage.failAndRefundReportOrder(await legacyOrder(free), 'refunded by admin'))?.refunded).toBe(0);
      expect(await balanceOf(free)).toBe('0.00');

      const paid = await newUser('0.00');
      await pool.query("INSERT INTO transactions (user_id, amount, type, description, status, created_at) VALUES ($1, '-349', 'debit', 'Report: Marriage', 'completed', now() - interval '5 seconds')", [paid]);
      expect((await storage.failAndRefundReportOrder(await legacyOrder(paid, 'failed', '349.00'), 'refunded by admin'))?.refunded).toBe(349);
      expect(await balanceOf(paid)).toBe('349.00');
    });

    it('a legacy order with no matching debit: its price for a paying account (as before), ₹0 for a free-access account', async () => {
      process.env.TZ = zone;
      const paying = await newUser('0.00');
      // A debit far outside the order's window is not the one made for it.
      await pool.query("INSERT INTO transactions (user_id, amount, type, description, status, created_at) VALUES ($1, '0', 'debit', 'Report: Career (free access)', 'completed', now() - interval '3 hours')", [paying]);
      expect((await storage.failAndRefundReportOrder(await legacyOrder(paying), 'refunded by admin'))?.refunded).toBe(299);

      const email = ADMIN.replace('@', `+${zone.replace('/', '-').toLowerCase()}-legacy@`);
      const admin = await newUser('0.00', email);
      process.env.ADMIN_EMAILS = `${process.env.ADMIN_EMAILS},${email}`;
      expect((await storage.failAndRefundReportOrder(await legacyOrder(admin), 'refunded by admin'))?.refunded).toBe(0);
      expect(await balanceOf(admin)).toBe('0.00');
    });
  });
});
