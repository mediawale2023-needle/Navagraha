// Release B: email verification routes. Tokens are hashed before storage, the resend route
// is flag-gated and limited, and the link route always redirects without echoing the token.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import crypto from 'node:crypto';

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), getUserByEmail: vi.fn(), createUserWithPassword: vi.fn(), createWallet: vi.fn(),
    issueEmailVerificationToken: vi.fn(), consumeEmailVerificationToken: vi.fn(),
  },
  email: { sendWelcomeEmail: vi.fn(async () => {}), sendVerificationEmail: vi.fn(async () => true), emailConfigured: vi.fn(() => true) },
}));
vi.mock('../../server/storage', () => ({ storage: mocks.storage }));
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/auth', async (orig) => ({ ...await orig<typeof import('../../server/auth')>(), setupAuth: vi.fn() }));
vi.mock('../../server/swagger', () => ({ setupSwagger: vi.fn() }));
vi.mock('../../server/emailService', () => ({
  ...mocks.email, sendPaymentReceipt: vi.fn(), sendBookingConfirmation: vi.fn(), sendConsultationSummary: vi.fn(),
}));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn(), sendPushToAstrologer: vi.fn() }));
import { registerRoutes } from '../../server/routes';
import { hashVerificationToken, isWellFormedToken, newVerificationToken, EMAIL_VERIFICATION_LIMITS } from '../../server/emailVerification';
import { googleVerifiesAccountEmail } from '../../server/adminAccess';
import { readFileSync } from 'node:fs';

let app: Express;
beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.isAuthenticated = (() => Boolean(id)) as typeof req.isAuthenticated;
    if (id) req.user = { id: String(id) };
    req.session = {} as any;
    next();
  });
  await registerRoutes(app);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('FEATURE_EMAIL_VERIFICATION', 'true');
  mocks.email.emailConfigured.mockReturnValue(true);
  mocks.email.sendVerificationEmail.mockResolvedValue(true);
  mocks.storage.getUser.mockResolvedValue({ id: 'u1', email: 'me@example.com', firstName: 'Me', emailVerifiedAt: null, passwordHash: 'h' });
  mocks.storage.issueEmailVerificationToken.mockResolvedValue({ issued: true });
  mocks.storage.getUserByEmail.mockResolvedValue(undefined);
  mocks.storage.createWallet.mockResolvedValue({});
  mocks.storage.createUserWithPassword.mockImplementation(async (d: any) => ({ id: 'new', email: d.email, firstName: d.firstName, passwordHash: 'h' }));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('tokens', () => {
  it('are 256-bit base64url strings; storage receives only the SHA-256', () => {
    const { token, hash } = newVerificationToken();
    expect(isWellFormedToken(token)).toBe(true);
    expect(hash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token);
    expect(newVerificationToken().token).not.toBe(token);
  });

  it('limits: 24 h expiry, one a minute, five a day', () => {
    expect(EMAIL_VERIFICATION_LIMITS).toEqual({ ttlS: 86400, minIntervalS: 60, perDay: 5 });
  });

  it('malformed tokens are rejected', () => {
    for (const t of ['', 'abc', 'x'.repeat(44), '../../etc', null, 42, 'a'.repeat(42) + '=']) expect(isWellFormedToken(t)).toBe(false);
  });
});

describe('POST /api/auth/register', () => {
  const register = () => request(app).post('/api/auth/register').send({ email: 'New@Example.com', password: 'Secret#2026x', firstName: 'N' });

  it('with verification on, issues a hashed token and emails the plaintext link', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ verificationEmailSent: true });
    await vi.waitFor(() => expect(mocks.email.sendVerificationEmail).toHaveBeenCalled());
    expect(res.body).not.toHaveProperty('passwordHash');
    const [userId, email, hash] = mocks.storage.issueEmailVerificationToken.mock.calls[0];
    expect([userId, email]).toEqual(['new', 'new@example.com']);
    const [, , token] = mocks.email.sendVerificationEmail.mock.calls[0] as unknown as [string, string, string];
    expect(hashVerificationToken(token)).toBe(hash);
    expect(mocks.email.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('with the flag off, nothing is issued and the welcome email goes as before', async () => {
    vi.stubEnv('FEATURE_EMAIL_VERIFICATION', 'false');
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.verificationEmailSent).toBe(false);
    expect(mocks.storage.issueEmailVerificationToken).not.toHaveBeenCalled();
    expect(mocks.email.sendWelcomeEmail).toHaveBeenCalled();
  });

  it('a mail server that never answers does not hold up registration', async () => {
    mocks.email.sendVerificationEmail.mockReturnValue(new Promise(() => {}));
    const res = await register();
    expect(res.status).toBe(201);
  });

  it('without SMTP, registration still succeeds and nothing is issued', async () => {
    mocks.email.emailConfigured.mockReturnValue(false);
    const res = await register();
    expect(res.status).toBe(201);
    expect(mocks.storage.issueEmailVerificationToken).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/verify-email/resend', () => {
  const resend = (user = 'u1') => request(app).post('/api/auth/verify-email/resend').set('x-user', user);

  it('needs a signed-in account', async () => {
    expect((await request(app).post('/api/auth/verify-email/resend')).status).toBe(401);
  });

  it('is 404 while the flag is off', async () => {
    vi.stubEnv('FEATURE_EMAIL_VERIFICATION', 'false');
    const res = await resend();
    expect(res.status).toBe(404);
    expect(mocks.storage.issueEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('sends to the account\'s own address only, ignoring any address in the body', async () => {
    const res = await resend().send({ email: 'victim@example.com' });
    expect(res.status).toBe(202);
    expect(mocks.email.sendVerificationEmail).toHaveBeenCalledWith('me@example.com', 'Me', expect.any(String));
  });

  it('an already verified account is told so and nothing is sent', async () => {
    mocks.storage.getUser.mockResolvedValue({ id: 'u1', email: 'me@example.com', emailVerifiedAt: new Date() });
    const res = await resend();
    expect(res.body).toEqual({ alreadyVerified: true });
    expect(mocks.email.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('throttled: 429 with Retry-After and no email', async () => {
    mocks.storage.issueEmailVerificationToken.mockResolvedValue({ throttled: true, retryAfterS: 42 });
    const res = await resend();
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('42');
    expect(res.body).toMatchObject({ code: 'verification_throttled', retryAfter: 42 });
    expect(mocks.email.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('email not configured: 503', async () => {
    mocks.email.emailConfigured.mockReturnValue(false);
    expect((await resend()).status).toBe(503);
  });
});

describe('GET /api/auth/verify-email', () => {
  it.each(['verified', 'already', 'expired', 'invalid', 'conflict'])('outcome %s redirects to the status page without the token', async (outcome) => {
    mocks.storage.consumeEmailVerificationToken.mockResolvedValue(outcome);
    const { token, hash } = newVerificationToken();
    const res = await request(app).get(`/api/auth/verify-email?token=${token}`);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/verify-email?status=${outcome}`);
    expect(res.headers.location).not.toContain(token);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(mocks.storage.consumeEmailVerificationToken).toHaveBeenCalledWith(hash);
  });

  it('a malformed token never reaches the database', async () => {
    const res = await request(app).get('/api/auth/verify-email?token=nope');
    expect(res.headers.location).toBe('/verify-email?status=invalid');
    expect(mocks.storage.consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('works with the flag off, so links already sent still verify', async () => {
    vi.stubEnv('FEATURE_EMAIL_VERIFICATION', 'false');
    mocks.storage.consumeEmailVerificationToken.mockResolvedValue('verified');
    const res = await request(app).get(`/api/auth/verify-email?token=${newVerificationToken().token}`);
    expect(res.headers.location).toBe('/verify-email?status=verified');
  });

  it('never logs the token', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    mocks.storage.consumeEmailVerificationToken.mockRejectedValue(new Error('db down'));
    const { token } = newVerificationToken();
    const res = await request(app).get(`/api/auth/verify-email?token=${token}`);
    expect(res.headers.location).toBe('/verify-email?status=error');
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(token);
    spies.forEach((s) => s.mockRestore());
  });
});

describe('Google sign-in', () => {
  it("verifies the account's email when Google signs in that mailbox, in any case", () => {
    expect(googleVerifiesAccountEmail('me@example.com', 'me@example.com')).toBe(true);
    expect(googleVerifiesAccountEmail('Me@Example.com', 'me@example.com')).toBe(true);
    expect(googleVerifiesAccountEmail('legacy@example.com', 'Legacy@Example.COM')).toBe(true);
  });

  it('verifies nothing for another address or a missing one', () => {
    expect(googleVerifiesAccountEmail('other@example.com', 'me@example.com')).toBe(false);
    expect(googleVerifiesAccountEmail(undefined, 'me@example.com')).toBe(false);
    expect(googleVerifiesAccountEmail('me@example.com', null)).toBe(false);
  });

  it('the Google strategy sets emailVerifiedAt through this check, keeping an earlier date', () => {
    const auth = readFileSync('server/auth.ts', 'utf8');
    expect(auth).toMatch(/googleVerifiesAccountEmail\(googleEmail, signIn\.email\)/);
    expect(auth).toMatch(/emailVerifiedAt: existing\?\.emailVerifiedAt \?\? new Date\(\)/);
  });
});
