// Release B: Ask pack routes. Flag-gated, server prices only, request id required, and every
// refusal is a clear status with nothing charged.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), getWallet: vi.fn(), purchaseAskPack: vi.fn(), getAskEntitlements: vi.fn(), getAskAllowance: vi.fn(),
  },
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/emailService', () => ({
  sendWelcomeEmail: vi.fn(), sendPaymentReceipt: vi.fn(), sendBookingConfirmation: vi.fn(), sendConsultationSummary: vi.fn(),
  sendVerificationEmail: vi.fn(), emailConfigured: vi.fn(() => false),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
import { registerRoutes } from '../../server/routes';

let app: Express;
const auditLines: string[] = [];
beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.isAuthenticated = (() => Boolean(id)) as typeof req.isAuthenticated;
    if (id) req.user = { id: String(id), email: 'buyer@example.com', emailVerifiedAt: new Date() } as any;
    req.session = {} as any;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  auditLines.length = 0;
  vi.spyOn(console, 'log').mockImplementation((...a) => { if (String(a[0]).startsWith('[audit]')) auditLines.push(a.join(' ')); });
  vi.stubEnv('FEATURE_ASK_PACKS', 'true');
  mocks.storage.getAskAllowance.mockResolvedValue({ freeQuestionsUsed: 3, freeQuestionsRemaining: 0, paidQuestionsRemaining: 5, followUpsRemaining: null });
  mocks.storage.getAskEntitlements.mockResolvedValue([]);
  mocks.storage.getWallet.mockResolvedValue({ balance: '120.00' });
  mocks.storage.purchaseAskPack.mockResolvedValue({ kind: 'purchased', balance: '21.00', entitlement: { id: 'e1', quantity: 5, followUpsEach: 2, transactionId: 't1' } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const buy = (body: Record<string, unknown>) => request(app).post('/api/ask/packs/purchase').set('x-user', 'u1').send(body);
const REQ = 'req_0123456789abcdef';

describe('GET /api/ask/packs', () => {
  it('lists the catalogue with two follow-ups each when enabled', async () => {
    const res = await request(app).get('/api/ask/packs').set('x-user', 'u1');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.packs).toEqual([
      { id: 'ask_1', questions: 1, price: 29, followUpsEach: 2 },
      { id: 'ask_5', questions: 5, price: 99, followUpsEach: 2 },
      { id: 'ask_12', questions: 12, price: 199, followUpsEach: 2 },
    ]);
    expect(res.body).toMatchObject({ balance: '120.00', allowance: { paidQuestionsRemaining: 5 } });
  });

  it('offers nothing while the flag is off', async () => {
    vi.stubEnv('FEATURE_ASK_PACKS', 'false');
    const res = await request(app).get('/api/ask/packs').set('x-user', 'u1');
    expect(res.body).toMatchObject({ enabled: false, packs: [] });
  });

  it('needs sign-in', async () => {
    expect((await request(app).get('/api/ask/packs')).status).toBe(401);
  });
});

describe('POST /api/ask/packs/purchase', () => {
  it('is 404 while the flag is off and charges nothing', async () => {
    vi.stubEnv('FEATURE_ASK_PACKS', 'false');
    const res = await buy({ packId: 'ask_5', requestId: REQ });
    expect(res.status).toBe(404);
    expect(mocks.storage.purchaseAskPack).not.toHaveBeenCalled();
  });

  it('uses the server price and quantity, ignoring any sent by the client', async () => {
    const res = await buy({ packId: 'ask_5', requestId: REQ, price: 1, questions: 500 });
    expect(res.status).toBe(201);
    expect(mocks.storage.purchaseAskPack).toHaveBeenCalledWith('u1', { id: 'ask_5', questions: 5, price: 99, followUpsEach: 2 }, REQ);
    expect(res.body).toMatchObject({ replayed: false, questions: 5, followUpsEach: 2, newBalance: '21.00' });
  });

  it.each([[{ packId: 'ask_999', requestId: REQ }], [{ requestId: REQ }], [{ packId: 'ask_1' }], [{ packId: 'ask_1', requestId: 'bad id!' }]])('refuses %j with 400', async (body) => {
    expect((await buy(body)).status).toBe(400);
    expect(mocks.storage.purchaseAskPack).not.toHaveBeenCalled();
  });

  it('insufficient balance: 402 with the price', async () => {
    mocks.storage.purchaseAskPack.mockResolvedValue({ kind: 'insufficient' });
    const res = await buy({ packId: 'ask_12', requestId: REQ });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ code: 'insufficient_balance', required: 199 });
  });

  it('admins are told they already ask without limit', async () => {
    mocks.storage.purchaseAskPack.mockResolvedValue({ kind: 'free_access' });
    const res = await buy({ packId: 'ask_1', requestId: REQ });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('free_access_unlimited');
  });

  it('a replay answers 200 without a second debit event', async () => {
    mocks.storage.purchaseAskPack.mockResolvedValue({ kind: 'replay', balance: '21.00', entitlement: { id: 'e1', quantity: 5, followUpsEach: 2, transactionId: 't1' } });
    const res = await buy({ packId: 'ask_5', requestId: REQ });
    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);
    expect(auditLines.some((l) => l.includes('wallet.debit'))).toBe(false);
  });

  it('audit events carry ids and amounts, never the email', async () => {
    await buy({ packId: 'ask_5', requestId: REQ });
    expect(auditLines.some((l) => l.includes('ask.pack_purchased'))).toBe(true);
    expect(auditLines.join('\n')).not.toContain('buyer@example.com');
  });

  it('a storage failure says nothing was charged', async () => {
    mocks.storage.purchaseAskPack.mockRejectedValue(new Error('db down'));
    const res = await buy({ packId: 'ask_1', requestId: REQ });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/not been charged/);
  });
});
