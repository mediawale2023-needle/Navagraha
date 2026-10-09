// Phase A step 1b: another user's consultation, booking or notification cannot be read or
// changed; ending a consultation pays the astrologer once; the Kundli PDF is priced by the server.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), getUserKundlis: vi.fn(async () => []), getConsultationById: vi.fn(), endConsultation: vi.fn(), updateAstrologer: vi.fn(),
    hasEarningForConsultation: vi.fn(), getBilledAmountForConsultation: vi.fn(), createEarning: vi.fn(), createNotification: vi.fn(), getAstrologerById: vi.fn(),
    cancelUserScheduledCall: vi.fn(), updateScheduledCallStatus: vi.fn(), markNotificationRead: vi.fn(),
    getWallet: vi.fn(), createWallet: vi.fn(), getUserTransactions: vi.fn(), updateWalletBalance: vi.fn(), tryDebitBalance: vi.fn(), createTransaction: vi.fn(), purchaseKundliPdf: vi.fn(),
  },
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/emailService', () => ({
  sendWelcomeEmail: vi.fn(), sendPaymentReceipt: vi.fn(), sendBookingConfirmation: vi.fn(), sendConsultationSummary: vi.fn(async () => {}),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
vi.mock('../../server/aiAstrologerService', () => ({
  interpretKundli: vi.fn(), generateReport: vi.fn(), generateLifeReport: vi.fn(), extractMemories: vi.fn(async () => []),
  generatePreConsultBrief: vi.fn(), generatePostConsultFollowUp: vi.fn(async () => null), matchAstrologerToChart: vi.fn(), generateDailyHoroscope: vi.fn(),
}));
import { registerRoutes } from '../../server/routes';

let app: Express;
const consultation = { id: 'c1', userId: 'owner', astrologerId: 'a1', type: 'chat', status: 'active', pricePerMinute: '20', startedAt: new Date() };

beforeAll(async () => {
  app = express(); app.use(express.json());
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
  mocks.storage.getConsultationById.mockResolvedValue(consultation);
  mocks.storage.endConsultation.mockResolvedValue({ ...consultation, status: 'completed', durationSeconds: 300, totalAmount: '100.00' });
  mocks.storage.hasEarningForConsultation.mockResolvedValue(false);
  mocks.storage.getBilledAmountForConsultation.mockResolvedValue(100);
  mocks.storage.getUser.mockResolvedValue({ id: 'owner', email: null });
  mocks.storage.getAstrologerById.mockResolvedValue({ id: 'a1', name: 'Astro' });
  mocks.storage.getWallet.mockResolvedValue({ userId: 'owner', balance: '500.00' });
  mocks.storage.getUserTransactions.mockResolvedValue([{ description: 'Kundli PDF download', status: 'completed' }]);
  mocks.storage.tryDebitBalance.mockResolvedValue('490.00');
  mocks.storage.purchaseKundliPdf.mockResolvedValue({ balance: '490.00', free: false });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('consultations belong to the user who started them', () => {
  it("another user cannot read a consultation", async () => {
    expect((await request(app).get('/api/consultations/c1').set('x-user', 'intruder')).status).toBe(404);
    expect((await request(app).get('/api/consultations/c1').set('x-user', 'owner')).status).toBe(200);
  });

  it("another user cannot end a consultation or create astrologer earnings", async () => {
    const res = await request(app).post('/api/consultations/c1/end').set('x-user', 'intruder');
    expect(res.status).toBe(404);
    expect(mocks.storage.endConsultation).not.toHaveBeenCalled();
    expect(mocks.storage.createEarning).not.toHaveBeenCalled();
  });

  it('ending pays the astrologer once, on what the user was actually charged', async () => {
    // Wall-clock pricing says ₹9999; the user was billed ₹100.
    mocks.storage.endConsultation.mockResolvedValue({ ...consultation, status: 'ended', endedAt: new Date(), durationSeconds: 300, totalAmount: '9999.00' });
    const first = await request(app).post('/api/consultations/c1/end').set('x-user', 'owner');
    expect(first.status).toBe(200);
    expect(mocks.storage.createEarning).toHaveBeenCalledTimes(1);
    expect(mocks.storage.createEarning).toHaveBeenCalledWith(expect.objectContaining({ consultationId: 'c1', grossAmount: '100.00' }));

    mocks.storage.hasEarningForConsultation.mockResolvedValue(true);
    await request(app).post('/api/consultations/c1/end').set('x-user', 'owner');
    expect(mocks.storage.createEarning).toHaveBeenCalledTimes(1);
  });

  it('the usual flow (WebSocket stop ends it moments before the REST call) still finalises once', async () => {
    mocks.storage.getConsultationById.mockResolvedValue({ ...consultation, status: 'ended', endedAt: new Date() });
    mocks.storage.endConsultation.mockResolvedValue({ ...consultation, status: 'ended', endedAt: new Date(), durationSeconds: 300 });
    await request(app).post('/api/consultations/c1/end').set('x-user', 'owner');
    expect(mocks.storage.createEarning).toHaveBeenCalledWith(expect.objectContaining({ grossAmount: '100.00' }));
  });

  it('re-ending an old consultation days later earns nothing and changes nothing', async () => {
    const old = { ...consultation, status: 'ended', endedAt: new Date(Date.now() - 3 * 86_400_000), durationSeconds: 120 };
    mocks.storage.getConsultationById.mockResolvedValue(old);
    mocks.storage.endConsultation.mockResolvedValue(old);
    const res = await request(app).post('/api/consultations/c1/end').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(mocks.storage.createEarning).not.toHaveBeenCalled();
    expect(mocks.storage.updateAstrologer).not.toHaveBeenCalled();
    expect(mocks.storage.createNotification).not.toHaveBeenCalled();
  });

  it('a concurrent end that loses the unique-index race is not an error', async () => {
    mocks.storage.createEarning.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    expect((await request(app).post('/api/consultations/c1/end').set('x-user', 'owner')).status).toBe(200);
  });

  it('nothing is earned when nothing was billed (free minutes, admin access)', async () => {
    mocks.storage.getBilledAmountForConsultation.mockResolvedValue(0);
    await request(app).post('/api/consultations/c1/end').set('x-user', 'owner');
    expect(mocks.storage.createEarning).not.toHaveBeenCalled();
  });
});

describe("bookings and notifications are changed only by their owner", () => {
  it('cancelling a booking is scoped to the signed-in user', async () => {
    mocks.storage.cancelUserScheduledCall.mockResolvedValue(undefined);
    const res = await request(app).delete('/api/schedule/s1').set('x-user', 'intruder');
    expect(res.status).toBe(404);
    expect(mocks.storage.cancelUserScheduledCall).toHaveBeenCalledWith('s1', 'intruder');
    expect(mocks.storage.updateScheduledCallStatus).not.toHaveBeenCalled();
  });

  it('marking a notification read is scoped to the signed-in user', async () => {
    await request(app).put('/api/notifications/n1/read').set('x-user', 'u2');
    expect(mocks.storage.markNotificationRead).toHaveBeenCalledWith('n1', 'u2');
  });
});

describe('the Kundli PDF is priced by the server', () => {
  it('a client-supplied amount is ignored: ₹10 is charged whatever the request says', async () => {
    const res = await request(app).post('/api/wallet/deduct').set('x-user', 'owner')
      .send({ amount: 0.01, description: 'Kundli PDF download' });
    expect(res.status).toBe(200);
    expect(mocks.storage.purchaseKundliPdf).toHaveBeenCalledWith('owner', 10, 'Kundli PDF download');
  });

  it('nothing else can be bought through this route', async () => {
    const res = await request(app).post('/api/wallet/deduct').set('x-user', 'owner').send({ amount: 1, description: 'Complete Life Report' });
    expect(res.status).toBe(400);
    expect(mocks.storage.purchaseKundliPdf).not.toHaveBeenCalled();
  });

  it('reports a free first PDF as free', async () => {
    mocks.storage.purchaseKundliPdf.mockResolvedValue({ balance: '500.00', free: true });
    const res = await request(app).post('/api/wallet/deduct').set('x-user', 'owner').send({ description: 'Kundli PDF download' });
    expect(res.body).toMatchObject({ free: true, balance: '500.00' });
  });

  it('an empty wallet gets 402 with the price', async () => {
    mocks.storage.purchaseKundliPdf.mockResolvedValue(null);
    const res = await request(app).post('/api/wallet/deduct').set('x-user', 'owner').send({ description: 'Kundli PDF download' });
    expect(res.status).toBe(402);
    expect(res.body.required).toBe(10);
  });
});
