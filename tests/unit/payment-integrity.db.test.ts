// Release A: recharge settlement against a real Postgres. A payment is credited only as the
// gateway reports it (amount, currency, order); coupons and referrals are re-checked at
// settlement under locks, so concurrent payments cannot exceed an offer's limits.
// Runs only when TEST_DATABASE_URL points at a disposable database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('recharge settlement integrity (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];

  const uid = () => crypto.randomUUID();
  const newUser = async () => {
    const id = uid();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${id}@pay.test`]);
    return id;
  };
  const balanceOf = async (id: string) =>
    (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0]?.balance ?? '0';
  const payment = (orderId: string, paise: number, over: object = {}) =>
    ({ id: `pay_${uid()}`, orderId, amountPaise: paise, currency: 'INR', status: 'captured', amountRefundedPaise: 0, ...over });
  const newCoupon = async (over: Record<string, unknown> = {}) => {
    const c = { code: `T${uid().slice(0, 8)}`, discount_type: 'flat', discount_value: 50, min_amount: 0, per_user_limit: 1, usage_limit: null, first_recharge_only: false, ...over };
    const { rows } = await pool.query(
      'INSERT INTO coupons (code, discount_type, discount_value, min_amount, per_user_limit, usage_limit, first_recharge_only) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, code',
      [c.code, c.discount_type, c.discount_value, c.min_amount, c.per_user_limit, c.usage_limit, c.first_recharge_only],
    );
    return rows[0] as { id: string; code: string };
  };
  const order = (userId: string, rupees: number, extra: { packBonus?: number; coupon?: { id: string; code: string; bonus: number } } = {}) =>
    storage.createPendingRecharge({
      userId, orderId: `order_${uid()}`, amountPaise: rupees * 100, packBonus: extra.packBonus ?? 0, coupon: extra.coupon,
      quotedCredit: rupees + (extra.packBonus ?? 0) + (extra.coupon?.bonus ?? 0), description: 'Wallet recharge',
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    const { runMigrations } = await import('../../server/migrate');
    await runMigrations();
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('credits the payment plus the pack bonus fixed at order time', async () => {
    const user = await newUser();
    const txn = await order(user, 500, { packBonus: 75 });
    const r = await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 50000));
    expect(r.kind).toBe('settled');
    expect(await balanceOf(user)).toBe('575.00');
    const { rows } = await pool.query('SELECT amount, gateway_amount_paise, gateway_currency, pack_bonus FROM transactions WHERE id = $1', [txn.id]);
    expect(rows[0]).toMatchObject({ amount: '575.00', gateway_amount_paise: 50000, gateway_currency: 'INR', pack_bonus: '75.00' });
  });

  it.each([
    ['less than the order (the "5" → ₹500 exploit)', { amountPaise: 500 }],
    ['more than the order', { amountPaise: 5000000 }],
    ['another currency', { currency: 'USD' }],
  ])('a payment for %s is held for review and credits nothing', async (_l, over) => {
    const user = await newUser();
    const txn = await order(user, 500);
    const r = await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 50000, over));
    expect(r.kind).toBe('mismatch');
    expect(await balanceOf(user)).toBe('0');
    const { rows } = await pool.query('SELECT status, review_reason FROM transactions WHERE id = $1', [txn.id]);
    expect(rows[0].status).toBe('review');
    expect(rows[0].review_reason).toBeTruthy();
    // A review row is not claimable again by a correct-looking replay.
    expect((await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 50000))).kind).toBe('none');
  });

  it('a payment reported for a different order credits nothing', async () => {
    const user = await newUser();
    const txn = await order(user, 100);
    const r = await storage.settleRechargeOrder({ ...payment(txn.gatewayOrderId!, 10000), orderId: 'order_elsewhere' });
    expect(r.kind).toBe('none');
    expect(await balanceOf(user)).toBe('0');
  });

  it('a payment that is not captured credits nothing and leaves the recharge pending', async () => {
    const user = await newUser();
    const txn = await order(user, 100);
    expect((await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 10000, { status: 'authorized' }))).kind).toBe('none');
    const { rows } = await pool.query('SELECT status FROM transactions WHERE id = $1', [txn.id]);
    expect(rows[0].status).toBe('pending');
  });

  it('a legacy pending row inflated by a string amount is credited only what was paid', async () => {
    const user = await newUser();
    const orderId = `order_${uid()}`;
    // Before Release A, amount "5" with no pack was stored as "500" (string concatenation) and charged ₹5.
    await pool.query(
      "INSERT INTO transactions (user_id, amount, type, status, payment_method, gateway_order_id) VALUES ($1, '500.00', 'recharge', 'pending', 'razorpay', $2)",
      [user, orderId],
    );
    expect((await storage.settleRechargeOrder(payment(orderId, 500))).kind).toBe('settled');
    expect(await balanceOf(user)).toBe('5.00');
  });

  it('settlement interrupted mid-transaction leaves the recharge claimable and the wallet untouched', async () => {
    const user = await newUser();
    const txn = await order(user, 100);
    // Simulate a crash inside the settlement transaction: a payment id already used elsewhere
    // makes the claim's UPDATE fail on the unique index, rolling everything back.
    const used = `pay_${uid()}`;
    await pool.query("INSERT INTO transactions (user_id, amount, type, status, gateway_payment_id) VALUES ($1, '1.00', 'debit', 'completed', $2)", [user, used]);
    await expect(storage.settleRechargeOrder({ ...payment(txn.gatewayOrderId!, 10000), id: used })).rejects.toThrow();
    expect(await balanceOf(user)).toBe('0');
    expect((await pool.query('SELECT status FROM transactions WHERE id = $1', [txn.id])).rows[0].status).toBe('pending');
    expect((await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 10000))).kind).toBe('settled');
    expect(await balanceOf(user)).toBe('100.00');
  });

  it('two orders staged with a once-per-user coupon: settled concurrently, the bonus is paid once', async () => {
    const user = await newUser();
    const coupon = await newCoupon({ per_user_limit: 1 });
    const a = await order(user, 200, { coupon: { ...coupon, bonus: 50 } });
    const b = await order(user, 200, { coupon: { ...coupon, bonus: 50 } });
    const results = await Promise.all([
      storage.settleRechargeOrder(payment(a.gatewayOrderId!, 20000)),
      storage.settleRechargeOrder(payment(b.gatewayOrderId!, 20000)),
    ]);
    expect(results.map((r) => r.kind)).toEqual(['settled', 'settled']);
    expect(results.map((r) => (r as any).coupon).sort()).toEqual(['applied', 'void']);
    expect(await balanceOf(user)).toBe('450.00'); // 200 + 200 + one ₹50 bonus
    const { rows } = await pool.query('SELECT times_used FROM coupons WHERE id = $1', [coupon.id]);
    expect(rows[0].times_used).toBe(1);
    const red = await pool.query('SELECT status FROM coupon_redemptions WHERE coupon_id = $1 ORDER BY status', [coupon.id]);
    expect(red.rows.map((r: any) => r.status)).toEqual(['applied', 'void']);
  });

  it("a coupon's global usage limit holds under concurrent settlements from different users", async () => {
    const coupon = await newCoupon({ usage_limit: 2, per_user_limit: 5 });
    const users = await Promise.all(Array.from({ length: 5 }, newUser));
    const orders = await Promise.all(users.map((u) => order(u, 100, { coupon: { ...coupon, bonus: 50 } })));
    const results = await Promise.all(orders.map((o) => storage.settleRechargeOrder(payment(o.gatewayOrderId!, 10000))));
    expect(results.filter((r) => (r as any).coupon === 'applied')).toHaveLength(2);
    expect((await pool.query('SELECT times_used FROM coupons WHERE id = $1', [coupon.id])).rows[0].times_used).toBe(2);
  });

  it('a first-recharge coupon staged on two orders applies to only one of them', async () => {
    const user = await newUser();
    const coupon = await newCoupon({ first_recharge_only: true, per_user_limit: 5 });
    const a = await order(user, 100, { coupon: { ...coupon, bonus: 50 } });
    const b = await order(user, 100, { coupon: { ...coupon, bonus: 50 } });
    const results = await Promise.all([a, b].map((o) => storage.settleRechargeOrder(payment(o.gatewayOrderId!, 10000))));
    expect(results.filter((r) => (r as any).coupon === 'applied')).toHaveLength(1);
    expect(await balanceOf(user)).toBe('250.00');
  });

  it('an offer quoted at order time is honoured when the payment settles after it expires or is switched off', async () => {
    const user = await newUser();
    const coupon = await newCoupon();
    const txn = await order(user, 100, { coupon: { ...coupon, bonus: 50 } });
    await pool.query("UPDATE transactions SET created_at = now() - interval '10 minutes' WHERE id = $1", [txn.id]);
    await pool.query("UPDATE coupons SET is_active = false, valid_until = now() - interval '1 minute' WHERE id = $1", [coupon.id]);
    const r = await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 10000));
    expect(r).toMatchObject({ kind: 'settled', coupon: 'applied' });
    expect(await balanceOf(user)).toBe('150.00');
  });

  it('an offer that had already expired when the order was created is not paid', async () => {
    const user = await newUser();
    const coupon = await newCoupon();
    const txn = await order(user, 100, { coupon: { ...coupon, bonus: 50 } });
    await pool.query("UPDATE coupons SET valid_until = $2 WHERE id = $1", [coupon.id, new Date(Date.now() - 3_600_000)]);
    await pool.query("UPDATE transactions SET created_at = now() - interval '30 minutes' WHERE id = $1", [txn.id]);
    expect(await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 10000))).toMatchObject({ kind: 'settled', coupon: 'void' });
    expect(await balanceOf(user)).toBe('100.00');
  });

  it('a voided redemption does not use up the offer at order time', async () => {
    const user = await newUser();
    const coupon = await newCoupon({ per_user_limit: 1 });
    const a = await order(user, 100, { coupon: { ...coupon, bonus: 50 } });
    const b = await order(user, 100, { coupon: { ...coupon, bonus: 50 } });
    await Promise.all([a, b].map((o) => storage.settleRechargeOrder(payment(o.gatewayOrderId!, 10000))));
    expect(await storage.getUserCouponRedemptionCount(user, coupon.id)).toBe(1); // applied once, voided once
  });

  it('a referral bonus is not a first recharge', async () => {
    const user = await newUser();
    await pool.query("INSERT INTO transactions (user_id, amount, type, status, description) VALUES ($1, '25.00', 'recharge', 'completed', 'Referral bonus')", [user]);
    expect(await storage.hasCompletedRecharge(user)).toBe(false);
  });

  it('a partly refunded payment is held for review, not credited', async () => {
    const user = await newUser();
    const txn = await order(user, 500);
    const r = await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 50000, { amountRefundedPaise: 10000 }));
    expect(r.kind).toBe('mismatch');
    expect(await balanceOf(user)).toBe('0');
  });

  it('a second captured payment on an order already credited is recorded for review, never credited', async () => {
    const user = await newUser();
    const txn = await order(user, 100);
    expect((await storage.settleRechargeOrder(payment(txn.gatewayOrderId!, 10000))).kind).toBe('settled');
    const second = payment(txn.gatewayOrderId!, 10000);
    const r = await storage.settleRechargeOrder(second);
    expect(r.kind).toBe('mismatch');
    expect(await balanceOf(user)).toBe('100.00');
    expect((await storage.settleRechargeOrder(second)).kind).toBe('none'); // recorded once
    const review = await storage.getRechargesForReview();
    expect(review.find((x) => x.gatewayPaymentId === second.id)?.reviewReason).toMatch(/second payment/);
    // The first payment's verify, replayed, still finds the order credited.
    expect((await storage.getRechargeByOrderId(txn.gatewayOrderId!))?.status).toBe('completed');
  });

  it('one transaction cannot carry two coupon redemptions', async () => {
    const user = await newUser();
    const coupon = await newCoupon({ per_user_limit: 5 });
    const txn = await order(user, 100, { coupon: { ...coupon, bonus: 50 } });
    await expect(pool.query(
      "INSERT INTO coupon_redemptions (coupon_id, user_id, transaction_id, discount_amount, status) VALUES ($1, $2, $3, 50, 'staged')",
      [coupon.id, user, txn.id],
    )).rejects.toThrow(/coupon_redemptions_transaction_uq/);
  });

  it("an inviter's referral rewards stop at the monthly cap; invitees are still rewarded", async () => {
    const referrer = await newUser();
    const referees = await Promise.all(Array.from({ length: 4 }, newUser));
    const referrals = [];
    for (const r of referees) {
      const { rows } = await pool.query("INSERT INTO referrals (referrer_id, referee_id, status) VALUES ($1, $2, 'pending') RETURNING id", [referrer, r]);
      referrals.push({ id: rows[0].id, referrerId: referrer, refereeId: r });
    }
    const results = await Promise.all(referrals.map((r) => storage.rewardReferral(r, 75, 25, 2)));
    expect(results.filter((r) => r?.referrerPaid)).toHaveLength(2);
    expect(await balanceOf(referrer)).toBe('150.00');
    for (const r of referees) expect(await balanceOf(r)).toBe('25.00');
  });
});
