// Phase A2: Razorpay verify and webhook share one claim-once settlement; the webhook
// credits by itself; side effects run only for the caller that credited; stale pending
// recharges are reconciled against Razorpay.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import crypto from 'node:crypto';

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), getWallet: vi.fn(), settleRechargeOrder: vi.fn(), getRechargeByOrderId: vi.fn(),
    settleExternalRecharge: vi.fn(), createNotification: vi.fn(), getCouponByCode: vi.fn(), incrementCouponUsage: vi.fn(),
    getReferralByReferee: vi.fn(), claimReferralReward: vi.fn(), creditWallet: vi.fn(), createTransaction: vi.fn(),
    getStalePendingRecharges: vi.fn(), failPendingRecharge: vi.fn(), updateWalletBalance: vi.fn(), updateTransactionStatus: vi.fn(),
  },
  notifyUser: vi.fn(),
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
const txn = (over: object = {}) => ({ id: 't1', userId: 'payer', amount: '575.00', type: 'recharge', status: 'completed', gatewayOrderId: 'order_1', couponCode: null, ...over });

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
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('verify', () => {
  const verify = (user: string, orderId = 'order_1', paymentId = 'pay_1') =>
    request(app).post('/api/payment/razorpay/verify').set('x-user', user).send({ orderId, paymentId, signature: sign(orderId, paymentId) });

  it("settles only the caller's own pending order and reports the credited balance", async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ transaction: txn(), balance: '575.00' });
    const res = await verify('payer');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, newBalance: 575 });
    expect(mocks.storage.settleRechargeOrder).toHaveBeenCalledWith('order_1', 'pay_1', expect.any(String), 'payer');
  });

  it('after the webhook already credited, verify succeeds without crediting again', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(null);
    mocks.storage.getRechargeByOrderId.mockResolvedValue(txn());
    mocks.storage.getWallet.mockResolvedValue({ balance: '575.00' });
    const res = await verify('payer');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, alreadyCredited: true, newBalance: 575 });
    expect(mocks.storage.createNotification).not.toHaveBeenCalled();
    expect(mocks.storage.creditWallet).not.toHaveBeenCalled();
  });

  it("another user's order is not found", async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(null);
    mocks.storage.getRechargeByOrderId.mockResolvedValue(txn({ userId: 'someone-else' }));
    expect((await verify('payer')).status).toBe(404);
  });

  it('a bad signature credits nothing', async () => {
    const res = await request(app).post('/api/payment/razorpay/verify').set('x-user', 'payer').send({ orderId: 'order_1', paymentId: 'pay_1', signature: 'forged' });
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
  const captured = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_9', order_id: 'order_9', notes: { userId: 'spoofed' } } } } };

  it('credits a captured payment by itself, attributed by the order, not by notes', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ transaction: txn({ gatewayOrderId: 'order_9' }), balance: '575.00' });
    const res = await hook(captured);
    expect(res.status).toBe(200);
    expect(mocks.storage.settleRechargeOrder).toHaveBeenCalledWith('order_9', 'pay_9', undefined, undefined);
    expect(mocks.notifyUser).toHaveBeenCalledWith('payer', expect.objectContaining({ type: 'payment_confirmed' }));
  });

  it('a replayed webhook for a settled order has no side effects', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue(null);
    await hook(captured);
    expect(mocks.storage.createNotification).not.toHaveBeenCalled();
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it('an unsigned webhook is rejected', async () => {
    expect((await hook(captured, 'bad')).status).toBe(400);
    expect(mocks.storage.settleRechargeOrder).not.toHaveBeenCalled();
  });
});

describe('referral reward on settlement', () => {
  it('is paid only by the caller that wins the claim', async () => {
    mocks.storage.settleRechargeOrder.mockResolvedValue({ transaction: txn(), balance: '575.00' });
    mocks.storage.getReferralByReferee.mockResolvedValue({ id: 'r1', referrerId: 'friend', status: 'pending' });
    mocks.storage.claimReferralReward.mockResolvedValueOnce(undefined);
    await request(app).post('/api/payment/razorpay/verify').set('x-user', 'payer').send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1', 'pay_1') });
    expect(mocks.storage.creditWallet).not.toHaveBeenCalled();

    mocks.storage.claimReferralReward.mockResolvedValueOnce({ id: 'r1' });
    mocks.storage.creditWallet.mockResolvedValue('600.00');
    const res = await request(app).post('/api/payment/razorpay/verify').set('x-user', 'payer').send({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1', 'pay_1') });
    expect(mocks.storage.creditWallet).toHaveBeenCalledWith('payer', 25);
    expect(mocks.storage.creditWallet).toHaveBeenCalledWith('friend', 75);
    expect(res.body.newBalance).toBe(600);
  });
});

describe('BNPL callbacks credit through the idempotent path', () => {
  it('a replayed LazyPay callback that is already settled notifies nobody', async () => {
    vi.stubEnv('PAYU_MERCHANT_KEY', 'key');
    vi.stubEnv('PAYU_MERCHANT_SALT', 'salt');
    const { verifyPayUResponseHash } = await import('../../server/paymentService');
    const fields: Record<string, string> = { status: 'success', txnid: 'lp_payer_1', amount: '500', productinfo: 'p', firstname: 'f', email: 'e@x.test', key: 'key' };
    // PayU response hash: salt|status|udf10..udf1 (empty)|email|firstname|productinfo|amount|txnid|key.
    const seq = `salt|${fields.status}|||||||||||${fields.email}|${fields.firstname}|${fields.productinfo}|${fields.amount}|${fields.txnid}|key`;
    const hash = crypto.createHash('sha512').update(seq).digest('hex');
    expect(verifyPayUResponseHash({ ...fields, hash })).toBe(true);
    mocks.storage.settleExternalRecharge.mockResolvedValue(null);
    await request(app).post('/api/payment/lazypay/callback').send({ ...fields, hash });
    expect(mocks.storage.settleExternalRecharge).toHaveBeenCalledWith(expect.objectContaining({ userId: 'payer', orderId: 'lp_payer_1', amount: 500 }));
    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.storage.updateWalletBalance).not.toHaveBeenCalled();
  });
});

describe('reconciling pending recharges', () => {
  const now = new Date('2026-10-08T12:00:00Z');

  it('settles a captured payment, fails one unpaid for a day, and leaves a recent one pending', async () => {
    mocks.storage.getStalePendingRecharges.mockResolvedValue([
      txn({ id: 'paid', status: 'pending', gatewayOrderId: 'o_paid', createdAt: new Date(now.getTime() - 30 * 60_000) }),
      txn({ id: 'abandoned', status: 'pending', gatewayOrderId: 'o_old', createdAt: new Date(now.getTime() - ABANDON_AFTER_MS - 60_000) }),
      txn({ id: 'recent', status: 'pending', gatewayOrderId: 'o_recent', createdAt: new Date(now.getTime() - 20 * 60_000) }),
    ]);
    mocks.storage.settleRechargeOrder.mockResolvedValue({ transaction: txn({ gatewayOrderId: 'o_paid' }), balance: '575.00' });
    mocks.storage.failPendingRecharge.mockResolvedValue(true);
    const fetchPayments = vi.fn(async (orderId: string) => (orderId === 'o_paid' ? [{ id: 'pay_p', status: 'captured' }] : [{ id: 'pay_f', status: 'failed' }]));

    const result = await reconcilePendingRecharges(now, fetchPayments);

    expect(result).toEqual({ checked: 3, settled: 1, failed: 1, errors: 0 });
    expect(mocks.storage.settleRechargeOrder).toHaveBeenCalledWith('o_paid', 'pay_p', undefined, undefined);
    expect(mocks.storage.failPendingRecharge).toHaveBeenCalledWith('abandoned');
    expect(mocks.storage.failPendingRecharge).not.toHaveBeenCalledWith('recent');
  });

  it('a gateway error on one recharge does not stop the rest', async () => {
    mocks.storage.getStalePendingRecharges.mockResolvedValue([txn({ id: 'a', gatewayOrderId: 'o_a', status: 'pending' }), txn({ id: 'b', gatewayOrderId: 'o_b', status: 'pending' })]);
    mocks.storage.settleRechargeOrder.mockResolvedValue({ transaction: txn(), balance: '1.00' });
    const fetchPayments = vi.fn(async (orderId: string) => {
      if (orderId === 'o_a') throw new Error('gateway down');
      return [{ id: 'pay_b', status: 'captured' }];
    });
    expect(await reconcilePendingRecharges(now, fetchPayments)).toEqual({ checked: 2, settled: 1, failed: 0, errors: 1 });
  });
});
