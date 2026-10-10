import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { getKundli } from '../../server/astroEngine';
import { computeJyotishChart } from '../../server/astroEngine/jyotishEngine';

const mocks = vi.hoisted(() => ({
  storage: {
    getKundliById: vi.fn(), getUser: vi.fn(), getUserKundlis: vi.fn(), persistLegacyUpgrade: vi.fn(),
    getJyotishProfileById: vi.fn(), getJyotishReadingById: vi.fn(), consumeProAiCredit: vi.fn(), refundProAiCredit: vi.fn(), getAstrologerById: vi.fn(), getAiUsageToday: vi.fn(), createJyotishSessionQuery: vi.fn(),
    saveAiChatMessage: vi.fn(), getUserMemories: vi.fn(), getPredictionFeedbacksByUser: vi.fn(), getPatternStatistics: vi.fn(),
    getReportTypeById: vi.fn(), debitWallet: vi.fn(), createReportOrder: vi.fn(), placeReportOrder: vi.fn(), setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), getDailyHoroscope: vi.fn(), updateJyotishReading: vi.fn(),
  },
  answerSessionQuery: vi.fn(), streamTraditionReading: vi.fn(), generateDailyHoroscope: vi.fn(),
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/jyotishAiService', () => ({ streamTraditionReading: mocks.streamTraditionReading, answerSessionQuery: mocks.answerSessionQuery }));
vi.mock('../../server/aiAstrologerService', () => ({
  interpretKundli: vi.fn(async () => ({ content: 'ok' })), generateReport: vi.fn(), generateLifeReport: vi.fn(), extractMemories: vi.fn(async () => []),
  generatePreConsultBrief: vi.fn(), generatePostConsultFollowUp: vi.fn(), matchAstrologerToChart: vi.fn(), generateDailyHoroscope: mocks.generateDailyHoroscope,
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
import { registerRoutes } from '../../server/routes';

let app: Express;
let exact: any;
let approx: any;
const profileA = { id: 'pA', astrologerId: 'astroA', name: 'A', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru', latitude: '12.9716', longitude: '77.5946' };
const profileB = { ...profileA, id: 'pB', astrologerId: 'astroB', dateOfBirth: '1969-01-20', timeOfBirth: '05:00', placeOfBirth: 'New York', latitude: '40.7128', longitude: '-74.006' };
let readingB: any;

beforeAll(async () => {
  const base = { userId: 'owner', name: 'Owner', placeOfBirth: 'Bengaluru', latitude: '12.9716', longitude: '77.5946', timeOfBirth: '06:30', dateOfBirth: new Date('1990-08-15T00:00:00Z') };
  exact = { ...await getKundli('1990-08-15', '06:30', 12.9716, 77.5946), ...base, id: 'exact' };
  approx = { ...await getKundli('1990-08-15', '06:30', 12.9716, 77.5946, { timeAccuracy: 'approximate' }), ...base, id: 'approx' };
  readingB = { id: 'rB', profileId: 'pB', chartData: computeJyotishChart(profileB.dateOfBirth, profileB.timeOfBirth, 40.7128, -74.006).chartData };
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => Boolean(req.headers['x-user'])) as typeof req.isAuthenticated;
    if (req.headers['x-user']) req.user = { id: String(req.headers['x-user']) };
    req.session = { astrologerId: req.headers['x-astro'] } as any;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
  const kundlis: Record<string, any> = { exact, approx, legacy: { ...exact, id: 'legacy', latitude: null, longitude: null, chartData: { planetaryPositions: [], houses: [] } } };
  mocks.storage.getKundliById.mockImplementation(async (id: string) => kundlis[id]);
  mocks.storage.getJyotishProfileById.mockImplementation(async (id: string) => ({ pA: profileA, pB: profileB } as any)[id]);
  mocks.storage.getJyotishReadingById.mockImplementation(async (id: string) => (id === 'rB' ? readingB : undefined));
  mocks.storage.consumeProAiCredit.mockResolvedValue({ ok: true, used: 1, limit: 80 });
  mocks.storage.refundProAiCredit.mockResolvedValue(undefined);
  mocks.storage.getAstrologerById.mockImplementation(async (id: string) => ({ id, isVerified: id !== 'unverified' }));
  mocks.storage.getAiUsageToday.mockResolvedValue({ calls: 0, costMicroUsd: 0 });
  mocks.answerSessionQuery.mockResolvedValue('answer');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('Pro session queries are tenant-isolated', () => {
  const ask = (body: object, astro = 'astroA') =>
    request(app).post('/api/astrologer/pro/session-queries').set('x-astro', astro).send({ tradition: 'parashar', question: 'career?', ...body });

  it("ignores another tenant's readingId: the chart is recomputed for this profile and the foreign id is not recorded", async () => {
    const res = await ask({ profileId: 'pA', readingId: 'rB' });
    expect(res.status).toBe(200);
    const chartData = mocks.answerSessionQuery.mock.calls[0][2];
    expect(chartData.canonical.birth.localDate).toBe('1990-08-15');
    expect(chartData).not.toBe(readingB.chartData);
    expect(mocks.storage.createJyotishSessionQuery.mock.calls[0][0].readingId).toBeUndefined();
  });
  it("cannot open another astrologer's profile, and spends no credit trying", async () => {
    expect((await ask({ profileId: 'pB' })).status).toBe(404);
    expect(mocks.storage.consumeProAiCredit).not.toHaveBeenCalled();
    expect(mocks.answerSessionQuery).not.toHaveBeenCalled();
  });
  it('a profile whose birth data cannot be computed is a 400 and costs no credit', async () => {
    mocks.storage.getJyotishProfileById.mockResolvedValueOnce({ ...profileA, timeOfBirth: '99:99' });
    const res = await ask({ profileId: 'pA' });
    expect(res.status).toBe(400);
    expect(mocks.storage.consumeProAiCredit).not.toHaveBeenCalled();
  });
  it('requires an astrologer session', async () => {
    expect((await request(app).post('/api/astrologer/pro/session-queries').send({ profileId: 'pA', tradition: 'parashar', question: 'x' })).status).toBe(401);
  });
});

describe('malformed identifiers never reach a 500 or another user', () => {
  it.each(["' OR 1=1 --", '..%2F..%2Fetc', 'x'.repeat(2000), '%00'])('GET /api/kundli/%s → 404', async (id) => {
    for (const suffix of ['', '/insights', '/transits']) {
      const res = await request(app).get(`/api/kundli/${encodeURIComponent(id)}${suffix}`).set('x-user', 'owner');
      expect(res.status).toBe(404);
    }
  });
  it("another user's chart is 404 on every chart route", async () => {
    for (const suffix of ['', '/insights', '/transits']) {
      expect((await request(app).get(`/api/kundli/exact${suffix}`).set('x-user', 'intruder')).status).toBe(404);
    }
  });
});

describe('rate limits', () => {
  it('AI chat is throttled per user', async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await request(app).post('/api/ai/chat').set('x-user', 'flooder').send({})).status;
    expect(last).toBe(429);
    // A different user is unaffected.
    expect((await request(app).post('/api/ai/chat').set('x-user', 'someone-else').send({})).status).not.toBe(429);
  });
});

describe('transits respect birth-time accuracy', () => {
  it('omits Lagna-based houses for an approximate birth time', async () => {
    const res = await request(app).get('/api/kundli/approx/transits').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.natalLagnaSign).toBeNull();
    for (const p of res.body.planets) expect(p.houseFromLagna).toBeNull();
  });
  it('uses the canonical Lagna for an exact birth time', async () => {
    const res = await request(app).get('/api/kundli/exact/transits').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.natalLagnaSign).toBe(exact.chartData.canonical.ascendant.sign);
  });
});

describe('GET /api/panchang', () => {
  it('without a location, says it is the New Delhi default', async () => {
    const res = await request(app).get('/api/panchang?date=2024-06-21');
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ isDefault: true, timezone: 'Asia/Kolkata', place: 'New Delhi, India' });
  });
  it('uses the supplied location and its time zone', async () => {
    const res = await request(app).get('/api/panchang?date=2024-06-21&lat=51.5074&lng=-0.1278&place=London');
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ isDefault: false, timezone: 'Europe/London', utcOffset: '+01:00', place: 'London' });
  });
  it('is a 400, not an invented sunrise, during polar day; and a 400 for bad input', async () => {
    expect((await request(app).get('/api/panchang?date=2024-06-21&lat=69.6492&lng=18.9553')).status).toBe(400);
    expect((await request(app).get('/api/panchang?date=2024-13-01')).status).toBe(400);
    expect((await request(app).get('/api/panchang?lat=abc&lng=1')).status).toBe(400);
  });
});

describe('launch review fixes', () => {
  it('a paid report is refused (409) before any debit when the chart has no verified V3 calculation', async () => {
    mocks.storage.getReportTypeById.mockResolvedValue({ id: 't', name: 'Career', category: 'career', isActive: true, price: '299' });
    const res = await request(app).post('/api/reports/order').set('x-user', 'owner').send({ kundliId: 'legacy', reportTypeId: 't' });
    expect(res.status).toBe(409);
    expect(mocks.storage.placeReportOrder).not.toHaveBeenCalled();
  });
  it('the Complete Life Report is refused (409) before any debit for an approximate birth time', async () => {
    mocks.storage.getReportTypeById.mockResolvedValue({ id: 't', name: 'Complete Life Report', category: 'life_complete', isActive: true, price: '1499' });
    const res = await request(app).post('/api/reports/order').set('x-user', 'owner').send({ kundliId: 'approx', reportTypeId: 't' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/exact birth time/);
    expect(mocks.storage.placeReportOrder).not.toHaveBeenCalled();
  });
  it('a catalogue entry whose category cannot be generated is not sold', async () => {
    mocks.storage.getReportTypeById.mockResolvedValue({ id: 't', name: 'Health', category: 'health', isActive: true, price: '249' });
    const res = await request(app).post('/api/reports/order').set('x-user', 'owner').send({ kundliId: 'approx', reportTypeId: 't' });
    expect(res.status).toBe(404);
    expect(mocks.storage.placeReportOrder).not.toHaveBeenCalled();
  });
  it('the personal horoscope is never generated from a pre-V3 chart', async () => {
    mocks.storage.getUserKundlis.mockResolvedValue([{ ...exact, id: 'legacy', latitude: null, longitude: null, chartData: { planetaryPositions: [] } }]);
    const res = await request(app).get('/api/horoscope/personal').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasChart: false, limitedReason: expect.any(String) });
    expect(mocks.generateDailyHoroscope).not.toHaveBeenCalled();
  });
  it('a pro reading stored with a pre-V3 chart is regenerated from the canonical chart', async () => {
    mocks.storage.getJyotishReadingById.mockResolvedValue({ id: 'rOld', profileId: 'pA', chartData: { planets: [], legacy: true }, language: 'English' });
    mocks.streamTraditionReading.mockResolvedValue('reading');
    const res = await request(app).post('/api/astrologer/pro/readings/rOld/generate').set('x-astro', 'astroA').send({ tradition: 'parashar' });
    expect(res.status).toBe(200);
    const chartData = mocks.streamTraditionReading.mock.calls[0][2];
    expect(chartData.canonical.birth.localDate).toBe('1990-08-15');
  });
  it('over-long chat messages are rejected before any model call', async () => {
    expect((await request(app).post('/api/ai/chat').set('x-user', 'msg-cap').send({ message: 'x'.repeat(2001) })).status).toBe(400);
  });
});

describe('Pro workspace eligibility and AI credits (Release A)', () => {
  const ask = (astro: string) =>
    request(app).post('/api/astrologer/pro/session-queries').set('x-astro', astro).send({ profileId: 'pA', tradition: 'parashar', question: 'career?' });

  it('an astrologer who registered but is not verified cannot use the Pro workspace or its AI', async () => {
    mocks.storage.getJyotishProfileById.mockResolvedValue({ ...profileA, astrologerId: 'unverified' });
    const res = await ask('unverified');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('pro_requires_verification');
    expect(mocks.storage.consumeProAiCredit).not.toHaveBeenCalled();
    expect(mocks.answerSessionQuery).not.toHaveBeenCalled();
    expect((await request(app).get('/api/astrologer/pro/profiles').set('x-astro', 'unverified')).status).toBe(403);
  });

  it('a failed generation returns the credit it took', async () => {
    mocks.answerSessionQuery.mockRejectedValueOnce(new Error('upstream 500'));
    await ask('astroA'); // the stream has started, so the status is already 200
    expect(mocks.storage.consumeProAiCredit).toHaveBeenCalledTimes(1);
    expect(mocks.storage.refundProAiCredit).toHaveBeenCalledWith('astroA');
  });

  it("an astrologer over today's AI budget is refused before any credit or model call", async () => {
    mocks.storage.getAiUsageToday.mockResolvedValue({ calls: 10_000, costMicroUsd: 0 });
    const res = await ask('astroA');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ai_daily_limit');
    expect(mocks.storage.consumeProAiCredit).not.toHaveBeenCalled();
    expect(mocks.answerSessionQuery).not.toHaveBeenCalled();
  });

  it('an over-long session question is refused before any credit is taken', async () => {
    const res = await request(app).post('/api/astrologer/pro/session-queries').set('x-astro', 'astroA').send({ profileId: 'pA', tradition: 'parashar', question: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(mocks.storage.consumeProAiCredit).not.toHaveBeenCalled();
  });
});
