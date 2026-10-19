// The five released reports end to end against a real disposable Postgres: catalogue, order route, one debit, durable
// job, worker, the real engine and validation (offline model replies), stored delivery, reopening, PDF, and the
// refund on a terminal failure. Complete Life and non-allow-listed accounts stay on the legacy generators.
import crypto from 'node:crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';

const url = process.env.TEST_DATABASE_URL;
const legacy = vi.hoisted(() => ({
  generateReport: vi.fn(async () => ({ title: 'Legacy report', summary: 'Legacy', sections: [], remedies: [] })),
  generateLifeReport: vi.fn(async () => ({ title: 'Complete Life Report', summary: 'Legacy', sections: [], remedies: [] })),
}));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
vi.mock('../../server/aiAstrologerService', async (orig) => ({ ...await orig<typeof import('../../server/aiAstrologerService')>(), ...legacy }));

const ASOF = new Date('2026-10-19T00:00:00Z');
// A deterministic Challenging (not insufficient) relationship chart: difficult evidence remains eligible.
const BIRTH = { name: 'E2E Synthetic Reader', dateOfBirth: '1990-09-25', timeOfBirth: '19:50', placeOfBirth: 'London, United Kingdom', latitude: 51.51, longitude: -0.13 };
const INSUFFICIENT_MARRIAGE_BIRTH = { name: 'E2E Evidence-thin Reader', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru, Karnataka, India', latitude: 12.9716, longitude: 77.5946 };
const NEUTRAL = 'The verified evidence describes tendencies rather than certainties and shows a mixed balance that deserves a measured response. The supporting factors explain where momentum may arise, while the limiting factors show where care, preparation and realistic expectations matter. This interpretation stays within the calculated chart and turns that balance into practical guidance without promising a fixed outcome. ';

/** A valid structured reply for whatever sections the prompt asks for (no network). */
const genericRequester = async (prompt: string) => {
  const sections = JSON.parse(prompt.match(/SECTIONS: (\[.*\])\nEVIDENCE:/s)![1]) as Array<{ heading: string; citableEvidenceIds: string[] }>;
  const content = JSON.stringify({
    summary: NEUTRAL.repeat(2), summaryEvidenceIds: sections[0]?.citableEvidenceIds.slice(0, 1) ?? [],
    sections: sections.map((s) => ({
      heading: s.heading, body: NEUTRAL.repeat(3), evidenceIds: s.citableEvidenceIds.slice(0, 1),
      evidenceLinks: s.citableEvidenceIds.slice(0, 1).map((evidenceId) => ({ evidenceId, conclusion: 'Choose measured practical action', explanation: 'This verified factor supports a measured response because it identifies both the available strength and its stated limitation.' })),
    })),
    remedies: [],
  });
  return { choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 800, completion_tokens: 900 } };
};

describe.skipIf(!url)('five released reports end to end (Postgres)', () => {
  let app: Express;
  let pool: typeof import('../../server/db')['pool'];
  let storage: typeof import('../../server/storage')['storage'];
  let processNextUniversalReportJob: typeof import('../../server/reportEngine/jobs')['processNextUniversalReportJob'];
  let offline: (category: string, kundli: any) => Promise<object>;
  let currentUser: any;

  const newUser = async (email: string, verified = true, balance = '5000.00') => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email, email_verified_at) VALUES ($1, $2, $3)', [id, email, verified ? new Date() : null]);
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)', [id, balance]);
    return (await storage.getUser(id))!;
  };
  /** A fresh verified account on the allow-listed address (the previous holder is renamed: emails are unique). */
  const pilot = async () => {
    await pool.query("UPDATE users SET email = id || '@retired.test' WHERE email = 'pilot-e2e@example.com'");
    return newUser('pilot-e2e@example.com');
  };
  const balanceOf = async (userId: string) => Number((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId])).rows[0].balance);
  const countTx = async (userId: string, type: string) => (await pool.query('SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND type = $2', [userId, type])).rows[0].n as number;
  const jobOf = async (orderId: string) => (await pool.query('SELECT status, pipeline, category FROM report_generation_jobs WHERE order_id = $1', [orderId])).rows[0];
  const order = (reportTypeId: string, price: number) => request(app).post('/api/reports/order').send({ reportTypeId, expectedPrice: price, birthDetails: BIRTH });
  /** Runs the worker until this order's job is no longer queued (other suites may leave jobs behind). */
  const work = async (orderId: string, generate: (category: string, kundli: any) => Promise<object>) => {
    for (let i = 0; i < 20 && (await jobOf(orderId))?.status === 'queued'; i++) await processNextUniversalReportJob(generate);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.OPENAI_API_KEY = 'sk-offline-e2e'; // reports are "available"; every generator below is offline
    process.env.FEATURE_UNIVERSAL_REPORT_ENGINE = 'true';
    process.env.UNIVERSAL_REPORT_ENGINE_ALLOWLIST = 'pilot-e2e@example.com';
    ({ pool } = await import('../../server/db'));
    ({ storage } = await import('../../server/storage'));
    await (await import('../../server/migrate')).runMigrations();
    // Life Reading has no seeded catalogue row; a test-only row stands in for one an admin would create.
    await pool.query("INSERT INTO report_types (slug, name, description, category, price, icon, sort_order) VALUES ('life-reading-e2e', 'Life Reading Report', 'Test only.', 'life', 199, 'Sun', 9) ON CONFLICT DO NOTHING");
    await pool.query("UPDATE report_generation_jobs SET status = 'failed' WHERE status = 'queued'");
    ({ processNextUniversalReportJob } = await import('../../server/reportEngine/jobs'));
    const { generateUniversalReport } = await import('../../server/reportEngine/engine');
    const { generateDeterministicCareer } = await import('../../server/careerReportGeneration');
    const { buildCareerReportFacts } = await import('../../server/careerReportEvidence');
    const { mockedRequester } = await import('../fixtures/career-premium-replies');
    // The worker's production generator with offline requesters: Career through its own pipeline, as the engine does.
    offline = async (category, kundli) => category === 'career'
      ? generateDeterministicCareer(kundli, ASOF, mockedRequester(buildCareerReportFacts(kundli, ASOF)) as any)
      : generateUniversalReport(category, kundli, { requester: genericRequester as any, asOf: ASOF });
    app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      req.user = currentUser; req.session = {} as any;
      next();
    });
    await (await import('../../server/routes')).registerRoutes(app);
  }, 120_000);

  afterAll(async () => { await pool?.end(); });

  it.each([['career'], ['marriage'], ['finance'], ['year_ahead'], ['life']])('%s: catalogue → one debit → durable job → validated delivery → reopen → PDF', async (category) => {
    currentUser = await pilot();

    const types = (await request(app).get('/api/reports/types')).body as Array<{ id: string; category: string; price: number | string }>;
    const type = types.find((t) => t.category === category)!;
    expect(type).toBeDefined();
    const price = Number(type.price);
    const before = await balanceOf(currentUser.id);

    const placed = await order(type.id, price);
    expect(placed.status).toBe(201);
    const orderId = placed.body.orderId as string;
    expect(await balanceOf(currentUser.id)).toBeCloseTo(before - price, 2);
    expect(await countTx(currentUser.id, 'debit')).toBe(1);
    expect(await jobOf(orderId)).toEqual({ status: 'queued', pipeline: 'universal-v1', category });
    // A second identical order while this one is processing is refused without a charge.
    expect((await order(type.id, price)).status).toBe(409);
    expect(await countTx(currentUser.id, 'debit')).toBe(1);

    await work(orderId, offline);
    expect((await jobOf(orderId)).status).toBe('completed');
    const reopened = await request(app).get(`/api/reports/orders/${orderId}`);
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe('ready');
    const content = reopened.body.content;
    expect(content.sections.length).toBeGreaterThanOrEqual(category === 'career' ? 7 : 6);
    expect(JSON.stringify(content)).not.toMatch(/\*\*|conclusion:[a-z]/);
    expect((await request(app).get(`/api/reports/orders/${orderId}`)).body.content).toEqual(content); // reopening is stable
    expect((await request(app).get('/api/reports/orders')).body.map((o: any) => o.id)).toContain(orderId);

    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    if (content.careerAnalysis?.timeline) {
      const { renderCareerPdf } = await import('../../client/src/lib/careerReportPdf');
      const { DM_SANS_REGULAR, DM_SANS_SEMIBOLD, ECZAR_SEMIBOLD } = await import('../../client/src/lib/pdf/fonts');
      renderCareerPdf(doc, content, { fonts: { regular: DM_SANS_REGULAR, semibold: DM_SANS_SEMIBOLD, display: ECZAR_SEMIBOLD } });
    } else {
      (await import('../../client/src/lib/reportPdf')).renderGenericReportPdf(doc, content);
    }
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(await countTx(currentUser.id, 'refund')).toBe(0);
    expect(legacy.generateReport).not.toHaveBeenCalled();
  }, 120_000);

  it('a terminal generation failure fails the order and refunds it exactly once', async () => {
    currentUser = await pilot();
    const type = ((await request(app).get('/api/reports/types')).body as any[]).find((t) => t.category === 'marriage');
    const before = await balanceOf(currentUser.id);
    const orderId = (await order(type.id, Number(type.price))).body.orderId as string;
    const { ReportGenerationError } = await import('../../server/reportQuality');
    await work(orderId, async () => { throw new ReportGenerationError('Required report content failed validation'); });
    expect((await jobOf(orderId)).status).toBe('failed');
    expect((await request(app).get(`/api/reports/orders/${orderId}`)).body.status).toBe('failed');
    expect(await balanceOf(currentUser.id)).toBeCloseTo(before, 2);
    expect(await countTx(currentUser.id, 'refund')).toBe(1);
    // Any later attempt to finalise or refund it again changes nothing.
    await storage.failAndRefundReportOrder(orderId, 'retry');
    expect(await countTx(currentUser.id, 'refund')).toBe(1);
    expect(await balanceOf(currentUser.id)).toBeCloseTo(before, 2);
  }, 120_000);

  it('an evidence-thin Marriage request is refused before checkout and never debits or enqueues', async () => {
    currentUser = await pilot();
    const type = ((await request(app).get('/api/reports/types')).body as any[]).find((t) => t.category === 'marriage');
    const before = await balanceOf(currentUser.id);
    const body = { reportTypeId: type.id, expectedPrice: Number(type.price), birthDetails: INSUFFICIENT_MARRIAGE_BIRTH };

    const preflight = await request(app).post('/api/reports/eligibility').send(body);
    expect(preflight.status).toBe(200);
    expect(preflight.body).toMatchObject({ eligible: false, code: 'insufficient_marriage_evidence' });
    const checkout = await request(app).post('/api/reports/order').send(body);
    expect(checkout.status).toBe(409);
    expect(checkout.body).toMatchObject(preflight.body);
    expect(await balanceOf(currentUser.id)).toBeCloseTo(before, 2);
    expect(await countTx(currentUser.id, 'debit')).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM report_generation_jobs j JOIN report_orders o ON o.id = j.order_id WHERE o.user_id = $1', [currentUser.id])).rows[0].n).toBe(0);
  }, 120_000);

  it('Complete Life is charged once and generated by the legacy route, with no universal job, for an allow-listed account', async () => {
    currentUser = await pilot();
    const type = ((await request(app).get('/api/reports/types')).body as any[]).find((t) => t.category === 'life_complete');
    const placed = await order(type.id, Number(type.price));
    expect(placed.status).toBe(201);
    expect(await jobOf(placed.body.orderId)).toBeUndefined();
    await vi.waitFor(() => expect(legacy.generateLifeReport).toHaveBeenCalledTimes(1));
  }, 120_000);

  it('a customer who is not allow-listed keeps the legacy route for a released report', async () => {
    currentUser = await newUser(`${crypto.randomUUID()}@customer.test`);
    const type = ((await request(app).get('/api/reports/types')).body as any[]).find((t) => t.category === 'finance');
    const placed = await order(type.id, Number(type.price));
    expect(placed.status).toBe(201);
    expect(await jobOf(placed.body.orderId)).toBeUndefined();
    await vi.waitFor(() => expect(legacy.generateReport).toHaveBeenCalledWith('finance', expect.any(Object), expect.any(Object)));
  }, 120_000);
});
