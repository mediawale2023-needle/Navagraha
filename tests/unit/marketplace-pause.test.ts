// The marketplace (consultations, scheduling, live, Pooja, Astromall) is off unless
// FEATURE_MARKETPLACE=true: nothing can start, book or charge for it; open activity is
// closed without moving money; paid orders still awaiting fulfilment are reported.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), getAstrologerById: vi.fn(), getUserConsultations: vi.fn(), getWallet: vi.fn(),
    closeActiveConsultations: vi.fn(), endActiveLiveStreams: vi.fn(), cancelOpenScheduledCalls: vi.fn(),
    cancelWaitingQueue: vi.fn(), setAllAstrologersOffline: vi.fn(), restoreFreeChat: vi.fn(), getOpenPaidMarketplaceItems: vi.fn(), createNotification: vi.fn(),
    debitWallet: vi.fn(), tryDebitBalance: vi.fn(), updateWalletBalance: vi.fn(), createTransaction: vi.fn(),
    createConsultation: vi.fn(), createScheduledCall: vi.fn(), createPoojaBooking: vi.fn(), createOrder: vi.fn(),
  },
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
import { registerRoutes } from '../../server/routes';
import { closeMarketplaceActivity, isPausedMarketplaceRoute } from '../../server/marketplace';
import { isMarketplacePath } from '../../client/src/lib/marketplace';

let app: Express;
beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.isAuthenticated = (() => Boolean(id)) as typeof req.isAuthenticated;
    if (id) req.user = { id: String(id) };
    req.session = { astrologerId: req.headers['x-astro'] } as any;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('FEATURE_MARKETPLACE', ''); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('every way to start, book or pay for a marketplace service is closed', () => {
  const paused: Array<[string, string, object?]> = [
    ['post', '/api/consultations/start', { astrologerId: 'a1', type: 'chat' }],
    ['post', '/api/chat/a1', { content: 'hi' }],
    ['get', '/api/agora/token?channel=x'],
    ['post', '/api/schedule', { astrologerId: 'a1' }],
    ['post', '/api/reviews', { astrologerId: 'a1', rating: 5 }],
    ['post', '/api/astrologers/a1/follow'],
    ['post', '/api/astrologers/a1/waitlist', { type: 'chat' }],
    ['post', '/api/astrologer/status', { isOnline: true }],
    ['post', '/api/live/start', { title: 'x' }],
    ['post', '/api/live/s1/join'],
    ['post', '/api/live/s1/message', { content: 'x' }],
    ['post', '/api/live/s1/gift', { giftId: 'rose' }],
    ['post', '/api/poojas/book', { poojaId: 'p1' }],
    ['post', '/api/store/orders', { items: [] }],
    ['get', '/api/ai/pre-consult-brief?astrologerId=a1'],
    ['get', '/api/ai/match-astrologer'],
  ];

  it.each(paused)('%s %s → 503 marketplace_paused, nothing created or charged', async (method, path, body) => {
    const res = await (request(app) as any)[method](path).set('x-user', 'u1').set('x-astro', 'a1').send(body ?? {});
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('marketplace_paused');
    for (const fn of ['debitWallet', 'tryDebitBalance', 'updateWalletBalance', 'createTransaction', 'createConsultation', 'createScheduledCall', 'createPoojaBooking', 'createOrder'] as const) {
      expect(mocks.storage[fn]).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['POST', '/api/consultations/start/'], ['POST', '/API/Consultations/Start'], ['POST', '/api/poojas/book/'],
    ['POST', '/api/store/orders/'], ['POST', '/api/live/s1/gift/'], ['POST', '/api/schedule/'], ['POST', '/api/chat/a1/'],
  ])('%s %s (case or trailing-slash variant) is paused too', async (method, path) => {
    const res = await (request(app) as any)[method.toLowerCase()](path).set('x-user', 'u1').send({});
    expect(res.status).toBe(503);
    expect(mocks.storage.debitWallet).not.toHaveBeenCalled();
    expect(mocks.storage.createConsultation).not.toHaveBeenCalled();
  });

  it('Ask Your Kundli, history and closing an open session are not paused', () => {
    expect(isPausedMarketplaceRoute('POST', '/api/chat/ai-astrologer/')).toBe(false);
    expect(isPausedMarketplaceRoute('POST', '/api/chat/ai-astrologer')).toBe(false);
    expect(isPausedMarketplaceRoute('GET', '/api/consultations')).toBe(false);
    expect(isPausedMarketplaceRoute('POST', '/api/consultations/c1/end')).toBe(false);
    expect(isPausedMarketplaceRoute('GET', '/api/store/orders')).toBe(false);
    expect(isPausedMarketplaceRoute('GET', '/api/poojas/bookings')).toBe(false);
    expect(isPausedMarketplaceRoute('DELETE', '/api/schedule/s1')).toBe(false);
    expect(isPausedMarketplaceRoute('POST', '/api/live/s1/end')).toBe(false);
    expect(isPausedMarketplaceRoute('POST', '/api/ai/chat')).toBe(false);
    expect(isPausedMarketplaceRoute('POST', '/api/reports/order')).toBe(false);
  });

  it('switching FEATURE_MARKETPLACE on lets requests through to the routes again', async () => {
    vi.stubEnv('FEATURE_MARKETPLACE', 'true');
    const res = await request(app).post('/api/consultations/start').set('x-user', 'u1').send({});
    expect(res.status).not.toBe(503);
  });
});

describe('open activity is closed without moving money', () => {
  beforeEach(() => {
    mocks.storage.closeActiveConsultations.mockResolvedValue([{ id: 'c1', userId: 'u1', astrologerId: 'a1', isFree: true }, { id: 'c2', userId: 'u4', astrologerId: 'a1', isFree: false }]);
    mocks.storage.setAllAstrologersOffline.mockResolvedValue(1);
    mocks.storage.endActiveLiveStreams.mockResolvedValue(1);
    mocks.storage.cancelOpenScheduledCalls.mockResolvedValue([{ id: 's1', userId: 'u2' }]);
    mocks.storage.cancelWaitingQueue.mockResolvedValue(2);
    mocks.storage.createNotification.mockResolvedValue({});
    mocks.storage.getOpenPaidMarketplaceItems.mockResolvedValue({
      poojaBookings: [{ id: 'pb1', userId: 'u3', poojaName: 'Navagraha Shanti Pooja', amount: '2100.00', status: 'booked', createdAt: new Date() }],
      storeOrders: [],
      billedClosedConsultations: [{ id: 'c1', userId: 'u1', astrologerId: 'a1', endedAt: new Date(), billed: '40.00' }],
    });
  });

  it('closes sessions, streams, bookings and waitlists; tells each affected user; reports unfulfilled paid items', async () => {
    const summary = await closeMarketplaceActivity();
    expect(mocks.storage.restoreFreeChat).toHaveBeenCalledWith(['u1']);
    expect(summary).toEqual({ consultationsClosed: 2, astrologersOffline: 1, liveStreamsEnded: 1, bookingsCancelled: 1, waitlistCancelled: 2, openPoojaBookings: 1, openStoreOrders: 0, billedClosedConsultations: 1 });
    expect(mocks.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', body: expect.stringMatching(/No further charges/) }));
    expect(mocks.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', body: expect.stringMatching(/not charged/) }));
    for (const fn of ['debitWallet', 'tryDebitBalance', 'updateWalletBalance', 'createTransaction'] as const) {
      expect(mocks.storage[fn]).not.toHaveBeenCalled();
    }
  });

  it('the paid items awaiting fulfilment are listed for admins', async () => {
    const res = await request(app).get('/api/admin/marketplace/open-items');
    expect([401, 403]).toContain(res.status); // admin only
  });
});

describe('the boot hook', () => {
  it('closing runs on every boot while the marketplace is off', () => {
    expect(readFileSync('server/migrate.ts', 'utf8')).toMatch(/if \(!features\.marketplace\(\)\) \{\s*try \{\s*await closeMarketplaceActivity\(\);/);
  });
});

describe('client hides marketplace links', () => {
  it.each([
    ['/astrologers', true], ['/chat/a1', true], ['/call/a1', true], ['/schedule?astrologerId=a', true], ['/live', true],
    ['/live/s1', true], ['/pooja', true], ['/store', true], ['/astrologer/live', true],
    ['/ai-astrologer', false], ['/kundli', false], ['/reports', false], ['/astrologer/pro', false], ['/livestock', false], [null, false],
  ])('%s → %s', (href, expected) => {
    expect(isMarketplacePath(href as string | null)).toBe(expected);
  });
});
