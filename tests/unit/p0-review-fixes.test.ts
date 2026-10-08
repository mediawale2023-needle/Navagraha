import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { getKundli } from '../../server/astroEngine';
import { explicitBirthDetailsSchema } from '../../server/birthDetails';

const mocks = vi.hoisted(() => ({
  storage: {
    getKundliById: vi.fn(), getUser: vi.fn(), getUserKundlis: vi.fn(), createKundli: vi.fn(),
    getReportTypeById: vi.fn(), debitWallet: vi.fn(), createReportOrder: vi.fn(),
    setReportOrderContent: vi.fn(), createNotification: vi.fn(), markReportOrderFailed: vi.fn(),
    saveAiChatMessage: vi.fn(), getUserMemories: vi.fn(), addUserMemory: vi.fn(),
    getPredictionFeedbacksByUser: vi.fn(), getPatternStatistics: vi.fn(), createPredictionFeedback: vi.fn(),
  },
  runCouncil: vi.fn(), generateReport: vi.fn(), generateLifeReport: vi.fn(), extractMemories: vi.fn(),
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {} }));
vi.mock('../../server/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/auth')>(), setupAuth: vi.fn(),
}));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/agents/orchestrator', () => ({ runCouncil: mocks.runCouncil }));
vi.mock('../../server/aiAstrologerService', () => ({
  interpretKundli: vi.fn(), generateReport: mocks.generateReport,
  generateLifeReport: mocks.generateLifeReport, extractMemories: mocks.extractMemories,
  generatePreConsultBrief: vi.fn(), generatePostConsultFollowUp: vi.fn(),
  matchAstrologerToChart: vi.fn(), generateDailyHoroscope: vi.fn(),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
vi.mock('../../server/astroEngineClient', () => ({
  callSynastryEngine: vi.fn(), callPrashnaEngine: vi.fn(), callRemediationEngine: vi.fn(),
}));
import { registerRoutes } from '../../server/routes';

let app: Express;
let saved: Record<string, any>;
beforeAll(async () => {
  saved = { ...await getKundli('1990-08-15', '06:30', 12.9716, 77.5946), id: 'chart', userId: 'owner',
    dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru', name: 'Owner' };
  app = express(); app.use(express.json());
  // Inject identities at the session boundary; the real isAuthenticated guard still runs.
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => Boolean(req.headers['x-user'])) as typeof req.isAuthenticated;
    if (req.headers['x-user']) req.user = { id: String(req.headers['x-user']) };
    req.session = { userId: req.headers['x-session-user'] } as typeof req.session;
    next();
  });
  await registerRoutes(app);
});
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test');
  fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ geometry: { location: { lat: 12.97, lng: 77.59 } } }] }) });
  vi.stubGlobal('fetch', fetchSpy);
  mocks.storage.getKundliById.mockImplementation(async id => id === 'chart' ? saved : undefined);
  mocks.storage.getUser.mockImplementation(async id => ({ id }));
  // The user HAS a saved chart, so any silent fallback would be observable.
  mocks.storage.getUserKundlis.mockResolvedValue([saved]);
  mocks.storage.getReportTypeById.mockResolvedValue({ id: 'type', name: 'Career', category: 'career', isActive: true, price: '100' });
  mocks.storage.debitWallet.mockResolvedValue({ balance: '0' });
  mocks.storage.createReportOrder.mockResolvedValue({ id: 'order' });
  mocks.storage.setReportOrderContent.mockResolvedValue(undefined);
  mocks.storage.createNotification.mockResolvedValue({});
  mocks.storage.getUserMemories.mockResolvedValue([]);
  mocks.storage.getPredictionFeedbacksByUser.mockResolvedValue([]);
  mocks.storage.getPatternStatistics.mockResolvedValue(null);
  mocks.storage.createPredictionFeedback.mockImplementation(async data => ({ id: 1, ...data }));
  mocks.runCouncil.mockResolvedValue('Reading');
  mocks.generateReport.mockResolvedValue('Report');
  mocks.extractMemories.mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('POST /api/feedback authorization', () => {
  const feedback = { predictionCategory: 'career', wasAccurate: true, dashaSystemUsed: 'Vimshottari' };
  const post = (body: unknown, user?: string) => {
    const r = request(app).post('/api/feedback');
    return (user ? r.set('x-user', user) : r).send(body as object);
  };

  it('lets the owner submit feedback for their chart', async () => {
    const res = await post({ ...feedback, kundliId: 'chart', notes: 'Verified period' }, 'owner');
    expect(res.status).toBe(201);
    expect(mocks.storage.createPredictionFeedback).toHaveBeenCalledWith({ ...feedback, kundliId: 'chart', userId: 'owner' });
  });
  it('accepts email/password session users', async () => {
    const res = await request(app).post('/api/feedback').set('x-session-user', 'owner').send({ ...feedback, kundliId: 'chart' });
    expect(res.status).toBe(201);
    expect(mocks.storage.createPredictionFeedback).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner' }));
  });
  it('rejects feedback referencing another user\'s chart without leaking it', async () => {
    const res = await post({ ...feedback, kundliId: 'chart' }, 'other');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Kundli not found' });
    expect(mocks.storage.createPredictionFeedback).not.toHaveBeenCalled();
  });
  it('rejects a missing chart reference', async () => {
    const res = await post({ ...feedback, kundliId: 'missing' }, 'owner');
    expect(res.status).toBe(404);
    expect(mocks.storage.createPredictionFeedback).not.toHaveBeenCalled();
  });
  it('denies unauthenticated requests before reading storage', async () => {
    const res = await post({ ...feedback, kundliId: 'chart' });
    expect(res.status).toBe(401);
    expect(mocks.storage.getKundliById).not.toHaveBeenCalled();
    expect(mocks.storage.createPredictionFeedback).not.toHaveBeenCalled();
  });
  it('ignores a body userId and stores the authenticated identity', async () => {
    const res = await post({ ...feedback, kundliId: 'chart', userId: 'other', id: 99, processedAt: '2020-01-01' }, 'owner');
    expect(res.status).toBe(201);
    const stored = mocks.storage.createPredictionFeedback.mock.calls[0][0];
    expect(stored.userId).toBe('owner');
    expect(stored).not.toHaveProperty('id');
    expect(stored).not.toHaveProperty('processedAt');
  });
  it('cannot spoof another identity even without a chart reference', async () => {
    const res = await post({ ...feedback, userId: 'other' }, 'owner');
    expect(res.status).toBe(201);
    expect(mocks.storage.createPredictionFeedback).toHaveBeenCalledWith({ ...feedback, userId: 'owner' });
    expect(mocks.storage.getKundliById).not.toHaveBeenCalled();
  });
  it('parses optional event dates', async () => {
    const res = await post({ ...feedback, actualOccurrenceDate: '2024-03-01' }, 'owner');
    expect(res.status).toBe(201);
    expect(mocks.storage.createPredictionFeedback.mock.calls[0][0].actualOccurrenceDate).toEqual(new Date('2024-03-01'));
  });
  it.each([
    ['numeric kundliId', { ...feedback, kundliId: 123 }],
    ['empty kundliId', { ...feedback, kundliId: '' }],
    ['null kundliId', { ...feedback, kundliId: null }],
    ['object kundliId', { ...feedback, kundliId: { $ne: null } }],
    ['missing wasAccurate', { predictionCategory: 'career', dashaSystemUsed: 'Vimshottari' }],
    ['string wasAccurate', { ...feedback, wasAccurate: 'yes' }],
    ['invalid date', { ...feedback, actualOccurrenceDate: 'not-a-date' }],
  ])('rejects malformed input (%s) with 400 before any write', async (_label, body) => {
    const res = await post(body, 'owner');
    expect(res.status).toBe(400);
    expect(mocks.storage.getKundliById).not.toHaveBeenCalled();
    expect(mocks.storage.createPredictionFeedback).not.toHaveBeenCalled();
  });
});

describe('explicit birth details schema', () => {
  const ok = { dateOfBirth: '1992-05-13', timeOfBirth: '06:30' };
  it.each(['06:30', '00:00', '23:59', '06:30:45', '23:59:59'])('accepts time %s', t => {
    expect(explicitBirthDetailsSchema.safeParse({ ...ok, timeOfBirth: t }).success).toBe(true);
  });
  it.each(['', '6:30', '24:00', '12:60', '12:30:60', '12:30pm', '12', 'noon'])('rejects time %j', t => {
    expect(explicitBirthDetailsSchema.safeParse({ ...ok, timeOfBirth: t }).success).toBe(false);
  });
  it.each(['', '1992-02-30', '1992-13-01', '13/05/1992', 'not-a-date', '1992-5-13'])('rejects date %j', d => {
    expect(explicitBirthDetailsSchema.safeParse({ ...ok, dateOfBirth: d }).success).toBe(false);
  });
  it('accepts a leap day', () => {
    expect(explicitBirthDetailsSchema.safeParse({ ...ok, dateOfBirth: '1992-02-29' }).success).toBe(true);
  });
});

const coords = { latitude: 12.9716, longitude: 77.5946, placeOfBirth: 'Bengaluru' };
const invalidBirthDetails: Array<[string, unknown]> = [
  ['reviewed bug: empty time with a place', { dateOfBirth: '1992-05-13', timeOfBirth: '', placeOfBirth: 'Unknown' }],
  ['empty time', { dateOfBirth: '1992-05-13', timeOfBirth: '', ...coords }],
  ['missing time', { dateOfBirth: '1992-05-13', ...coords }],
  ['missing date', { timeOfBirth: '06:30', ...coords }],
  ['empty date', { dateOfBirth: '', timeOfBirth: '06:30', ...coords }],
  ['empty object', {}],
  ['explicit null', null],
  ['string instead of object', '1992-05-13 06:30'],
  ['array instead of object', ['1992-05-13', '06:30']],
  ['numeric date and time', { dateOfBirth: 19920513, timeOfBirth: 630, ...coords }],
  ['invalid calendar date', { dateOfBirth: '1992-02-30', timeOfBirth: '06:30', ...coords }],
  ['unparseable date', { dateOfBirth: 'yesterday', timeOfBirth: '06:30', ...coords }],
  ['out-of-range time', { dateOfBirth: '1992-05-13', timeOfBirth: '24:00', ...coords }],
  ['malformed time', { dateOfBirth: '1992-05-13', timeOfBirth: '6:3', ...coords }],
  ['out-of-range seconds', { dateOfBirth: '1992-05-13', timeOfBirth: '06:30:61', ...coords }],
  ['non-boolean approximate flag', { dateOfBirth: '1992-05-13', timeOfBirth: '06:30', isBirthTimeApproximate: 'yes', ...coords }],
];

const routes = [
  { path: '/api/reports/order', base: { reportTypeId: 'type' }, success: 201 },
  { path: '/api/ai/chat', base: { message: 'Career' }, success: 200 },
] as const;

function expectNoSideEffects() {
  expect(mocks.storage.getUserKundlis).not.toHaveBeenCalled();
  expect(mocks.storage.getKundliById).not.toHaveBeenCalled();
  expect(mocks.storage.debitWallet).not.toHaveBeenCalled();
  expect(mocks.storage.createReportOrder).not.toHaveBeenCalled();
  expect(mocks.generateReport).not.toHaveBeenCalled();
  expect(mocks.generateLifeReport).not.toHaveBeenCalled();
  expect(mocks.storage.saveAiChatMessage).not.toHaveBeenCalled();
  expect(mocks.storage.getUserMemories).not.toHaveBeenCalled();
  expect(mocks.runCouncil).not.toHaveBeenCalled();
  expect(mocks.extractMemories).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

for (const route of routes) describe(`${route.path} explicit chart selection`, () => {
  const post = (body: object) => request(app).post(route.path).set('x-user', 'owner').send({ ...route.base, ...body });

  it.each(invalidBirthDetails)('rejects %s with 400 and no fallback, billing, writes or AI', async (_label, birthDetails) => {
    const res = await post({ birthDetails });
    expect(res.status).toBe(400);
    expect(typeof res.body.message).toBe('string');
    expectNoSideEffects();
  });

  it.each([['empty', ''], ['null', null], ['numeric', 42], ['object', { $ne: null }]])(
    'rejects a %s kundliId without falling back to the latest chart', async (_label, kundliId) => {
      const res = await post({ kundliId });
      expect(res.status).toBe(400);
      expectNoSideEffects();
    });

  it('rejects an ambiguous kundliId + birthDetails combination', async () => {
    const res = await post({ kundliId: 'chart', birthDetails: { dateOfBirth: '1992-05-13', timeOfBirth: '06:30', ...coords } });
    expect(res.status).toBe(400);
    expectNoSideEffects();
  });

  it.each([['foreign', 'other', 'chart'], ['missing', 'owner', 'missing']])('denies a %s explicit kundliId', async (_label, user, kundliId) => {
    const res = await request(app).post(route.path).set('x-user', user).send({ ...route.base, kundliId });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Kundli not found' });
    expect(mocks.storage.getUserKundlis).not.toHaveBeenCalled();
    expect(mocks.storage.debitWallet).not.toHaveBeenCalled();
    expect(mocks.runCouncil).not.toHaveBeenCalled();
    expect(mocks.storage.saveAiChatMessage).not.toHaveBeenCalled();
  });

  it('still rejects an unresolvable explicit place without side effects', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    const res = await post({ birthDetails: { dateOfBirth: '1992-05-13', timeOfBirth: '06:30', placeOfBirth: 'Nowhere' } });
    expect(res.status).toBe(400);
    expect(mocks.storage.getUserKundlis).not.toHaveBeenCalled();
    expect(mocks.storage.debitWallet).not.toHaveBeenCalled();
    expect(mocks.runCouncil).not.toHaveBeenCalled();
  });

  it('preserves the saved-chart fallback when birthDetails is omitted', async () => {
    const res = await post({});
    expect(res.status).toBe(route.success);
    expect(mocks.storage.getUserKundlis).toHaveBeenCalledWith('owner');
  });

  it.each(['06:30', '06:30:45'])('accepts valid explicit birth details with time %s', async time => {
    const res = await post({ birthDetails: { name: 'Guest', gender: 'female', dateOfBirth: '1992-05-13', timeOfBirth: time, ...coords, isBirthTimeApproximate: true } });
    expect(res.status).toBe(route.success);
    expect(mocks.storage.getUserKundlis).not.toHaveBeenCalled();
    expect(mocks.storage.getKundliById).not.toHaveBeenCalled();
  });

  it('resolves the supplied place when explicit coordinates are absent', async () => {
    const res = await post({ birthDetails: { dateOfBirth: '1992-05-13', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' } });
    expect(res.status).toBe(route.success);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('address=Bengaluru');
  });
});

describe('chart actually used after selection', () => {
  it('report fallback bills for and generates from the saved chart only when birthDetails is omitted', async () => {
    const res = await request(app).post('/api/reports/order').set('x-user', 'owner').send({ reportTypeId: 'type' });
    expect(res.status).toBe(201);
    expect(mocks.storage.createReportOrder).toHaveBeenCalledWith(expect.objectContaining({ kundliId: 'chart' }));
    await vi.waitFor(() => expect(mocks.generateReport).toHaveBeenCalledWith('career', saved));
  });

  it('report from explicit details computes an unsaved chart with seconds and the approximate flag', async () => {
    const res = await request(app).post('/api/reports/order').set('x-user', 'owner').send({
      reportTypeId: 'type',
      birthDetails: { name: 'Guest', dateOfBirth: '1992-05-13', timeOfBirth: '06:30:45', ...coords, isBirthTimeApproximate: true },
    });
    expect(res.status).toBe(201);
    expect(mocks.storage.createReportOrder).toHaveBeenCalledWith(expect.objectContaining({ kundliId: undefined, subjectName: 'Guest' }));
    await vi.waitFor(() => expect(mocks.generateReport).toHaveBeenCalled());
    const chart = mocks.generateReport.mock.calls[0][1];
    expect(chart.timeOfBirth).toBe('06:30:45');
    expect(chart.chartData.isBirthTimeApproximate).toBe(true);
    expect(chart.chartData.canonical.birth.latitude).toBe(coords.latitude);
    expect(chart.chartData.canonical.birth.localTime).toBe('06:30:45');
  });

  it('chat with explicit details passes that chart, not the saved one, to the council', async () => {
    vi.stubEnv('FEATURE_AI_COUNCIL', 'true'); // the council is gated off by default; this exercises the gated path
    const res = await request(app).post('/api/ai/chat').set('x-user', 'owner').send({
      message: 'Career', depth: 'deep', birthDetails: { dateOfBirth: '1992-05-13', timeOfBirth: '06:30', ...coords },
    });
    expect(res.status).toBe(200);
    expect(mocks.runCouncil).toHaveBeenCalledWith(expect.objectContaining({
      birthDetails: { date: '1992-05-13', time: '06:30', place: 'Bengaluru' },
      evidencePacket: expect.stringContaining('Birth: 1992-05-13 06:30:00'),
    }));
  });

  it('chat fallback uses the saved chart when birthDetails is omitted', async () => {
    vi.stubEnv('FEATURE_AI_COUNCIL', 'true'); // the council is gated off by default; this exercises the gated path
    await request(app).post('/api/ai/chat').set('x-user', 'owner').send({ message: 'Career', depth: 'deep' });
    expect(mocks.runCouncil).toHaveBeenCalledWith(expect.objectContaining({
      birthDetails: { date: '1990-08-15', time: '06:30', place: 'Bengaluru' },
      evidencePacket: expect.stringContaining('Birth: 1990-08-15 06:30:00'),
    }));
  });
});
