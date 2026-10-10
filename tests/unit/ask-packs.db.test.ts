// Release B: Ask question packs against a real Postgres — the debit, transaction and
// entitlement are one unit; a request id buys once even when sent concurrently; a balance that
// covers one pack buys one; admins are refused; paid questions carry two follow-ups.
// Runs only when TEST_DATABASE_URL points at a disposable database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;
const ADMIN = `release-b-admin-${crypto.randomUUID()}@packs.test`;

describe.skipIf(!url)('Ask packs (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let ASK_PACKS: typeof import('../../server/askPacks')['ASK_PACKS'];
  const pack = (id: string) => ({ ...ASK_PACKS.find((p) => p.id === id)!, followUpsEach: 2 });

  const newUser = async (balance: string, email?: string) => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, email ?? `${id}@packs.test`]);
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [id, balance]);
    return id;
  };
  const balance = async (id: string) => (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0].balance;
  const rows = async (id: string) => ({
    debits: (await pool.query("SELECT amount, payment_method FROM transactions WHERE user_id = $1 AND type = 'debit'", [id])).rows,
    entitlements: (await pool.query('SELECT quantity, used, follow_ups_each, source, transaction_id FROM entitlements WHERE user_id = $1', [id])).rows,
  });
  const rid = () => `req_${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ADMIN_EMAILS = ADMIN;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ ASK_PACKS } = await import('../../server/askPacks'));
    await (await import('../../server/migrate')).runMigrations();
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('the catalogue is ₹29/1, ₹99/5, ₹199/12', () => {
    expect(ASK_PACKS.map((p) => [p.id, p.questions, p.price])).toEqual([['ask_1', 1, 29], ['ask_5', 5, 99], ['ask_12', 12, 199]]);
  });

  it('a purchase debits exactly the price and grants the questions, linked to its debit', async () => {
    const id = await newUser('500.00');
    const r = await storage.purchaseAskPack(id, pack('ask_5'), rid());
    expect(r).toMatchObject({ kind: 'purchased', balance: '401.00', entitlement: { quantity: 5, used: 0, followUpsEach: 2, source: 'purchase' } });
    expect(await balance(id)).toBe('401.00');
    const { debits, entitlements } = await rows(id);
    expect(debits).toEqual([{ amount: '-99.00', payment_method: 'wallet' }]);
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0].transaction_id).toBeTruthy();
    const history = await storage.getAskEntitlements(id);
    expect(history).toMatchObject([{ quantity: 5, used: 0, followUpsEach: 2, price: '99.00' }]);
  });

  it('the same request id buys once, even ten at a time', async () => {
    const id = await newUser('500.00');
    const requestId = rid();
    const results = await Promise.all(Array.from({ length: 10 }, () => storage.purchaseAskPack(id, pack('ask_12'), requestId)));
    expect(results.filter((r) => r.kind === 'purchased')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'replay')).toHaveLength(9);
    expect(await balance(id)).toBe('301.00');
    const { debits, entitlements } = await rows(id);
    expect(debits).toHaveLength(1);
    expect(entitlements).toHaveLength(1);
  });

  it('a request id reused for a different pack is refused, not charged', async () => {
    const id = await newUser('500.00');
    const requestId = rid();
    await storage.purchaseAskPack(id, pack('ask_1'), requestId);
    expect(await storage.purchaseAskPack(id, pack('ask_12'), requestId)).toEqual({ kind: 'request_conflict' });
    expect(await balance(id)).toBe('471.00');
  });

  it('concurrent purchases with a balance for one: exactly one succeeds and the wallet never goes negative', async () => {
    const id = await newUser('120.00');
    const results = await Promise.all(Array.from({ length: 6 }, () => storage.purchaseAskPack(id, pack('ask_5'), rid())));
    expect(results.filter((r) => r.kind === 'purchased')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'insufficient')).toHaveLength(5);
    expect(await balance(id)).toBe('21.00');
    expect((await rows(id)).entitlements).toHaveLength(1);
  });

  it('an insufficient balance writes nothing', async () => {
    const id = await newUser('28.99');
    expect(await storage.purchaseAskPack(id, pack('ask_1'), rid())).toEqual({ kind: 'insufficient' });
    expect(await balance(id)).toBe('28.99');
    expect(await rows(id)).toEqual({ debits: [], entitlements: [] });
  });

  it('admin (free-access) accounts are refused and charged nothing', async () => {
    const id = await newUser('500.00', ADMIN);
    expect(await storage.purchaseAskPack(id, pack('ask_1'), rid())).toEqual({ kind: 'free_access' });
    expect(await balance(id)).toBe('500.00');
  });

  it("two users' identical request ids do not collide", async () => {
    const a = await newUser('100.00');
    const b = await newUser('100.00');
    const requestId = rid();
    expect((await storage.purchaseAskPack(a, pack('ask_1'), requestId)).kind).toBe('purchased');
    expect((await storage.purchaseAskPack(b, pack('ask_1'), requestId)).kind).toBe('purchased');
  });

  it('bought questions are drawn after the free ones, carry two follow-ups, and a failed answer returns the question', async () => {
    const id = await newUser('100.00');
    await storage.purchaseAskPack(id, pack('ask_1'), rid());
    const reserve = (sessionId = crypto.randomUUID()) => storage.reserveAskUsage({
      userId: id, chartKey: 'kundli:x', sessionId, idempotencyKey: `k_${crypto.randomUUID()}`,
      freeQuestions: 0, freeFollowUps: 1, enforce: true, unlimited: false,
    });
    const sessionId = crypto.randomUUID();
    const q = (await reserve(sessionId)) as any;
    expect(q).toMatchObject({ kind: 'reserved', usage: { kind: 'question', entitlement: 'paid', followUpsAllowed: 2 } });
    await storage.settleAskUsage(q.usage.id, 'consumed');
    for (let i = 0; i < 2; i++) {
      const f = (await reserve(sessionId)) as any;
      expect(f.usage.kind).toBe('follow_up');
      await storage.settleAskUsage(f.usage.id, 'consumed');
    }
    expect((await reserve(sessionId)).kind).toBe('exhausted');
    expect((await storage.getAskAllowance(id, { freeQuestions: 0 })).paidQuestionsRemaining).toBe(0);

    // A second pack: its question fails and goes back.
    await storage.purchaseAskPack(id, pack('ask_1'), rid());
    const r = (await reserve()) as any;
    await storage.settleAskUsage(r.usage.id, 'released');
    expect((await storage.getAskAllowance(id, { freeQuestions: 0 })).paidQuestionsRemaining).toBe(1);
  });

  it('a partly used pack keeps its remaining questions, oldest pack first', async () => {
    const id = await newUser('300.00');
    await storage.purchaseAskPack(id, pack('ask_5'), rid());
    await storage.purchaseAskPack(id, pack('ask_1'), rid());
    for (let i = 0; i < 2; i++) {
      const r = (await storage.reserveAskUsage({ userId: id, chartKey: 'kundli:y', sessionId: crypto.randomUUID(), idempotencyKey: `k_${crypto.randomUUID()}`, freeQuestions: 0, freeFollowUps: 1, enforce: true, unlimited: false })) as any;
      await storage.settleAskUsage(r.usage.id, 'consumed');
    }
    const history = await storage.getAskEntitlements(id);
    expect(history.map((h) => [h.quantity, h.used])).toEqual([[1, 0], [5, 2]]);
    expect((await storage.getAskAllowance(id, { freeQuestions: 0 })).paidQuestionsRemaining).toBe(4);
  });
});
