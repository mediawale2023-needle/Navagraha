// Pausing the marketplace against a real Postgres: open consultations are closed with their
// billed totals untouched, a late "end" cannot bill or earn on them, upcoming bookings and
// live streams are closed, and paid unfulfilled Pooja bookings / orders are only reported.
// Runs only with TEST_DATABASE_URL (a disposable database); skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('marketplace pause (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let closeMarketplaceActivity: typeof import('../../server/marketplace')['closeMarketplaceActivity'];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.FEATURE_MARKETPLACE;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ closeMarketplaceActivity } = await import('../../server/marketplace'));
    const { runMigrations } = await import('../../server/migrate');
    await runMigrations();

    const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
    ids.user = crypto.randomUUID();
    await q('INSERT INTO users (id, email) VALUES ($1, $2)', [ids.user, `${ids.user}@pause.test`]);
    await q("INSERT INTO wallets (user_id, balance) VALUES ($1, '140.00')", [ids.user]);
    await q('UPDATE users SET free_chat_used = true WHERE id = $1', [ids.user]);
    ids.astro = (await q("INSERT INTO astrologers (name, email, price_per_minute, is_verified, is_online, availability) VALUES ('A', $1, '20', true, true, 'busy') RETURNING id", [`${ids.user}@astro.test`])).rows[0].id;
    ids.active = (await q(
      "INSERT INTO consultations (user_id, astrologer_id, type, status, price_per_minute, started_at, is_free) VALUES ($1, $2, 'chat', 'active', '20', now() - interval '3 hours', true) RETURNING id",
      [ids.user, ids.astro],
    )).rows[0].id;
    await q("INSERT INTO transactions (user_id, amount, type, description, status, consultation_id) VALUES ($1, '20', 'debit', 'Consultation - 1 minute', 'completed', $2)", [ids.user, ids.active]);
    ids.ended = (await q(
      "INSERT INTO consultations (user_id, astrologer_id, type, status, price_per_minute, duration_seconds, total_amount, ended_at) VALUES ($1, $2, 'chat', 'ended', '20', 300, '100.00', now()) RETURNING id",
      [ids.user, ids.astro],
    )).rows[0].id;
    ids.booking = (await q("INSERT INTO scheduled_calls (user_id, astrologer_id, scheduled_at, type, status) VALUES ($1, $2, now() + interval '1 day', 'chat', 'pending') RETURNING id", [ids.user, ids.astro])).rows[0].id;
    ids.stream = (await q("INSERT INTO live_streams (astrologer_id, title, status, agora_channel) VALUES ($1, 't', 'live', 'ch') RETURNING id", [ids.astro])).rows[0].id;
    const pooja = (await q("SELECT id FROM poojas LIMIT 1")).rows[0].id;
    ids.poojaBooking = (await q("INSERT INTO pooja_bookings (user_id, pooja_id, pooja_name, amount, devotee_name, status) VALUES ($1, $2, 'Pooja', '2100.00', 'D', 'booked') RETURNING id", [ids.user, pooja])).rows[0].id;
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('closes open activity, keeps every amount, and reports the unfulfilled paid booking', async () => {
    const before = await pool.query('SELECT count(*)::int AS n, coalesce(sum(amount), 0)::text AS total FROM transactions WHERE user_id = $1', [ids.user]);
    const priced = (await pool.query('SELECT total_amount, duration_seconds FROM consultations WHERE id = $1', [ids.active])).rows[0];
    const summary = await closeMarketplaceActivity();
    expect(summary.consultationsClosed).toBeGreaterThanOrEqual(1);
    expect(summary.openPoojaBookings).toBeGreaterThanOrEqual(1);
    const open = await storage.getOpenPaidMarketplaceItems();
    expect(open.billedClosedConsultations).toContainEqual(expect.objectContaining({ id: ids.active, billed: '20.00' }));
    expect(open.billedClosedConsultations.map((c) => c.id)).not.toContain(ids.ended);

    const c = (await pool.query('SELECT status, total_amount, duration_seconds FROM consultations WHERE id = $1', [ids.active])).rows[0];
    // Closed as billed: no three-hour duration or price is invented for it.
    expect(c).toEqual({ status: 'cancelled', ...priced });
    expect((await pool.query('SELECT status FROM scheduled_calls WHERE id = $1', [ids.booking])).rows[0].status).toBe('cancelled');
    expect((await pool.query('SELECT status FROM live_streams WHERE id = $1', [ids.stream])).rows[0].status).toBe('ended');
    expect((await pool.query('SELECT is_online, availability FROM astrologers WHERE id = $1', [ids.astro])).rows[0]).toEqual({ is_online: false, availability: 'offline' });
    // The free first chat the pause cut short is available again when consultations return.
    expect((await pool.query('SELECT free_chat_used FROM users WHERE id = $1', [ids.user])).rows[0].free_chat_used).toBe(false);
    expect((await pool.query('SELECT status FROM pooja_bookings WHERE id = $1', [ids.poojaBooking])).rows[0].status).toBe('booked');

    const after = await pool.query('SELECT count(*)::int AS n, coalesce(sum(amount), 0)::text AS total FROM transactions WHERE user_id = $1', [ids.user]);
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [ids.user])).rows[0].balance).toBe('140.00');
  });

  it('a late end on a closed consultation neither re-times nor re-prices it', async () => {
    const cancelled = await storage.endConsultation(ids.active);
    expect(cancelled.status).toBe('cancelled');
    expect(Number(cancelled.totalAmount ?? 0)).toBe(0);
    expect(cancelled.durationSeconds ?? 0).toBe(0);
    const ended = await storage.endConsultation(ids.ended);
    expect(ended).toMatchObject({ status: 'ended', totalAmount: '100.00', durationSeconds: 300 });
  });

  it('running it again changes nothing', async () => {
    const summary = await closeMarketplaceActivity();
    expect(summary.consultationsClosed).toBe(0);
    expect(summary.bookingsCancelled).toBe(0);
    expect(summary.liveStreamsEnded).toBe(0);
  });
});
