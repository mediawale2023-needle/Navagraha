// Release B report prices: behind FEATURE_RELEASE_B_PRICING, the listing and the order price the
// same way, and a client showing a stale price is refused before any charge.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const CATALOGUE = [
  { id: 't-life', slug: 'complete-life-report', category: 'life_complete', price: '1499.00', isActive: true },
  { id: 't-career', slug: 'career-report', category: 'career', price: '299.00', isActive: true },
  { id: 't-marriage', slug: 'marriage-report', category: 'marriage', price: '349.00', isActive: true },
  { id: 't-finance', slug: 'finance-report', category: 'finance', price: '299.00', isActive: true },
  { id: 't-year', slug: 'year-ahead-report', category: 'year_ahead', price: '499.00', isActive: true },
];
const mocks = vi.hoisted(() => ({ storage: { getReportTypes: vi.fn(), getReportTypeById: vi.fn(), placeReportOrder: vi.fn(), getUserKundlis: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn(), setReportOrderContent: vi.fn() } }));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
// Generation is not under test: it fails at once and the order is refunded.
vi.mock('../../server/aiAstrologerService', async (orig) => ({
  ...await orig<typeof import('../../server/aiAstrologerService')>(),
  generateReport: vi.fn(async () => { throw new Error('not in this test'); }),
  generateLifeReport: vi.fn(async () => { throw new Error('not in this test'); }),
}));
import { registerRoutes } from '../../server/routes';
import { reportPrice, RELEASE_B_REPORT_PRICES } from '../../server/reportPricing';

let app: Express;
beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: 'u1' } as any;
    req.session = {} as any;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.getReportTypes.mockResolvedValue(CATALOGUE);
  mocks.storage.getReportTypeById.mockImplementation(async (id: string) => CATALOGUE.find((t) => t.id === id));
});
afterEach(() => { vi.unstubAllEnvs(); });

const prices = async () => Object.fromEntries((await request(app).get('/api/reports/types')).body.map((t: any) => [t.slug, t.price]));

describe('report prices', () => {
  it('flag off: the stored catalogue prices, unchanged', async () => {
    expect(await prices()).toEqual({
      'complete-life-report': '1499.00', 'career-report': '299.00', 'marriage-report': '349.00', 'finance-report': '299.00', 'year-ahead-report': '499.00',
    });
  });

  it('flag on: Career, Marriage, Finance ₹299, Year Ahead ₹499, Life ₹999', async () => {
    vi.stubEnv('FEATURE_RELEASE_B_PRICING', 'true');
    expect(await prices()).toEqual({
      'complete-life-report': '999.00', 'career-report': '299.00', 'marriage-report': '299.00', 'finance-report': '299.00', 'year-ahead-report': '499.00',
    });
    expect(RELEASE_B_REPORT_PRICES).toEqual({ 'career-report': 299, 'marriage-report': 299, 'finance-report': 299, 'year-ahead-report': 499, 'complete-life-report': 999 });
  });

  it('a report not in the Release B list keeps its stored price', () => {
    vi.stubEnv('FEATURE_RELEASE_B_PRICING', 'true');
    expect(reportPrice({ slug: 'something-else', price: '149.00' })).toBe(149);
  });

  it('an order showing a stale price is refused before any charge', async () => {
    vi.stubEnv('FEATURE_RELEASE_B_PRICING', 'true');
    const res = await request(app).post('/api/reports/order').send({ reportTypeId: 't-life', expectedPrice: 1499 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'price_changed', price: 999 });
    expect(mocks.storage.placeReportOrder).not.toHaveBeenCalled();
  });

  it('flag off, the stored price is the one an order must match', async () => {
    const res = await request(app).post('/api/reports/order').send({ reportTypeId: 't-marriage', expectedPrice: 299 });
    expect(res.status).toBe(409);
    expect(res.body.price).toBe(349);
  });
});

describe('the order charges the listed price', () => {
  it.each([[false, 't-life', 1499], [true, 't-life', 999], [true, 't-marriage', 299], [false, 't-marriage', 349]])('flag %s, %s: ₹%i', async (flag, typeId, price) => {
    vi.stubEnv('FEATURE_RELEASE_B_PRICING', String(flag));
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const { getKundli } = await import('../../server/astroEngine');
    const k = await getKundli('1990-05-15', '14:30', 28.6139, 77.209, { timeAccuracy: 'exact', timezone: null, utcOffset: null, place: 'New Delhi' });
    mocks.storage.getUserKundlis.mockResolvedValue([{ id: 'k1', userId: 'u1', name: 'Me', ...k, chartData: { ...k.chartData, isBirthTimeApproximate: false } }]);
    mocks.storage.placeReportOrder.mockResolvedValue({ order: { id: 'o1', chargedAmount: String(price) }, balance: '0.00' });
    const res = await request(app).post('/api/reports/order').send({ reportTypeId: typeId, expectedPrice: price });
    expect(res.status).toBe(201);
    expect(mocks.storage.placeReportOrder).toHaveBeenCalledWith(expect.objectContaining({ price }));
  });
});
