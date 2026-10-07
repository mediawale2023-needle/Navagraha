import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { getKundli } from '../../server/astroEngine';

const mocks = vi.hoisted(() => ({
  storage: {
    getKundliById: vi.fn(), getUser: vi.fn(), getUserKundlis: vi.fn(), createKundli: vi.fn(), updateKundliChart: vi.fn(),
    saveAiChatMessage: vi.fn(), getUserMemories: vi.fn(), addUserMemory: vi.fn(), getPredictionFeedbacksByUser: vi.fn(), getPatternStatistics: vi.fn(),
  },
  runCouncil: vi.fn(), explainWithEvidence: vi.fn(), extractMemories: vi.fn(),
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/agents/orchestrator', async (orig) => ({ ...await orig<typeof import('../../server/agents/orchestrator')>(), runCouncil: mocks.runCouncil }));
vi.mock('../../server/aiAstrologerService', () => ({
  interpretKundli: vi.fn(), generateReport: vi.fn(), generateLifeReport: vi.fn(), extractMemories: mocks.extractMemories,
  generatePreConsultBrief: vi.fn(), generatePostConsultFollowUp: vi.fn(), matchAstrologerToChart: vi.fn(), generateDailyHoroscope: vi.fn(),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
import { registerRoutes } from '../../server/routes';

let app: Express;
let v3: any;
let legacy: any;
beforeAll(async () => {
  const nk = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946, { place: 'Bengaluru' });
  v3 = { ...nk, id: 'v3', userId: 'owner', name: 'Owner', dateOfBirth: new Date('1990-08-15T00:00:00Z'), timeOfBirth: '06:30', placeOfBirth: 'Bengaluru', latitude: '12.9716000', longitude: '77.5946000' };
  legacy = { ...v3, id: 'legacy', chartData: { planetaryPositions: [], houses: [] }, placeOfBirth: 'New York', latitude: '40.7128000', longitude: '-74.0060000', dateOfBirth: new Date('1990-07-04T00:00:00Z'), timeOfBirth: '12:00' };
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => Boolean(req.headers['x-user'])) as typeof req.isAuthenticated;
    if (req.headers['x-user']) req.user = { id: String(req.headers['x-user']) };
    req.session = {} as typeof req.session;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
  const db: Record<string, any> = { v3, legacy, nocoords: { ...legacy, id: 'nocoords', latitude: null, longitude: null } };
  mocks.storage.getKundliById.mockImplementation(async (id: string) => db[id]);
  mocks.storage.updateKundliChart.mockImplementation(async (id: string, data: any) => ({ ...db[id], ...data }));
  mocks.storage.createKundli.mockImplementation(async (d: any) => ({ ...d, id: 'created' }));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('GET /api/kundli/:id/insights', () => {
  it('returns evidence-backed domains and a timeline to the owner', async () => {
    const res = await request(app).get('/api/kundli/v3/insights').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.domains).toHaveLength(9);
    expect(res.body.domains[0]).toEqual(expect.objectContaining({ verdict: expect.any(String), confidence: expect.any(String), conclusion: expect.any(String) }));
    expect(res.body.timeline.length).toBeGreaterThan(0);
    expect(res.body.headline.calculation).toMatch(/Swiss Ephemeris · Lahiri/);
    expect(res.body.chartStatus.version).toBe('v3');
  });
  it('denies other users and unauthenticated callers without leaking the chart', async () => {
    const other = await request(app).get('/api/kundli/v3/insights').set('x-user', 'other');
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ message: 'Kundli not found' });
    expect((await request(app).get('/api/kundli/v3/insights')).status).toBe(401);
    expect((await request(app).get('/api/kundli/missing/insights').set('x-user', 'owner')).status).toBe(404);
  });
  it('reports a chart that cannot be recalculated instead of guessing', async () => {
    const res = await request(app).get('/api/kundli/nocoords/insights').set('x-user', 'owner');
    expect(res.status).toBe(409);
    expect(res.body.chartStatus.version).toBe('limited');
  });
});

describe('legacy chart upgrade through the owner route', () => {
  it('recalculates on owner access, persists reversibly and reports the change', async () => {
    const res = await request(app).get('/api/kundli/legacy').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(mocks.storage.updateKundliChart).toHaveBeenCalledTimes(1);
    const persisted = mocks.storage.updateKundliChart.mock.calls[0][1];
    expect(persisted.chartData.legacySnapshot).toEqual({ planetaryPositions: [], houses: [] });
    expect(persisted.chartData.canonical.birth.timezone).toBe('America/New_York');
    expect(res.body.chartStatus.version).toBe('v3-recalculated-from-legacy');
  });
  it('a different user cannot trigger the upgrade', async () => {
    expect((await request(app).get('/api/kundli/legacy').set('x-user', 'other')).status).toBe(404);
    expect(mocks.storage.updateKundliChart).not.toHaveBeenCalled();
  });
});

describe('POST /api/kundli/insights (guest preview)', () => {
  it('computes insights for a valid canonical chart without storage or auth', async () => {
    const res = await request(app).post('/api/kundli/insights').send({ canonical: v3.chartData.canonical });
    expect(res.status).toBe(200);
    expect(res.body.domains).toHaveLength(9);
    expect(mocks.storage.getKundliById).not.toHaveBeenCalled();
    expect(mocks.storage.createKundli).not.toHaveBeenCalled();
  });
  it.each([
    ['missing', () => ({})],
    ['empty', () => ({ canonical: {} })],
    ['no planets', () => ({ canonical: { ...v3.chartData.canonical, planets: [] } })],
    ['tampered longitude', () => ({ canonical: { ...v3.chartData.canonical, planets: v3.chartData.canonical.planets.map((p: any, i: number) => i ? p : { ...p, longitude: 400 }) } })],
  ])('rejects a %s canonical chart', async (_l, body) => {
    expect((await request(app).post('/api/kundli/insights').send(body())).status).toBe(400);
  });
});

describe('POST /api/kundli uses the birthplace time zone', () => {
  const birth = { name: 'Guest', gender: 'female', dateOfBirth: '1990-07-04', timeOfBirth: '12:00', placeOfBirth: 'New York', latitude: 40.7128, longitude: -74.006 };
  it('reads a New York birth time as EDT, not IST', async () => {
    const res = await request(app).post('/api/kundli').send(birth);
    expect(res.status).toBe(200);
    expect(res.body.chartData.canonical.birth).toMatchObject({ timezone: 'America/New_York', utcOffset: '-04:00', birthUTC: '1990-07-04T16:00:00.000Z' });
  });
  it('rejects a time that did not exist (DST gap) before saving', async () => {
    const res = await request(app).post('/api/kundli').set('x-user', 'owner').send({ ...birth, dateOfBirth: '2021-03-14', timeOfBirth: '02:30' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/did not exist/);
    expect(mocks.storage.createKundli).not.toHaveBeenCalled();
  });
  it('rejects an unknown explicit time zone', async () => {
    const res = await request(app).post('/api/kundli').send({ ...birth, timezone: 'Mars/Olympus' });
    expect(res.status).toBe(400);
  });
  it('accepts an explicit offset to disambiguate a repeated hour', async () => {
    const res = await request(app).post('/api/kundli').send({ ...birth, dateOfBirth: '2021-11-07', timeOfBirth: '01:30', utcOffset: '-05:00' });
    expect(res.status).toBe(200);
    expect(res.body.chartData.canonical.birth.birthUTC).toBe('2021-11-07T06:30:00.000Z');
  });
});
