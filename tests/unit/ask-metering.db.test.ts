// Release A: Ask Your Kundli metering against a real Postgres — free questions and their
// follow-ups per user and chart, idempotent retries, concurrency, restoration on failure,
// paid entitlements, and reservations that outlive their request.
// Runs only when TEST_DATABASE_URL points at a disposable database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Ask metering (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];

  const newUser = async () => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${id}@ask.test`]);
    return id;
  };
  const key = () => `k_${crypto.randomUUID()}`;
  const reserve = (userId: string, over: Partial<Parameters<typeof storage.reserveAskUsage>[0]> = {}) =>
    storage.reserveAskUsage({
      userId, chartKey: 'kundli:a', sessionId: crypto.randomUUID(), idempotencyKey: key(),
      freeQuestions: 3, freeFollowUps: 1, enforce: true, unlimited: false, ...over,
    });
  const asked = async (userId: string, over: Partial<Parameters<typeof storage.reserveAskUsage>[0]> = {}) => {
    const r = await reserve(userId, over);
    if (r.kind !== 'reserved') return r;
    await storage.settleAskUsage(r.usage.id, 'consumed');
    return r;
  };
  const allowance = (userId: string, sessionId?: string, chartKey?: string) => storage.getAskAllowance(userId, { freeQuestions: 3, sessionId, chartKey });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    const { runMigrations } = await import('../../server/migrate');
    await runMigrations();
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('three free questions, each with one follow-up, then refusal when enforced', async () => {
    const user = await newUser();
    for (let i = 0; i < 3; i++) {
      const sessionId = crypto.randomUUID();
      const q = await asked(user, { sessionId });
      expect(q).toMatchObject({ kind: 'reserved', usage: { kind: 'question', entitlement: 'free', followUpsAllowed: 1 } });
      const f = await asked(user, { sessionId });
      expect(f).toMatchObject({ kind: 'reserved', usage: { kind: 'follow_up', entitlement: 'free' } });
    }
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 3, freeQuestionsRemaining: 0 });
    expect((await reserve(user)).kind).toBe('exhausted');
  });

  it('without enforcement nobody is refused: questions beyond the allowance are recorded as unmetered', async () => {
    const user = await newUser();
    for (let i = 0; i < 3; i++) await asked(user, { enforce: false });
    const fourth = await asked(user, { enforce: false });
    expect(fourth).toMatchObject({ kind: 'reserved', usage: { entitlement: 'unmetered' } });
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 3, freeQuestionsRemaining: 0 });
  });

  it('a second follow-up, or a follow-up on another chart, is a new independent question', async () => {
    const user = await newUser();
    const sessionId = crypto.randomUUID();
    await asked(user, { sessionId });
    expect((await asked(user, { sessionId })) as any).toMatchObject({ usage: { kind: 'follow_up' } });
    expect((await asked(user, { sessionId })) as any).toMatchObject({ usage: { kind: 'question' } });
    expect((await asked(user, { sessionId, chartKey: 'kundli:b' })) as any).toMatchObject({ usage: { kind: 'question' } });
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 3 });
  });

  it('follow-ups remaining are reported for the thread', async () => {
    const user = await newUser();
    const sessionId = crypto.randomUUID();
    await asked(user, { sessionId });
    expect((await allowance(user, sessionId, 'kundli:a')).followUpsRemaining).toBe(1);
    await asked(user, { sessionId });
    expect((await allowance(user, sessionId, 'kundli:a')).followUpsRemaining).toBe(0);
  });

  it('ten concurrent new questions take exactly the three free ones', async () => {
    const user = await newUser();
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(user)));
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(3);
    expect(results.filter((r) => r.kind === 'exhausted')).toHaveLength(7);
  });

  it('two concurrent follow-ups on a one-follow-up question: one is a follow-up, the other a new question', async () => {
    const user = await newUser();
    const sessionId = crypto.randomUUID();
    await asked(user, { sessionId });
    const both = await Promise.all([reserve(user, { sessionId }), reserve(user, { sessionId })]);
    expect(both.map((r: any) => r.usage?.kind).sort()).toEqual(['follow_up', 'question']);
  });

  it('a retried request id is answered once: in flight, then replayed', async () => {
    const user = await newUser();
    const idempotencyKey = key();
    const [a, b] = await Promise.all([reserve(user, { idempotencyKey }), reserve(user, { idempotencyKey })]);
    expect([a.kind, b.kind].sort()).toEqual(['in_flight', 'reserved']);
    const reserved = (a.kind === 'reserved' ? a : b) as any;
    await storage.settleAskUsage(reserved.usage.id, 'consumed', 'msg_1');
    expect(await reserve(user, { idempotencyKey })).toMatchObject({ kind: 'replay', usage: { replyMessageId: 'msg_1' } });
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 1 });
  });

  it('a failed generation restores the free question, and a retry with the same id can use it', async () => {
    const user = await newUser();
    const idempotencyKey = key();
    const r = await reserve(user, { idempotencyKey });
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 1 });
    await storage.settleAskUsage((r as any).usage.id, 'released');
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 0 });
    expect(await reserve(user, { idempotencyKey })).toMatchObject({ kind: 'reserved' });
  });

  it('settling twice is a no-op', async () => {
    const user = await newUser();
    const r = (await reserve(user)) as any;
    expect(await storage.settleAskUsage(r.usage.id, 'consumed')).not.toBeNull();
    expect(await storage.settleAskUsage(r.usage.id, 'released')).toBeNull();
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 1 });
  });

  it('after the free questions, a paid entitlement is drawn with two follow-ups and restored on failure', async () => {
    const user = await newUser();
    for (let i = 0; i < 3; i++) await asked(user);
    const { rows } = await pool.query(
      "INSERT INTO entitlements (user_id, kind, quantity, follow_ups_each, source, source_ref) VALUES ($1, 'ask_questions', 1, 2, 'grant', $2) RETURNING id",
      [user, `test_${crypto.randomUUID()}`],
    );
    expect(await allowance(user)).toMatchObject({ paidQuestionsRemaining: 1 });
    const paid = (await reserve(user)) as any;
    expect(paid.usage).toMatchObject({ entitlement: 'paid', entitlementId: rows[0].id, followUpsAllowed: 2 });
    expect(await allowance(user)).toMatchObject({ paidQuestionsRemaining: 0 });
    expect((await reserve(user)).kind).toBe('exhausted');
    await storage.settleAskUsage(paid.usage.id, 'released');
    expect(await allowance(user)).toMatchObject({ paidQuestionsRemaining: 1 });
  });

  it('retrying a request whose paid reservation went stale returns that question before taking another', async () => {
    const user = await newUser();
    for (let i = 0; i < 3; i++) await asked(user);
    const { rows } = await pool.query(
      "INSERT INTO entitlements (user_id, kind, quantity, follow_ups_each, source) VALUES ($1, 'ask_questions', 2, 2, 'grant') RETURNING id", [user]);
    const idempotencyKey = key();
    const first = (await reserve(user, { idempotencyKey })) as any;
    await pool.query("UPDATE ask_usage SET created_at = now() - interval '11 minutes' WHERE id = $1", [first.usage.id]);
    const retry = (await reserve(user, { idempotencyKey })) as any;
    expect(retry).toMatchObject({ kind: 'reserved', usage: { entitlement: 'paid' } });
    await storage.settleAskUsage(retry.usage.id, 'consumed');
    expect((await pool.query('SELECT used FROM entitlements WHERE id = $1', [rows[0].id])).rows[0].used).toBe(1);
    // The abandoned attempt is kept, released, under another key; its late settlement charges nothing.
    expect(await storage.settleAskUsage(first.usage.id, 'consumed')).toBeNull();
  });

  it('an entitlement can never be used beyond its quantity, even concurrently', async () => {
    const user = await newUser();
    for (let i = 0; i < 3; i++) await asked(user);
    await pool.query("INSERT INTO entitlements (user_id, kind, quantity, follow_ups_each, source) VALUES ($1, 'ask_questions', 2, 2, 'grant')", [user]);
    const results = await Promise.all(Array.from({ length: 6 }, () => reserve(user)));
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(2);
    await expect(pool.query("UPDATE entitlements SET used = quantity + 1 WHERE user_id = $1", [user])).rejects.toThrow(/entitlements_used_within_quantity/);
  });

  it('admin accounts are recorded but draw on no allowance', async () => {
    const user = await newUser();
    for (let i = 0; i < 5; i++) expect(await asked(user, { unlimited: true })).toMatchObject({ usage: { entitlement: 'admin' } });
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 0 });
  });

  it("one user's usage never counts against another's", async () => {
    const a = await newUser();
    const b = await newUser();
    for (let i = 0; i < 3; i++) await asked(a);
    expect(await allowance(b)).toMatchObject({ freeQuestionsUsed: 0, freeQuestionsRemaining: 3 });
  });

  it('a reservation whose request died stops counting and the sweeper releases it', async () => {
    const user = await newUser();
    const r = (await reserve(user)) as any;
    await pool.query("UPDATE ask_usage SET created_at = now() - interval '11 minutes' WHERE id = $1", [r.usage.id]);
    expect(await allowance(user)).toMatchObject({ freeQuestionsUsed: 0 });
    expect(await storage.releaseStaleAskReservations()).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT status FROM ask_usage WHERE id = $1', [r.usage.id])).rows[0].status).toBe('released');
  });
});
