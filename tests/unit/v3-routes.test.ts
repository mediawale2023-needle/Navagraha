import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { getKundli } from '../../server/astroEngine';

const mocks = vi.hoisted(() => ({
  storage: {
    getKundliById: vi.fn(), getUser: vi.fn(), getUserKundlis: vi.fn(), createKundli: vi.fn(), persistLegacyUpgrade: vi.fn(),
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
let db: Record<string, any>;
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
  db = { v3, legacy, nocoords: { ...legacy, id: 'nocoords', latitude: null, longitude: null } };
  mocks.storage.getKundliById.mockImplementation(async (id: string) => db[id]);
  mocks.storage.persistLegacyUpgrade.mockImplementation(async (id: string, expected: any, data: any) =>
    JSON.stringify(db[id]?.chartData) === JSON.stringify(expected) ? (db[id] = { ...db[id], ...data }) : undefined);
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
  it('serves a recalculated V3 view by default and never writes the stored row', async () => {
    const res = await request(app).get('/api/kundli/legacy').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.chartStatus.version).toBe('v3-recalculated-from-legacy');
    expect(res.body.chartData.canonical.birth.timezone).toBe('America/New_York');
    expect(res.body.chartData.legacySnapshot).toEqual({ planetaryPositions: [], houses: [] });
    expect(mocks.storage.persistLegacyUpgrade).not.toHaveBeenCalled();
    expect(db.legacy.chartData).toEqual({ planetaryPositions: [], houses: [] });
  });
  it('with persistence enabled, writes once by compare-and-swap against the original chartData', async () => {
    vi.stubEnv('V3_PERSIST_LEGACY_UPGRADES', 'true');
    const res = await request(app).get('/api/kundli/legacy').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(mocks.storage.persistLegacyUpgrade).toHaveBeenCalledTimes(1);
    const [id, expected, data] = mocks.storage.persistLegacyUpgrade.mock.calls[0];
    expect(id).toBe('legacy');
    expect(expected).toEqual({ planetaryPositions: [], houses: [] });
    expect(data.chartData.legacySnapshot).toEqual(expected);
    expect(data.chartData.legacyColumns).toMatchObject({ zodiacSign: legacy.zodiacSign, moonSign: legacy.moonSign });
    // Already upgraded: a second access neither recalculates nor writes.
    await request(app).get('/api/kundli/legacy').set('x-user', 'owner');
    expect(mocks.storage.persistLegacyUpgrade).toHaveBeenCalledTimes(1);
  });
  it('a lost swap (row changed concurrently) serves the recalculated view and overwrites nothing', async () => {
    vi.stubEnv('V3_PERSIST_LEGACY_UPGRADES', 'true');
    mocks.storage.persistLegacyUpgrade.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/kundli/legacy').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.chartStatus.version).toBe('v3-recalculated-from-legacy');
    expect(db.legacy.chartData).toEqual({ planetaryPositions: [], houses: [] });
  });
  it('parallel requests share one recalculation and at most one write', async () => {
    vi.stubEnv('V3_PERSIST_LEGACY_UPGRADES', 'true');
    // A slow write keeps the first upgrade in flight while the other requests arrive.
    mocks.storage.persistLegacyUpgrade.mockImplementation((_id: string, _e: any, data: any) => new Promise((r) => setTimeout(() => r({ ...legacy, ...data }), 50)));
    const [a, b, c] = await Promise.all([
      request(app).get('/api/kundli/legacy').set('x-user', 'owner'),
      request(app).get('/api/kundli/legacy/insights').set('x-user', 'owner'),
      request(app).get('/api/kundli/legacy/transits').set('x-user', 'owner'),
    ]);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(mocks.storage.persistLegacyUpgrade).toHaveBeenCalledTimes(1);
  });
  it('a failed write still serves the recalculated view', async () => {
    vi.stubEnv('V3_PERSIST_LEGACY_UPGRADES', 'true');
    mocks.storage.persistLegacyUpgrade.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/api/kundli/legacy').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.chartStatus.version).toBe('v3-recalculated-from-legacy');
  });
  it('a chart without coordinates is limited, not guessed, and is never written', async () => {
    vi.stubEnv('V3_PERSIST_LEGACY_UPGRADES', 'true');
    const res = await request(app).get('/api/kundli/nocoords').set('x-user', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.chartStatus.version).toBe('limited');
    expect(mocks.storage.persistLegacyUpgrade).not.toHaveBeenCalled();
  });
  it('a different user cannot trigger the upgrade', async () => {
    vi.stubEnv('V3_PERSIST_LEGACY_UPGRADES', 'true');
    expect((await request(app).get('/api/kundli/legacy').set('x-user', 'other')).status).toBe(404);
    expect(mocks.storage.persistLegacyUpgrade).not.toHaveBeenCalled();
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
  it('keeps the entered calendar date even when sent as an offset timestamp', async () => {
    const res = await request(app).post('/api/kundli').send({ ...birth, dateOfBirth: '1990-07-04T00:00:00+05:30' });
    expect(res.status).toBe(200);
    expect(res.body.chartData.canonical.birth.localDate).toBe('1990-07-04');
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
