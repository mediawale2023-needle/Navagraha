// Release A deployment guard: the database refuses recharge writes that did not come through
// verified settlement, so an older build (running during a deploy, or after a rollback)
// fails closed instead of reopening the string-amount defect. The statements below are the
// ones the pre-Release A code issued (also verified by running that build against this schema).
// Runs only when TEST_DATABASE_URL points at a disposable database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Release A recharge guard (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  let runMigrations: typeof import('../../server/migrate')['runMigrations'];

  const newUser = async () => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${id}@guard.test`]);
    await pool.query("INSERT INTO wallets (user_id, balance) VALUES ($1, '0')", [id]);
    return id;
  };
  const balanceOf = async (id: string) => (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0].balance;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    ({ runMigrations } = await import('../../server/migrate'));
    await runMigrations();
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('old order creation (no recorded paise, the "5" → "500" row) is refused', async () => {
    const user = await newUser();
    await expect(pool.query(
      "INSERT INTO transactions (user_id, amount, type, description, status, payment_method, gateway_order_id) VALUES ($1, '500', 'recharge', 'Wallet recharge', 'pending', 'razorpay', $2)",
      [user, `order_${crypto.randomUUID()}`],
    )).rejects.toThrow(/release_a_recharge_guard/);
  });

  it('old settlement (claim + credit in one transaction, no verification) is refused and rolled back', async () => {
    const user = await newUser();
    const txn = await storage.createPendingRecharge({ userId: user, orderId: `order_${crypto.randomUUID()}`, amountPaise: 50000, packBonus: 75, quotedCredit: 575, description: 'Wallet recharge' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query(
        "UPDATE transactions SET status = 'completed', gateway_payment_id = $2 WHERE gateway_order_id = $1 AND type = 'recharge' AND status IN ('pending', 'failed')",
        [txn.gatewayOrderId, `pay_${crypto.randomUUID()}`],
      )).rejects.toThrow(/verified settlement/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await balanceOf(user)).toBe('0.00');
    // The recharge is still there for verified settlement to credit.
    const r = await storage.settleRechargeOrder({ id: `pay_${crypto.randomUUID()}`, orderId: txn.gatewayOrderId!, amountPaise: 50000, currency: 'INR', status: 'captured', amountRefundedPaise: 0 });
    expect(r.kind).toBe('settled');
    expect(await balanceOf(user)).toBe('575.00');
  });

  it('old direct BNPL settlement (completed row from the callback) is refused', async () => {
    const user = await newUser();
    for (const method of ['snapmint', 'lazypay']) {
      await expect(pool.query(
        "INSERT INTO transactions (user_id, amount, type, description, status, payment_method, gateway_order_id) VALUES ($1, '5000.00', 'recharge', 'EMI', 'completed', $2, $3)",
        [user, method, `${method}_${crypto.randomUUID()}`],
      )).rejects.toThrow(/direct BNPL/);
    }
  });

  it('referral bonuses, debits, refunds and review rows are unaffected', async () => {
    const user = await newUser();
    await pool.query("INSERT INTO transactions (user_id, amount, type, description, status) VALUES ($1, '25.00', 'recharge', 'Referral bonus', 'completed')", [user]);
    await pool.query("INSERT INTO transactions (user_id, amount, type, description, status) VALUES ($1, '-10.00', 'debit', 'Report', 'completed')", [user]);
    await pool.query("INSERT INTO transactions (user_id, amount, type, status, payment_method, gateway_order_id, gateway_payment_id) VALUES ($1, '0.00', 'recharge', 'review', 'razorpay', $2, $3)", [user, `order_${crypto.randomUUID()}`, `pay_${crypto.randomUUID()}`]);
  });

  it('re-running migrations keeps exactly one guard', async () => {
    await runMigrations();
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'release_a_recharge_guard'");
    expect(rows[0].n).toBe(1);
  });
});
