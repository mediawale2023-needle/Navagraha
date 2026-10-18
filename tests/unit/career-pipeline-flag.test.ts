// Controlled testing of the facts-first Career Report: FEATURE_CAREER_FACTS_FIRST plus an admin account or an allow-listed,
// verified customer test account (CAREER_FACTS_FIRST_ALLOWLIST), decided by the order route from the signed-in account.
// Everyone else, and anything a request body says, gets the three-part report.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const CATALOGUE = [
  { id: 't-career', slug: 'career-report', category: 'career', price: '299.00', isActive: true },
  { id: 't-marriage', slug: 'marriage-report', category: 'marriage', price: '349.00', isActive: true },
  { id: 't-finance', slug: 'finance-report', category: 'finance', price: '399.00', isActive: true },
  { id: 't-year', slug: 'year-ahead-report', category: 'year_ahead', price: '499.00', isActive: true },
  { id: 't-life', slug: 'life-report', category: 'life', price: '699.00', isActive: true },
  { id: 't-complete', slug: 'complete-life-report', category: 'life_complete', price: '1499.00', isActive: true },
];
const USERS: Record<string, { id: string; email: string; emailVerifiedAt?: Date | null }> = {
  admin: { id: 'admin', email: 'tester@example.com' },
  customer: { id: 'customer', email: 'customer@example.com' },
  // A case variant of the admin address is a different, possibly attacker-registered account (adminAccess.ts).
  variant: { id: 'variant', email: 'Tester@example.com' },
  // Allow-listed customer test accounts (CAREER_FACTS_FIRST_ALLOWLIST): only a verified, canonical address counts.
  pilot: { id: 'pilot', email: 'pilot@example.com', emailVerifiedAt: new Date('2026-10-01T00:00:00Z') },
  pilotUnverified: { id: 'pilot-unverified', email: 'pending@example.com', emailVerifiedAt: null },
  pilotVariant: { id: 'pilot-variant', email: 'Pilot@example.com', emailVerifiedAt: new Date('2026-10-01T00:00:00Z') },
};
const mocks = vi.hoisted(() => ({
  storage: { getReportTypes: vi.fn(), getReportTypeById: vi.fn(), placeReportOrder: vi.fn(), getUserKundlis: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn(), setReportOrderContent: vi.fn() },
  generateReport: vi.fn(),
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
vi.mock('../../server/aiAstrologerService', async (orig) => ({
  ...await orig<typeof import('../../server/aiAstrologerService')>(),
  generateReport: mocks.generateReport,
  generateLifeReport: vi.fn(async () => { throw new Error('not in this test'); }),
}));
import { registerRoutes } from '../../server/routes';
import { careerPipelineFor } from '../../server/careerPipeline';

let app: Express;
let kundli: any;
beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    // As passport's deserializeUser does: the stored account row, read by id.
    req.user = USERS[String(req.headers['x-user'] ?? 'customer')] as any;
    req.session = {} as any;
    next();
  });
  await registerRoutes(app);
  const { getKundli } = await import('../../server/astroEngine');
  kundli = await getKundli('1990-05-15', '14:30', 28.6139, 77.209, { timeAccuracy: 'exact', timezone: null, utcOffset: null, place: 'New Delhi' });
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  vi.stubEnv('ADMIN_EMAILS', 'tester@example.com');
  mocks.storage.getReportTypes.mockResolvedValue(CATALOGUE);
  mocks.storage.getReportTypeById.mockImplementation(async (id: string) => CATALOGUE.find((t) => t.id === id));
  mocks.storage.getUserKundlis.mockImplementation(async (userId: string) => [{ id: 'k1', userId, name: 'Test', ...kundli, chartData: { ...kundli.chartData, isBirthTimeApproximate: false } }]);
  mocks.storage.placeReportOrder.mockResolvedValue({ order: { id: 'o1', chargedAmount: '0' }, balance: '0.00' });
  mocks.generateReport.mockRejectedValue(new Error('not in this test'));
  mocks.storage.failAndRefundReportOrder.mockResolvedValue({ refunded: 0 });
  mocks.storage.createNotification.mockResolvedValue({});
});
afterEach(() => { vi.unstubAllEnvs(); });

const order = (user: string, body: Record<string, unknown> = {}) => request(app).post('/api/reports/order').set('x-user', user).send({ reportTypeId: 't-career', ...body });
const pipelineUsed = () => mocks.generateReport.mock.calls[0]?.[2]?.careerPipeline;

describe('Career pipeline selection at the order route', () => {
  it('flag off: every account, admin included, gets the three-part report', async () => {
    for (const user of ['admin', 'customer']) {
      mocks.generateReport.mockClear();
      expect((await order(user)).status).toBe(201);
      expect(pipelineUsed()).toBe('three-part');
    }
  });

  it('flag on: an admin account gets the facts-first pipeline', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true');
    expect((await order('admin')).status).toBe(201);
    expect(mocks.generateReport).toHaveBeenCalledWith('career', expect.anything(), { careerPipeline: 'facts-first' });
  });

  it('flag on: a customer, and a case variant of an admin address, get the three-part report', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true');
    for (const user of ['customer', 'variant']) {
      mocks.generateReport.mockClear();
      expect((await order(user)).status).toBe(201);
      expect(pipelineUsed(), user).toBe('three-part');
    }
  });

  it('flag on: nothing in the request body can choose the pipeline', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true');
    const attempts = [{ careerPipeline: 'facts-first' }, { pipeline: 'facts-first' }, { options: { careerPipeline: 'facts-first' } }, { isAdmin: true, email: 'tester@example.com' }];
    for (const body of attempts) {
      mocks.generateReport.mockClear();
      expect((await order('customer', body)).status).toBe(201);
      expect(pipelineUsed(), JSON.stringify(body)).toBe('three-part');
    }
  });

  it('other reports are unaffected', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true');
    expect((await order('admin', { reportTypeId: 't-marriage' })).status).toBe(201);
    expect(mocks.generateReport).toHaveBeenCalledWith('marriage', expect.anything(), { careerPipeline: 'three-part' });
  });
});

describe('Career pipeline selection: the customer allow-list', () => {
  const allowList = () => vi.stubEnv('CAREER_FACTS_FIRST_ALLOWLIST', ' Pilot@Example.com , pending@example.com ');

  it('flag on: an allow-listed, verified customer gets facts-first and is charged through the usual order path', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true'); allowList();
    expect((await order('pilot')).status).toBe(201);
    expect(mocks.generateReport).toHaveBeenCalledWith('career', expect.anything(), { careerPipeline: 'facts-first' });
    expect(mocks.storage.placeReportOrder).toHaveBeenCalledTimes(1);
  });

  it('flag on: customers not on the list, unverified listed addresses and case variants stay three-part', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true'); allowList();
    for (const user of ['customer', 'pilotUnverified', 'pilotVariant']) {
      mocks.generateReport.mockClear();
      expect((await order(user)).status).toBe(201);
      expect(pipelineUsed(), user).toBe('three-part');
    }
  });

  it('flag off: everyone, allow-listed and admin included, is routed back to three-part', async () => {
    allowList();
    for (const user of ['pilot', 'admin', 'customer']) {
      mocks.generateReport.mockClear();
      expect((await order(user)).status).toBe(201);
      expect(pipelineUsed(), user).toBe('three-part');
    }
  });

  it('flag on: admins keep facts-first whether or not they are on the list', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true'); allowList();
    expect((await order('admin')).status).toBe(201);
    expect(pipelineUsed()).toBe('facts-first');
  });

  it('flag on: a request cannot claim an allow-listed identity or choose the pipeline', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true'); allowList();
    const attempts = [{ email: 'pilot@example.com' }, { emailVerifiedAt: '2026-10-01', email: 'pilot@example.com' }, { careerPipeline: 'facts-first' }, { allowlist: ['customer@example.com'] }];
    for (const body of attempts) {
      mocks.generateReport.mockClear();
      expect((await order('customer', body)).status).toBe(201);
      expect(pipelineUsed(), JSON.stringify(body)).toBe('three-part');
    }
  });

  it('other reports are unaffected for allow-listed customers', async () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true'); allowList();
    expect((await order('pilot', { reportTypeId: 't-marriage' })).status).toBe(201);
    expect(mocks.generateReport).toHaveBeenCalledWith('marriage', expect.anything(), { careerPipeline: 'three-part' });
  });
});

describe('careerPipelineFor', () => {
  it('needs the flag, the career category and an admin account', () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true');
    expect(careerPipelineFor('career', USERS.admin)).toBe('facts-first');
    expect(careerPipelineFor('marriage', USERS.admin)).toBe('three-part');
    expect(careerPipelineFor('career', USERS.customer)).toBe('three-part');
    expect(careerPipelineFor('career', USERS.variant)).toBe('three-part');
    expect(careerPipelineFor('career', null)).toBe('three-part');
    expect(careerPipelineFor('career', { email: null })).toBe('three-part');
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', '1');
    expect(careerPipelineFor('career', USERS.admin)).toBe('three-part');
  });
  it('the allow-list is empty by default and matches only verified, canonical addresses', () => {
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', 'true');
    expect(careerPipelineFor('career', USERS.pilot)).toBe('three-part'); // no list configured
    vi.stubEnv('CAREER_FACTS_FIRST_ALLOWLIST', 'pilot@example.com,,pending@example.com');
    expect(careerPipelineFor('career', USERS.pilot)).toBe('facts-first');
    expect(careerPipelineFor('career', USERS.pilotUnverified)).toBe('three-part');
    expect(careerPipelineFor('career', USERS.pilotVariant)).toBe('three-part');
    expect(careerPipelineFor('career', { email: 'pilot@example.com' })).toBe('three-part'); // no verification recorded
    expect(careerPipelineFor('marriage', USERS.pilot)).toBe('three-part');
    vi.stubEnv('FEATURE_CAREER_FACTS_FIRST', '');
    expect(careerPipelineFor('career', USERS.pilot)).toBe('three-part');
  });
});

describe('Universal report engine selection at the order route', () => {
  const categories = CATALOGUE.map((report) => [report.id, report.category] as const);

  it.each(categories)('%s is enqueued through the universal pipeline only for a verified allow-listed account', async (reportTypeId, category) => {
    vi.stubEnv('FEATURE_UNIVERSAL_REPORT_ENGINE', 'true');
    vi.stubEnv('UNIVERSAL_REPORT_ENGINE_ALLOWLIST', 'pilot@example.com');
    expect((await order('pilot', { reportTypeId })).status).toBe(201);
    expect(mocks.storage.placeReportOrder).toHaveBeenCalledWith(expect.objectContaining({
      reportTypeId,
      generationJob: expect.objectContaining({ category, payload: { kundli: expect.any(Object) } }),
    }));
    expect(mocks.generateReport).not.toHaveBeenCalled();
  });

  it.each(categories)('%s stays on the legacy pipeline when the universal flag is disabled', async (reportTypeId) => {
    vi.stubEnv('UNIVERSAL_REPORT_ENGINE_ALLOWLIST', 'pilot@example.com');
    expect((await order('pilot', { reportTypeId })).status).toBe(201);
    expect(mocks.storage.placeReportOrder).toHaveBeenCalledWith(expect.objectContaining({
      reportTypeId,
      generationJob: undefined,
    }));
  });

  it('does not trust a request body to opt an ordinary customer into the universal engine', async () => {
    vi.stubEnv('FEATURE_UNIVERSAL_REPORT_ENGINE', 'true');
    vi.stubEnv('UNIVERSAL_REPORT_ENGINE_ALLOWLIST', 'pilot@example.com');
    expect((await order('customer', { universalEngine: true, pipeline: 'universal-v1' })).status).toBe(201);
    expect(mocks.storage.placeReportOrder).toHaveBeenCalledWith(expect.objectContaining({ generationJob: undefined }));
  });
});
