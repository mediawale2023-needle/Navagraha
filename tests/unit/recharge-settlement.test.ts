// Phase A2 + Release A: Razorpay verify and webhook share one claim-once settlement that
// credits only Razorpay's own report of the payment; the webhook credits by itself; side
// effects run only for the caller that credited; stale pending recharges are reconciled.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), getWallet: vi.fn(), settleRechargeOrder: vi.fn(), getRechargeByOrderId: vi.fn(),
    createNotification: vi.fn(), getCouponByCode: vi.fn(), incrementCouponUsage: vi.fn(),
    getReferralByReferee: vi.fn(), rewardReferral: vi.fn(), creditWallet: vi.fn(), createTransaction: vi.fn(),
    getStalePendingRecharges: vi.fn(), failPendingRecharge: vi.fn(), updateWalletBalance: vi.fn(), updateTransactionStatus: vi.fn(),
    createPendingRecharge: vi.fn(), countOpenRecharges: vi.fn(), hasCompletedRecharge: vi.fn(), getUserCouponRedemptionCount: vi.fn(),
  },
  notifyUser: vi.fn(),
  fetchPayment: vi.fn(),
  createRazorpayOrder: vi.fn(),
}));
vi.mock('../../server/paymentService', async (orig) => ({
  ...await orig<typeof import('../../server/paymentService')>(),
  fetchPayment: mocks.fetchPayment,
  createRazorpayOrder: mocks.createRazorpayOrder,
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/emailService', () => ({
  sendWelcomeEmail: vi.fn(), sendPaymentReceipt: vi.fn(async () => {}), sendBookingConfirmation: vi.fn(), sendConsultationSummary: vi.fn(),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
vi.mock('../../server/websocketService', () => ({ notifyUser: mocks.notifyUser, notifyAstrologer: vi.fn() }));
import { registerRoutes } from '../../server/routes';
import { reconcilePendingRecharges, ABANDON_AFTER_MS } from '../../server/rechargeSettlement';

let app: Express;
const SECRET = 'rzp_test_secret';
const WEBHOOK_SECRET = 'whsec_test';
const sign = (orderId: string, paymentId: string) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');
const txn = (over: object = {}) => ({ id: 't1', userId: 'payer', amount: '575.00', type: 'recharge', status: 'completed', gatewayOrderId: 'order_1', couponCode: null, gatewayAmountPaise: 50000, gatewayCurrency: 'INR', packBonus: '75.00', couponBonus: '0.00', ...over });
const gw = (over: object = {}) => ({ id: 'pay_1', orderId: 'order_1', amountPaise: 50000, currency: 'INR', status: 'captured', amountRefundedPaise: 0, ...over });
const settled = (over: object = {}, balance = '575.00') => ({ kind: 'settled', transaction: txn(over), balance, paidRupees: 500, coupon: 'none' });

beforeAll(async () => {
  app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.isAuthenticated = (() => Boolean(id)) as typeof req.isAuthenticated;
    if (id) req.user = { id: String(id) };
    req.session = {} as any;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RAZORPAY_KEY_SECRET', SECRET);
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET);
  mocks.storage.getReferralByReferee.mockResolvedValue(undefined);
  mocks.storage.getUser.mockResolvedValue({ id: 'payer', email: null });
  mocks.fetchPayment.mockImplementation(async (id: string) => gw({ id }));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('verify', () => {
  const verify = (user: string, orderId = 'order_1', paymentId = 'pay_1') =>
    request(app).post('/api/payment/razorpay/verify').set('x-user', user).send({ orderId, paymentId, signature: sign(orderId, paymentId) });

  it("settles only the caller's own pending order, with the payment as Razorpay reports it", async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(settled());
    const res = await verify('payer');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, newBalance: 575 });
    expect(mocks.fetchPayment).toHaveBeenCalledWith('pay_1');
    expect(mocks.storage.settleRechargeOrder).toHaveBeenCalledWith(gw(), { signature: expect.any(String), userId: 'payer' });
  });

  it('a payment Razorpay reports against a different order credits nothing', async () => {
    mocks.fetchPayment.mockResolvedValue(gw({ orderId: 'order_other' }));
    expect((await verify('payer')).status).toBe(400);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });

  it('a payment that is only authorised is not credited yet', async () => {
    mocks.fetchPayment.mockResolvedValue(gw({ status: 'authorized' }));
    const res = await verify('payer');
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: false, pending: true });
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });

  it('a payment that does not match its order is held for review, not credited', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ kind: 'mismatch', transaction: txn({ status: 'review' }), reason: 'amount 500 paise, expected 50000' });
    const res = await verify('payer');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('payment_review');
    expect(mocks.storage.createNotification).not.toHaveBeenCalled();
  });

  it('after the webhook already credited, verify succeeds without crediting again', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ kind: 'none' });
    mocks.storage.getRechargeByOrderId.mockResolvedValue(txn());
    mocks.storage.getWallet.mockResolvedValue({ balance: '575.00' });
    const res = await verify('payer');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, alreadyCredited: true, newBalance: 575 });
    expect(mocks.storage.createNotification).not.toHaveBeenCalled();
    expect(mocks.storage.creditWallet).not.toHaveBeenCalled();
  });

  it("another user's order is not found", async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ kind: 'none' });
    mocks.storage.getRechargeByOrderId.mockResolvedValue(txn({ userId: 'someone-else' }));
    expect((await verify('payer')).status).toBe(404);
  });

  it('a bad signature credits nothing', async () => {
    const res = await request(app).post('/api/payment/razorpay/verify').set('x-user', 'payer').send({ orderId: 'order_1', paymentId: 'pay_1', signature: 'forged' });
    expect(res.status).toBe(400);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
    expect(mocks.fetchPayment).not.toHaveBeenCalled();
  });

  it('non-string fields are rejected before any signature work', async () => {
    const res = await request(app).post('/api/payment/razorpay/verify').set('x-user', 'payer').send({ orderId: ['order_1'], paymentId: 'pay_1', signature: sign('order_1', 'pay_1') });
    expect(res.status).toBe(400);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });
});

describe('webhook', () => {
  const hook = (body: object, signature?: string) => {
    const raw = JSON.stringify(body);
    return request(app).post('/api/payment/razorpay/webhook')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', signature ?? crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'))
      .send(raw);
  };
  const captured = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_9', order_id: 'order_9', amount: 50000, currency: 'INR', status: 'captured', notes: { userId: 'spoofed' } } } } };

  it('credits a captured payment by itself, attributed by the order, not by notes', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(settled({ gatewayOrderId: 'order_9' }));
    const res = await hook(captured);
    expect(res.status).toBe(200);
    expect(mocks.storage.settleRechargeOrder).toHaveBeenCalledWith({ id: 'pay_9', orderId: 'order_9', amountPaise: 50000, currency: 'INR', status: 'captured', amountRefundedPaise: 0 }, {});
    expect(mocks.notifyUser).toHaveBeenCalledWith('payer', expect.objectContaining({ type: 'payment_confirmed' }));
  });

  it('a replayed webhook for a settled order has no side effects', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ kind: 'none' });
    await hook(captured);
    expect(mocks.storage.createNotification).not.toHaveBeenCalled();
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it('an unsigned webhook is rejected', async () => {
    expect((await hook(captured, 'bad')).status).toBe(400);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });

  it('a signature over a different body is rejected (no re-serialisation fallback)', async () => {
    const forged = { ...captured, payload: { payment: { entity: { ...captured.payload.payment.entity, amount: 99999900 } } } };
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(captured)).digest('hex');
    expect((await hook(forged, sig)).status).toBe(400);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });

  it('a payment event without an amount is ignored', async () => {
    const noAmount = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_9', order_id: 'order_9' } } } };
    expect((await hook(noAmount)).status).toBe(200);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });

  it('a failed-payment event after capture credits and debits nothing', async () => {
    const failed = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_9', order_id: 'order_9', amount: 50000, currency: 'INR', status: 'failed' } } } };
    expect((await hook(failed)).status).toBe(200);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });
});

describe('referral reward on settlement', () => {
  const verify = () => request(app).post('/api/payment/razorpay/verify').set('x-user', 'payer').send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1', 'pay_1') });

  it('is paid through the atomic once-only reward, and its result is the balance reported', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(settled());
    mocks.storage.getReferralByReferee.mockResolvedValue({ id: 'r1', referrerId: 'friend', refereeId: 'payer', status: 'pending' });
    mocks.storage.rewardReferral.mockResolvedValueOnce({ refereeBalance: '600.00', referrerPaid: true });
    const res = await verify();
    expect(mocks.storage.rewardReferral).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 75, 25, 20);
    expect(res.body.newBalance).toBe(600);
    expect(mocks.storage.creditWallet).not.toHaveBeenCalled();
  });

  it('a token recharge below the referral minimum leaves the referral pending', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ ...settled({ amount: '10.00', gatewayAmountPaise: 1000, packBonus: '0.00' }, '10.00'), paidRupees: 10 });
    mocks.storage.getReferralByReferee.mockResolvedValue({ id: 'r1', referrerId: 'friend', refereeId: 'payer', status: 'pending' });
    const res = await verify();
    expect(res.body.newBalance).toBe(10);
    expect(mocks.storage.rewardReferral).not.toHaveBeenCalled();
  });

  it('an inviter over the monthly cap is not notified of a reward', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(settled());
    mocks.storage.getReferralByReferee.mockResolvedValue({ id: 'r1', referrerId: 'friend', refereeId: 'payer', status: 'pending' });
    mocks.storage.rewardReferral.mockResolvedValueOnce({ refereeBalance: '600.00', referrerPaid: false });
    await verify();
    expect(mocks.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Referral Bonus' }));
    expect(mocks.storage.createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Referral Reward' }));
  });

  it('a reward already paid by a concurrent settlement sends no notification', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(settled());
    mocks.storage.getReferralByReferee.mockResolvedValue({ id: 'r1', referrerId: 'friend', refereeId: 'payer', status: 'pending' });
    mocks.storage.rewardReferral.mockResolvedValueOnce(null);
    const res = await verify();
    expect(res.body.newBalance).toBe(575);
    expect(mocks.storage.createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Referral Bonus' }));
  });
});

describe('direct Snapmint and LazyPay flows are disabled', () => {
  it('a correctly signed LazyPay callback credits nothing', async () => {
    vi.stubEnv('PAYU_MERCHANT_KEY', 'key');
    vi.stubEnv('PAYU_MERCHANT_SALT', 'salt');
    const { verifyPayUResponseHash } = await import('../../server/paymentService');
    const fields: Record<string, string> = { status: 'success', txnid: 'lp_payer_1', amount: '500', productinfo: 'p', firstname: 'f', email: 'e@x.test', key: 'key' };
    // PayU response hash: salt|status|udf10..udf1 (empty)|email|firstname|productinfo|amount|txnid|key.
    const seq = `salt|${fields.status}|||||||||||${fields.email}|${fields.firstname}|${fields.productinfo}|${fields.amount}|${fields.txnid}|key`;
    const hash = crypto.createHash('sha512').update(seq).digest('hex');
    expect(verifyPayUResponseHash({ ...fields, hash })).toBe(true);
    const res = await request(app).post('/api/payment/lazypay/callback').send({ ...fields, hash });
    expect(res.status).toBe(503);
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it.each(['/api/payment/snapmint/order', '/api/payment/lazypay/order', '/api/payment/snapmint/callback'])('%s answers 503 and creates nothing', async (path) => {
    const res = await request(app).post(path).set('x-user', 'payer').send({ amount: 500, status: 'success', user_id: 'payer', order_id: 'x' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('payment_method_unavailable');
  });
});

describe('creating a recharge order (critical: string amount)', () => {
  const order = (body: object) => request(app).post('/api/payment/razorpay/order').set('x-user', 'payer').send(body);
  beforeEach(() => {
    mocks.storage.countOpenRecharges.mockResolvedValue(0);
    mocks.storage.hasCompletedRecharge.mockResolvedValue(false);
    mocks.storage.getUserCouponRedemptionCount.mockResolvedValue(0);
    mocks.createRazorpayOrder.mockImplementation(async ({ amountPaise }: { amountPaise: number }) => ({ id: 'order_new', amount: amountPaise, currency: 'INR' }));
    mocks.storage.createPendingRecharge.mockImplementation(async (d: any) => ({ id: 't_new', ...d }));
  });

  it.each([
    ['a numeric string ("5" once became a ₹500 credit for a ₹5 charge)', '5'],
    ['a string matching a pack', '500'],
    ['zero', 0], ['a negative amount', -100], ['a fraction of a rupee', 10.5], ['NaN', 'NaN'],
    ['below the minimum', 9], ['above the maximum', 10001], ['an object', { valueOf: 500 }], ['an array', [500]], ['a boolean', true], ['missing', undefined],
  ])('rejects %s', async (_label, amount) => {
    const res = await order({ amount });
    expect(res.status).toBe(400);
    expect(mocks.createRazorpayOrder).not.toHaveBeenCalled();
    expect(mocks.storage.createPendingRecharge).not.toHaveBeenCalled();
  });

  it('charges and records the same integer paise, with the bonus kept apart from the payment', async () => {
    const res = await order({ amount: 500, packId: 'pack_500' });
    expect(res.status).toBe(200);
    expect(mocks.createRazorpayOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 50000 }));
    expect(mocks.storage.createPendingRecharge).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 50000, packBonus: 75, quotedCredit: 575 }));
    expect(res.body.totalCredit).toBe(575);
  });

  it('a pack id with another amount is rejected', async () => {
    expect((await order({ amount: 100, packId: 'pack_2000' })).status).toBe(400);
    expect(mocks.createRazorpayOrder).not.toHaveBeenCalled();
  });

  it('too many open recharges are refused before an order is created', async () => {
    mocks.storage.countOpenRecharges.mockResolvedValue(5);
    expect((await order({ amount: 100 })).status).toBe(429);
    expect(mocks.createRazorpayOrder).not.toHaveBeenCalled();
  });

  it('a gateway order for a different amount is not recorded', async () => {
    mocks.createRazorpayOrder.mockResolvedValue({ id: 'order_new', amount: 100, currency: 'INR' });
    expect((await order({ amount: 500 })).status).toBe(502);
    expect(mocks.storage.createPendingRecharge).not.toHaveBeenCalled();
  });
});

describe('reconciling pending recharges', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const stale = () => [
    txn({ id: 'paid', status: 'pending', gatewayOrderId: 'o_paid', createdAt: new Date(now.getTime() - 30 * 60_000) }),
    txn({ id: 'abandoned', status: 'pending', gatewayOrderId: 'o_old', createdAt: new Date(now.getTime() - ABANDON_AFTER_MS - 60_000) }),
    txn({ id: 'recent', status: 'pending', gatewayOrderId: 'o_recent', createdAt: new Date(now.getTime() - 20 * 60_000) }),
  ];
  const fetchPayments = vi.fn(async (orderId: string) => (orderId === 'o_paid' ? [gw({ id: 'pay_p', orderId })] : [gw({ id: 'pay_f', orderId, status: 'failed' })]));

  it('settles a captured payment, fails one unpaid for a day, and leaves a recent one pending', async () => {
    mocks.storage.getStalePendingRecharges.mockResolvedValue(stale());
    mocks.storage.settleRechargeOrder.mockResolvedValue(settled({ gatewayOrderId: 'o_paid' }));
    mocks.storage.failPendingRecharge.mockResolvedValue(true);

    const result = await reconcilePendingRecharges(now, fetchPayments);

    expect(result).toMatchObject({ checked: 3, settled: 1, failed: 1, errors: 0, dryRun: false });
    expect(mocks.storage.settleRechargeOrder).toHaveBeenCalledWith(gw({ id: 'pay_p', orderId: 'o_paid' }), {});
    expect(mocks.storage.failPendingRecharge).toHaveBeenCalledWith('abandoned');
    expect(mocks.storage.failPendingRecharge).not.toHaveBeenCalledWith('recent');
  });

  it('a dry run reports what it would do and changes nothing', async () => {
    mocks.storage.getStalePendingRecharges.mockResolvedValue(stale());
    const result = await reconcilePendingRecharges(now, fetchPayments, { dryRun: true });
    expect(result).toMatchObject({ checked: 3, settled: 1, failed: 1, dryRun: true });
    expect(result.actions.map((a) => [a.transactionId, a.action])).toEqual([['paid', 'settle'], ['abandoned', 'fail']]);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
    expect(mocks.storage.failPendingRecharge).not.toHaveBeenCalled();
  });

  it('only recharges in the requested window are looked at', async () => {
    mocks.storage.getStalePendingRecharges.mockResolvedValue([]);
    const createdAfter = new Date('2026-10-01T00:00:00Z');
    await reconcilePendingRecharges(now, fetchPayments, { createdAfter });
    expect(mocks.storage.getStalePendingRecharges).toHaveBeenCalledWith(expect.any(Date), createdAfter);
  });

  it('a gateway error does not stop the rest, and an order unanswerable for a day stops blocking the queue', async () => {
    mocks.storage.getStalePendingRecharges.mockResolvedValue([
      txn({ id: 'a', gatewayOrderId: 'o_a', status: 'pending', createdAt: new Date(now.getTime() - ABANDON_AFTER_MS - 1) }),
      txn({ id: 'b', gatewayOrderId: 'o_b', status: 'pending', createdAt: new Date(now.getTime() - 30 * 60_000) }),
      txn({ id: 'c', gatewayOrderId: 'o_c', status: 'pending', createdAt: new Date(now.getTime() - 30 * 60_000) }),
    ]);
    mocks.storage.settleRechargeOrder.mockResolvedValue(settled({}, '1.00'));
    mocks.storage.failPendingRecharge.mockResolvedValue(true);
    const fetchPayments = vi.fn(async (orderId: string) => {
      if (orderId !== 'o_b') throw new Error('BAD_REQUEST id does not exist');
      return [gw({ id: 'pay_b', orderId: 'o_b' })];
    });
    expect(await reconcilePendingRecharges(now, fetchPayments)).toMatchObject({ checked: 3, settled: 1, failed: 1, errors: 2 });
    expect(mocks.storage.failPendingRecharge).toHaveBeenCalledWith('a');
    expect(mocks.storage.failPendingRecharge).not.toHaveBeenCalledWith('c');
  });
});

describe('free consultations', () => {
  it('a ₹0/min consultation ticks without charging instead of ending', () => {
    const ws = readFileSync('server/websocketService.ts', 'utf8');
    const tick = ws.slice(ws.indexOf('const timer = setInterval'));
    expect(tick.indexOf('if (!(cost > 0))')).toBeGreaterThan(-1);
    expect(tick.indexOf('if (!(cost > 0))')).toBeLessThan(tick.indexOf('tryDebitBalance'));
  });
});
