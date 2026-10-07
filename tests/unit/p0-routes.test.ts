import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { getKundli } from '../../server/astroEngine';
import { isCurrentCanonicalChart } from '../../shared/v3/canonical';

const mocks = vi.hoisted(() => ({
  storage: {
    getKundliById: vi.fn(), getUser: vi.fn(), getUserKundlis: vi.fn(), createKundli: vi.fn(),
    getReportTypeById: vi.fn(), debitWallet: vi.fn(), createReportOrder: vi.fn(),
    setReportOrderContent: vi.fn(), createNotification: vi.fn(),
    saveAiChatMessage: vi.fn(), getUserMemories: vi.fn(), getPredictionFeedbacksByUser: vi.fn(), getPatternStatistics: vi.fn(),
  },
  runCouncil: vi.fn(), interpretKundli: vi.fn(), generateReport: vi.fn(), extractMemories: vi.fn(),
  callSynastryEngine: vi.fn(),
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {} }));
vi.mock('../../server/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/auth')>(), setupAuth: vi.fn(),
}));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/agents/orchestrator', () => ({ runCouncil: mocks.runCouncil }));
vi.mock('../../server/aiAstrologerService', () => ({
  interpretKundli: mocks.interpretKundli, generateReport: mocks.generateReport,
  generateLifeReport: vi.fn(), extractMemories: mocks.extractMemories,
  generatePreConsultBrief: vi.fn(), generatePostConsultFollowUp: vi.fn(),
  matchAstrologerToChart: vi.fn(), generateDailyHoroscope: vi.fn(),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
vi.mock('../../server/astroEngineClient', () => ({
  callSynastryEngine: mocks.callSynastryEngine, callRemediationEngine: vi.fn(),
}));
import { registerRoutes } from '../../server/routes';

let app: Express;
let saved: Awaited<ReturnType<typeof getKundli>> & { id: string; userId: string; dateOfBirth: string; timeOfBirth: string; placeOfBirth: string; name: string };
beforeAll(async () => {
  saved = { ...await getKundli('1990-08-15', '06:30', 12.9716, 77.5946), id: 'chart', userId: 'owner',
    dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru', name: 'Owner' };
  app = express(); app.use(express.json());
  // Inject identities at the session boundary; retain the real auth guard.
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => Boolean(req.headers['x-user'])) as typeof req.isAuthenticated;
    if (req.headers['x-user']) req.user = { id: String(req.headers['x-user']) };
    req.session = { userId: req.headers['x-session-user'] } as typeof req.session;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
  mocks.storage.getKundliById.mockImplementation(async id => id === 'chart' ? saved : undefined);
  mocks.storage.getUser.mockImplementation(async id => ({ id }));
  mocks.storage.getUserKundlis.mockResolvedValue([saved]);
  mocks.storage.getReportTypeById.mockResolvedValue({ id: 'type', name: 'Career', category: 'career', isActive: true, price: '100' });
  mocks.storage.createKundli.mockImplementation(async data => ({ ...data, id: 'created' }));
  mocks.storage.getUserMemories.mockResolvedValue([]);
  mocks.storage.getPredictionFeedbacksByUser.mockResolvedValue([]);
  mocks.storage.getPatternStatistics.mockResolvedValue(null);
  mocks.storage.debitWallet.mockResolvedValue(true);
  mocks.storage.createReportOrder.mockResolvedValue({ id: 'order' });
  mocks.storage.setReportOrderContent.mockResolvedValue(undefined);
  mocks.storage.createNotification.mockResolvedValue({});
  mocks.runCouncil.mockResolvedValue('Reading');
  mocks.interpretKundli.mockResolvedValue({ content: 'Interpretation' });
  mocks.generateReport.mockResolvedValue('Report');
  mocks.extractMemories.mockResolvedValue([]);
  mocks.callSynastryEngine.mockResolvedValue({ total_score: 20 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const protectedRoutes = [
  { method: 'get', path: '/api/kundli/chart', body: {} },
  { method: 'get', path: '/api/kundli/chart/transits', body: {} },
  { method: 'post', path: '/api/ai/interpret-kundli', body: { kundliId: 'chart' } },
  { method: 'post', path: '/api/ai/chat', body: { kundliId: 'chart', message: 'Career' } },
  { method: 'post', path: '/api/reports/order', body: { kundliId: 'chart', reportTypeId: 'type' } },
] as const;
for (const route of protectedRoutes) describe(`${route.method} ${route.path} ownership`, () => {
  it('permits the owner', async () => {
    const res = await request(app)[route.method](route.path).set('x-user', 'owner').send(route.body);
    expect(res.status).toBe(route.path === '/api/reports/order' ? 201 : 200);
  });
  it('rejects another user before AI or billing', async () => {
    const res = await request(app)[route.method](route.path).set('x-user', 'other').send(route.body);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Kundli not found' });
    expect(mocks.runCouncil).not.toHaveBeenCalled();
    expect(mocks.interpretKundli).not.toHaveBeenCalled();
    expect(mocks.storage.debitWallet).not.toHaveBeenCalled();
    expect(mocks.storage.saveAiChatMessage).not.toHaveBeenCalled();
    expect(mocks.storage.getUserKundlis).not.toHaveBeenCalled();
  });
  it('requires authentication before reading storage', async () => {
    const res = await request(app)[route.method](route.path).send(route.body);
    expect(res.status).toBe(401);
    expect(mocks.storage.getKundliById).not.toHaveBeenCalled();
  });
});

describe('P0 route regressions', () => {
  it('preserves email/password session access', async () => {
    expect((await request(app).get('/api/kundli/chart').set('x-session-user', 'owner')).status).toBe(200);
    expect((await request(app).get('/api/kundli/chart').set('x-session-user', 'other')).status).toBe(404);
  });
  it('returns 404 for a missing explicit chart, without falling back to another chart', async () => {
    const res = await request(app).post('/api/ai/chat').set('x-user', 'owner').send({ message: 'Career', kundliId: 'missing' });
    expect(res.status).toBe(404);
    expect(mocks.runCouncil).not.toHaveBeenCalled();
    expect(mocks.storage.getUserKundlis).not.toHaveBeenCalled();
  });
  it('passes the actual chart and a planetary array to the council (deep questions)', async () => {
    vi.stubEnv('FEATURE_AI_COUNCIL', 'true'); // the council is gated off by default; this exercises the gated path
    await request(app).post('/api/ai/chat').set('x-user', 'owner').send({ message: 'Career', kundliId: 'chart', depth: 'deep' });
    expect(mocks.runCouncil).toHaveBeenCalledWith(expect.objectContaining({
      chartData: expect.objectContaining({ planets: saved.chartData.planetaryPositions }),
      evidencePacket: expect.stringContaining(`Lagna: ${saved.chartData.canonical.ascendant.sign}`),
    }));
  });
  const birth = { name: 'Guest', gender: 'male', dateOfBirth: '1990-08-15', timeOfBirth: '06:00', placeOfBirth: 'Bengaluru', latitude: 12.9716, longitude: 77.5946, isBirthTimeApproximate: true };
  it('preserves guest computation without saving and retains the approximate-time flag', async () => {
    const res = await request(app).post('/api/kundli').send(birth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: null, saved: false, chartData: { isBirthTimeApproximate: true } });
    expect(isCurrentCanonicalChart(res.body.chartData.canonical)).toBe(true);
    expect(res.body.chartData.canonical.birth.timeAccuracy).toBe('approximate');
    expect(mocks.storage.createKundli).not.toHaveBeenCalled();
    expect((await request(app).get('/api/kundli')).body).toEqual([]);
  });
  it('persists resolved coordinates and approximate time in existing JSON for saved charts', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ geometry: { location: { lat: 12.97, lng: 77.59 } } }] }) }));
    const res = await request(app).post('/api/kundli').set('x-user', 'owner').send({ ...birth, latitude: undefined, longitude: undefined });
    expect(res.status).toBe(200);
    expect(mocks.storage.createKundli).toHaveBeenCalledWith(expect.objectContaining({
      latitude: '12.97', longitude: '77.59', chartData: expect.objectContaining({ isBirthTimeApproximate: true }),
    }));
  });
  it('retains the approximate-time flag and exact inputs through save and owner reload', async () => {
    const created = await request(app).post('/api/kundli').set('x-user', 'owner').send(birth);
    expect(created.status).toBe(200);
    const persisted = JSON.parse(JSON.stringify(mocks.storage.createKundli.mock.calls[0][0]));
    mocks.storage.getKundliById.mockResolvedValue({ ...persisted, id: 'created' });
    const loaded = await request(app).get('/api/kundli/created').set('x-user', 'owner');
    expect(loaded.status).toBe(200);
    expect(loaded.body.chartData.isBirthTimeApproximate).toBe(true);
    expect(loaded.body.chartData.canonical).toEqual(created.body.chartData.canonical);
    expect(isCurrentCanonicalChart(loaded.body.chartData.canonical)).toBe(true);
  });
  it.each(['/api/kundli', '/api/ai/chat', '/api/reports/order'])('%s stops after failed birth-place resolution', async path => {
    const body = { ...birth, latitude: undefined, longitude: undefined };
    const payload = path === '/api/kundli' ? body : { message: 'Career', reportTypeId: 'type', birthDetails: body };
    const res = await request(app).post(path).set('x-user', 'owner').send(payload);
    expect(res.status).toBe(400);
    expect(mocks.storage.createKundli).not.toHaveBeenCalled();
    expect(mocks.runCouncil).not.toHaveBeenCalled();
    expect(mocks.storage.saveAiChatMessage).not.toHaveBeenCalled();
    expect(mocks.storage.debitWallet).not.toHaveBeenCalled();
  });
  const couple = { person1Date: '1990-08-15', person1Time: '06:30', person2Date: '1992-03-22', person2Time: '14:45' };
  it.each(['/api/matchmaking', '/api/synastry'])('%s rejects unavailable locations instead of Delhi/Mumbai', async path => {
    const res = await request(app).post(path).send(couple);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/coordinates.*birthplace/i);
    expect(mocks.callSynastryEngine).not.toHaveBeenCalled();
  });
  it.each(['/api/matchmaking', '/api/synastry'])('%s rejects missing birth time instead of assuming noon', async path => {
    const res = await request(app).post(path).send({ ...couple, person1Time: undefined, person1Lat: 0, person1Lon: 0, person2Lat: 0, person2Lon: 0 });
    expect(res.status).toBe(400);
    expect(mocks.callSynastryEngine).not.toHaveBeenCalled();
  });
  it.each(['/api/matchmaking', '/api/synastry'])('%s accepts actual zero coordinates', async path => {
    const res = await request(app).post(path).send({ ...couple, person1Lat: 0, person1Lon: 0, person2Lat: '0', person2Lon: '0' });
    expect(res.status).toBe(200);
  });
  it.each(['/api/matchmaking', '/api/synastry'])('%s resolves both supplied birthplaces', async path => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test');
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ geometry: { location: { lat: 12.97, lng: 77.59 } } }] }) });
    vi.stubGlobal('fetch', fetch);
    expect((await request(app).post(path).send({ ...couple, person1Place: 'Bengaluru', person2Place: 'Chennai' })).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain('address=Bengaluru');
    expect(fetch.mock.calls[1][0]).toContain('address=Chennai');
  });
  it('Prashna refuses missing coordinates and accepts genuine zero coordinates', async () => {
    expect((await request(app).post('/api/prashna').send({ question_category: 'career' })).status).toBe(400);
    const res = await request(app).post('/api/prashna').send({ question_category: 'career', latitude: 0, longitude: 0 });
    expect(res.status).toBe(200);
    expect(res.body.panchang.hora_lord).toMatch(/^(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn)$/);
  });
});
