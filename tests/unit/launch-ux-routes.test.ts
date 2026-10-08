import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { getKundli } from '../../server/astroEngine';

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

// Launch UX fixes: response contracts the client relies on for honest, readable UI.
describe('error responses name the field at fault', () => {
  it('POST /api/kundli without a resolvable place returns field placeOfBirth', async () => {
    const res = await request(app).post('/api/kundli').set('x-user', 'owner')
      .send({ name: 'A', gender: 'female', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Nowhere' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ field: 'placeOfBirth' });
    expect(res.body.message).toMatch(/pick your exact birth place/i);
  });

  it('POST /api/matchmaking names the person whose place could not be resolved', async () => {
    const base = { person1Date: '1990-08-15', person1Time: '06:30', person2Date: '1991-01-01', person2Time: '10:00' };
    const second = await request(app).post('/api/matchmaking')
      .send({ ...base, person1Lat: 12.9716, person1Lon: 77.5946, person2Place: 'Nowhere' });
    expect(second.status).toBe(400);
    expect(second.body.field).toBe('person2Place');
    const first = await request(app).post('/api/matchmaking')
      .send({ ...base, person1Place: 'Nowhere', person2Lat: 19.07, person2Lon: 72.87 });
    expect(first.body.field).toBe('person1Place');
  });

  it('report orders keep the 402 shape the client maps to the recharge panel', async () => {
    mocks.storage.debitWallet.mockResolvedValue(null);
    const res = await request(app).post('/api/reports/order').set('x-user', 'owner').send({ kundliId: 'chart', reportTypeId: 'type' });
    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/insufficient wallet balance/i);
  });
});
