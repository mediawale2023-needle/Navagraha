// Phase A security hotfix: wallet self-credit, admin escalation by email case, and
// public exposure of astrologer personal data. Each test reproduces the original exploit.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), updateUser: vi.fn(), getUserByEmail: vi.fn(), createUserWithPassword: vi.fn(), createWallet: vi.fn(),
    getWallet: vi.fn(), updateWalletBalance: vi.fn(), createTransaction: vi.fn(),
    getAllAstrologers: vi.fn(), getAstrologerById: vi.fn(), getFollowerUserIds: vi.fn(),
  },
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/emailService', () => ({
  sendWelcomeEmail: vi.fn(async () => {}), sendPaymentReceipt: vi.fn(), sendBookingConfirmation: vi.fn(), sendConsultationSummary: vi.fn(),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
import { registerRoutes } from '../../server/routes';

let app: Express;

beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.isAuthenticated = (() => Boolean(id)) as typeof req.isAuthenticated;
    if (id) req.user = { id: String(id), email: req.headers['x-email'] ? String(req.headers['x-email']) : undefined };
    req.session = {} as any;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ADMIN_EMAIL', 'admin@audit.test');
  vi.stubEnv('ADMIN_EMAILS', 'ops@audit.test');
  mocks.storage.getWallet.mockResolvedValue({ userId: 'u1', balance: '0.00' });
  mocks.storage.createWallet.mockResolvedValue({});
  mocks.storage.getUserByEmail.mockResolvedValue(undefined);
  mocks.storage.createUserWithPassword.mockImplementation(async (d: any) => ({ id: 'new', email: d.email, passwordHash: 'h' }));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('1. wallet self-credit', () => {
  it('POST /api/wallet/add no longer exists and moves no money', async () => {
    const res = await request(app).post('/api/wallet/add').set('x-user', 'u1').send({ amount: 100000 });
    expect(res.status).toBe(404);
    expect(mocks.storage.updateWalletBalance).not.toHaveBeenCalled();
    expect(mocks.storage.createTransaction).not.toHaveBeenCalled();
  });

  it('no server route credits a wallet under that path', () => {
    expect(readFileSync('server/routes.ts', 'utf8')).not.toContain("'/api/wallet/add'");
  });
});

describe('2. admin escalation through email case', () => {
  const register = (email: string) =>
    request(app).post('/api/auth/register').send({ email, password: 'Takeover#2026x', firstName: 'X' });

  it.each(['ADMIN@AUDIT.TEST', 'Admin@Audit.Test', ' admin@audit.test ', 'OPS@audit.test'])(
    'a case variant of an admin address (%s) cannot be registered',
    async (email) => {
      const res = await register(email);
      expect(res.status).toBe(409);
      expect(mocks.storage.createUserWithPassword).not.toHaveBeenCalled();
    },
  );

  it('an unclaimed ADMIN_EMAILS address cannot be self-registered, with the same reply as a taken address', async () => {
    const admin = await register('ops@audit.test');
    mocks.storage.getUserByEmail.mockResolvedValueOnce({ id: 'someone', email: 'taken@example.com' });
    const taken = await register('taken@example.com');
    expect(admin.status).toBe(409);
    expect(admin.body).toEqual(taken.body);
    expect(mocks.storage.createUserWithPassword).not.toHaveBeenCalled();
  });

  it('a non-admin address that differs only by case from an existing account is refused', async () => {
    mocks.storage.getUserByEmail.mockResolvedValueOnce({ id: 'u-existing', email: 'person@example.com' });
    expect((await register('PERSON@example.com')).status).toBe(409);
    expect(mocks.storage.getUserByEmail).toHaveBeenCalledWith('person@example.com');
  });

  it('new accounts are stored under the normalised address', async () => {
    const res = await register('  New.User@Example.COM ');
    expect(res.status).toBe(201);
    expect(mocks.storage.createUserWithPassword).toHaveBeenCalledWith(expect.objectContaining({ email: 'new.user@example.com' }));
  });

  it('an existing case-variant account is refused admin routes; the canonical admin is let through', async () => {
    const variant = await request(app).get('/api/admin/stats').set('x-user', 'attacker').set('x-email', 'ADMIN@AUDIT.TEST');
    expect(variant.status).toBe(403);
    const real = await request(app).get('/api/admin/stats').set('x-user', 'admin').set('x-email', 'admin@audit.test');
    expect(real.status).not.toBe(403);
    expect(real.status).not.toBe(401);
  });
});

describe('4. public astrologer data', () => {
  const PRIVATE_KEYS = [
    'email', 'phoneNumber', 'passwordHash', 'panNumber', 'aadhaarLast4', 'upiId', 'bankAccountName',
    'bankAccountNumber', 'bankIfsc', 'kycNotes', 'kycStatus', 'kycSubmittedAt', 'kycReviewedAt',
    'totalEarnings', 'pendingPayout', 'proAiCreditsUsed', 'proAiCreditsResetAt', 'lastSeenAt', 'createdAt',
  ];
  const full = (over: object = {}) => ({
    id: 'a1', name: 'Verified Astro', email: 'astro@example.com', passwordHash: 'x', phoneNumber: '+919999999999',
    profileImageUrl: null, specializations: ['Vedic'], experience: 8, rating: '4.20', totalConsultations: 12,
    pricePerMinute: '30.00', availability: 'offline', languages: ['Hindi'], about: 'About', certifications: [],
    isVerified: true, isOnline: false, totalEarnings: '5000.00', pendingPayout: '1200.00', bankAccountName: 'Name',
    bankAccountNumber: '123', bankIfsc: 'IFSC', upiId: 'astro@upi', lastSeenAt: new Date(), kycStatus: 'approved',
    panNumber: 'ABCDE1234F', aadhaarLast4: '1234', kycNotes: 'note', kycSubmittedAt: new Date(), kycReviewedAt: new Date(),
    proAiCreditsUsed: 3, proAiCreditsResetAt: new Date(), createdAt: new Date(), ...over,
  });

  it('the public list carries no contact, KYC, bank or earnings field, and lists only verified astrologers', async () => {
    mocks.storage.getAllAstrologers.mockResolvedValue([full(), full({ id: 'a2', name: 'Pending', isVerified: false })]);
    const res = await request(app).get('/api/astrologers');
    expect(res.status).toBe(200);
    expect(res.body.map((a: any) => a.id)).toEqual(['a1']);
    for (const key of PRIVATE_KEYS) expect(res.body[0]).not.toHaveProperty(key);
    expect(res.body[0]).toMatchObject({ id: 'a1', name: 'Verified Astro', pricePerMinute: '30.00', isVerified: true });
  });

  it('the public profile carries no private field', async () => {
    mocks.storage.getAstrologerById.mockResolvedValue(full());
    mocks.storage.getFollowerUserIds.mockResolvedValue(['u9']);
    const res = await request(app).get('/api/astrologers/a1');
    expect(res.status).toBe(200);
    for (const key of PRIVATE_KEYS) expect(res.body).not.toHaveProperty(key);
    expect(res.body).toMatchObject({ id: 'a1', followerCount: 1, isFollowing: false });
  });
});

describe('5. the signed-in user never receives their password hash', () => {
  const row = { id: 'u1', email: 'me@audit.test', firstName: 'Me', passwordHash: '$2b$10$secret' };

  it('GET /api/auth/user omits passwordHash', async () => {
    mocks.storage.getUser.mockResolvedValue(row);
    const res = await request(app).get('/api/auth/user').set('x-user', 'u1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'u1', email: 'me@audit.test' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('PUT /api/auth/user omits passwordHash', async () => {
    mocks.storage.updateUser.mockResolvedValue({ ...row, firstName: 'New' });
    const res = await request(app).put('/api/auth/user').set('x-user', 'u1').send({ firstName: 'New' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'New' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});
