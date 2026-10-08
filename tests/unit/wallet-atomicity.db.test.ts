// Phase A2: wallet money paths under real concurrency, against a real Postgres.
// Runs only when TEST_DATABASE_URL points at a disposable database (schema is created by
// runMigrations); skipped otherwise, e.g. in CI without a database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('wallet money paths under concurrency (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let runMigrations: typeof import('../../server/migrate')['runMigrations'];

  const newUser = async (balance: string) => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${id}@wallet.test`]);
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [id, balance]);
    return id;
  };
  const balanceOf = async (id: string) =>
    (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0].balance as string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ runMigrations } = await import('../../server/migrate'));
    await runMigrations();
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('20 concurrent ₹10 debits on ₹100 succeed exactly 10 times and never overdraw', async () => {
    const id = await newUser('100.00');
    const results = await Promise.all(Array.from({ length: 20 }, () => storage.debitWallet(id, 10, 'race test')));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(await balanceOf(id)).toBe('0.00');
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND type = 'debit'", [id]);
    expect(rows[0].n).toBe(10);
  });

  it('interleaved credits and debits lose no update', async () => {
    const id = await newUser('50.00');
    await Promise.all([
      ...Array.from({ length: 10 }, () => storage.creditWallet(id, 5)),
      ...Array.from({ length: 10 }, () => storage.tryDebitBalance(id, 3)),
    ]);
    expect(await balanceOf(id)).toBe('70.00'); // 50 + 50 − 30
  });

  it('a pending recharge settled concurrently by verify and webhook is credited exactly once', async () => {
    const id = await newUser('0.00');
    const orderId = `order_${crypto.randomUUID()}`;
    await pool.query(
      "INSERT INTO transactions (user_id, amount, type, description, status, payment_method, gateway_order_id) VALUES ($1, '575.00', 'recharge', 'Wallet recharge', 'pending', 'razorpay', $2)",
      [id, orderId],
    );
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => storage.settleRechargeOrder(orderId, 'pay_1', i % 2 ? 'sig' : undefined)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balanceOf(id)).toBe('575.00');
    expect(await storage.settleRechargeOrder(orderId, 'pay_1')).toBeNull();
  });

  it("settlement restricted to a user does not credit another user's order", async () => {
    const owner = await newUser('0.00');
    const orderId = `order_${crypto.randomUUID()}`;
    await pool.query(
      "INSERT INTO transactions (user_id, amount, type, status, payment_method, gateway_order_id) VALUES ($1, '100.00', 'recharge', 'pending', 'razorpay', $2)",
      [owner, orderId],
    );
    expect(await storage.settleRechargeOrder(orderId, 'pay_x', 'sig', 'someone-else')).toBeNull();
    expect(await balanceOf(owner)).toBe('0.00');
  });

  it('a replayed BNPL callback credits once', async () => {
    const id = await newUser('0.00');
    const orderId = `sm_${crypto.randomUUID()}`;
    const call = () => storage.settleExternalRecharge({ userId: id, orderId, amount: 300, description: 'Snapmint EMI recharge', paymentMethod: 'snapmint' });
    const results = await Promise.all(Array.from({ length: 5 }, call));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await call()).toBeNull();
    expect(await balanceOf(id)).toBe('300.00');
  });

  it('a referral reward can be claimed once', async () => {
    const referrer = await newUser('0.00');
    const referee = await newUser('0.00');
    const { rows } = await pool.query("INSERT INTO referrals (referrer_id, referee_id, status) VALUES ($1, $2, 'pending') RETURNING id", [referrer, referee]);
    const claims = await Promise.all(Array.from({ length: 4 }, () => storage.claimReferralReward(rows[0].id, '75', '25')));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('zero, negative and non-finite amounts never move money', async () => {
    const id = await newUser('10.00');
    expect(await storage.tryDebitBalance(id, 0)).toBeNull();
    expect(await storage.tryDebitBalance(id, -50)).toBeNull();
    expect(await storage.tryDebitBalance(id, Number.NaN)).toBeNull();
    await expect(storage.creditWallet(id, -5)).rejects.toThrow();
    expect(await balanceOf(id)).toBe('10.00');
  });

  it('migrations stay bootable when historical duplicates block a unique index', async () => {
    await pool.query('DROP INDEX IF EXISTS transactions_gateway_payment_id_uq');
    const id = await newUser('0.00');
    const dupe = `pay_dupe_${crypto.randomUUID()}`;
    for (let i = 0; i < 2; i++) {
      await pool.query("INSERT INTO transactions (user_id, amount, type, status, gateway_payment_id) VALUES ($1, '1.00', 'recharge', 'completed', $2)", [id, dupe]);
    }
    await expect(runMigrations()).resolves.toBeUndefined();
    await pool.query('DELETE FROM transactions WHERE gateway_payment_id = $1', [dupe]);
    await runMigrations();
    const { rows } = await pool.query("SELECT indexname FROM pg_indexes WHERE indexname IN ('transactions_gateway_payment_id_uq', 'transactions_completed_recharge_order_uq') ORDER BY 1");
    expect(rows.map((r: any) => r.indexname)).toEqual(['transactions_completed_recharge_order_uq', 'transactions_gateway_payment_id_uq']);
  }, 60_000);
});
