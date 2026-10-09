// Phase A security hotfix: account-level rules behind the admin email-case fix and the
// demo Pro astrologer seed. Storage runs against an in-memory stand-in for the users table.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const state = vi.hoisted(() => ({ rows: [] as any[] }));
const mocks = vi.hoisted(() => ({
  pool: { query: vi.fn() },
  astro: { getAstrologerByEmail: vi.fn(), updateAstrologer: vi.fn(), createAstrologerWithPassword: vi.fn() },
}));

// Every users query returns state.rows (all rows in a test share one address up to case),
// so what is tested is the storage code's own ordering and choice among them.
vi.mock('../../server/db', () => {
  const where = () => Object.assign(Promise.resolve(state.rows), { orderBy: async () => [...state.rows] });
  return { db: { select: () => ({ from: () => ({ where }) }) }, pool: mocks.pool };
});
import { DatabaseStorage } from '../../server/storage';
import { googleSignInEmail, isAdminAccount, isAdminEmail, normalizeEmail } from '../../server/adminAccess';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ADMIN_EMAIL', 'admin@audit.test');
  vi.stubEnv('ADMIN_EMAILS', 'ops@audit.test, Second@Audit.test');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('admin identity', () => {
  it('the admin list matches any case, but only the canonical lower-case account holds the privilege', () => {
    expect(isAdminEmail('ADMIN@AUDIT.TEST')).toBe(true);
    expect(isAdminEmail('second@audit.test')).toBe(true);
    expect(isAdminAccount({ email: 'admin@audit.test' })).toBe(true);
    expect(isAdminAccount({ email: 'second@audit.test' })).toBe(true);
    expect(isAdminAccount({ email: 'ADMIN@AUDIT.TEST' })).toBe(false);
    expect(isAdminAccount({ email: 'Admin@audit.test' })).toBe(false);
    expect(isAdminAccount({ email: 'someone@audit.test' })).toBe(false);
    expect(isAdminAccount(null)).toBe(false);
    expect(normalizeEmail('  Mixed.Case@Example.COM ')).toBe('mixed.case@example.com');
  });

  it('free paid access follows the same rule: a case-variant account pays', async () => {
    const storage = new DatabaseStorage();
    state.rows = [{ id: 'attacker', email: 'ADMIN@AUDIT.TEST' }];
    expect(await storage.hasFreeAccess('attacker')).toBe(false);
    state.rows = [{ id: 'admin', email: 'admin@audit.test' }];
    expect(await storage.hasFreeAccess('admin')).toBe(true);
  });
});

describe('email lookups are case-insensitive and prefer the real account', () => {
  it('returns the exact-case row before a variant, then the canonical one', async () => {
    const storage = new DatabaseStorage();
    state.rows = [
      { id: 'variant', email: 'ADMIN@AUDIT.TEST', createdAt: new Date('2026-01-01') },
      { id: 'real', email: 'admin@audit.test', createdAt: new Date('2026-02-01') },
    ];
    expect((await storage.getUserByEmail('admin@audit.test'))?.id).toBe('real');
    expect((await storage.getUserByEmail('Admin@Audit.test'))?.id).toBe('real');
    expect((await storage.getUserByEmail('ADMIN@AUDIT.TEST'))?.id).toBe('variant');
  });

  it("a variant registered earlier cannot lock the real admin out of password login", async () => {
    const storage = new DatabaseStorage();
    state.rows = [
      { id: 'variant', email: 'ADMIN@AUDIT.TEST', passwordHash: await bcrypt.hash('attacker-pass', 4) },
      { id: 'real', email: 'admin@audit.test', passwordHash: await bcrypt.hash('real-admin-pass', 4) },
    ];
    expect((await storage.verifyUserPassword('Admin@audit.test', 'real-admin-pass'))?.id).toBe('real');
    expect((await storage.verifyUserPassword('admin@audit.test', 'wrong'))).toBeNull();
  });

  it('Google sign-in needs Google to affirm the address is verified', () => {
    const p = (verified: unknown, emails: object[] = [{ value: 'Admin@Audit.test' }]) => ({ emails, _json: { email_verified: verified } });
    expect(googleSignInEmail(p(true), undefined)).toEqual({ email: 'admin@audit.test' });
    expect(googleSignInEmail(p(false), undefined)).toBeNull();
    expect(googleSignInEmail(p(undefined), undefined)).toBeNull();
    expect(googleSignInEmail(p('true'), undefined)).toBeNull();
    expect(googleSignInEmail(p(undefined, [{ value: 'a@x.test', verified: true }]), undefined)).toEqual({ email: 'a@x.test' });
  });

  it('a returning Google user keeps the stored address (no collision from re-normalising)', () => {
    expect(googleSignInEmail({ emails: [{ value: 'Legacy@X.test' }], _json: { email_verified: true } }, 'Legacy@X.test')).toEqual({ email: 'Legacy@X.test' });
    const auth = readFileSync('server/auth.ts', 'utf8');
    expect(auth).toMatch(/googleSignInEmail\(profile as any, existing\?\.email\)/);
    expect(auth).toMatch(/if \(!signIn\) return done\(null, false\)/);
    expect(auth).toMatch(/if \(!isAdminAccount\(user\)\)/);
  });

  it('the admin seed only treats the canonical row as the admin account', () => {
    expect(readFileSync('server/migrate.ts', 'utf8')).toMatch(/const existing = found\?\.email === email \? found : undefined;/);
  });
});

describe('3. demo Pro astrologer credentials', () => {
  async function seed() {
    vi.resetModules();
    vi.doMock('../../server/storage', () => ({ storage: mocks.astro }));
    vi.doMock('../../server/db', () => ({ db: {}, pool: mocks.pool }));
    const migrate = await import('../../server/migrate');
    await migrate.seedProAstrologer();
    return migrate;
  }
  const demo = (over: object = {}) => ({
    id: 'demo-id', email: 'pro@navagraha.app', passwordHash: sha256('ProDemo@2026'), isVerified: true, kycStatus: 'approved', ...over,
  });

  it.each([
    ['no PRO_ASTROLOGER_PASSWORD', undefined],
    ['PRO_ASTROLOGER_PASSWORD set to the published default', 'ProDemo@2026'],
  ])('production with %s: nothing is seeded and a default-password demo is locked, record kept', async (_label, pw) => {
    vi.stubEnv('NODE_ENV', 'production');
    if (pw) vi.stubEnv('PRO_ASTROLOGER_PASSWORD', pw); else vi.stubEnv('PRO_ASTROLOGER_PASSWORD', '');
    mocks.astro.getAstrologerByEmail.mockResolvedValue(demo());
    await seed();
    expect(mocks.astro.createAstrologerWithPassword).not.toHaveBeenCalled();
    expect(mocks.astro.updateAstrologer).toHaveBeenCalledTimes(1);
    const [id, patch] = mocks.astro.updateAstrologer.mock.calls[0];
    expect(id).toBe('demo-id');
    expect(patch).toMatchObject({ isVerified: false, isOnline: false, availability: 'offline' });
    expect(patch.passwordHash).not.toBe(sha256('ProDemo@2026'));
    expect(patch.passwordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringMatching(/DELETE FROM sessions WHERE sess->>'astrologerId' = \$1/), ['demo-id']);
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringMatching(/UPDATE live_streams SET status = 'ended'/), ['demo-id']);
  });

  it('production: an account under a configured PRO_ASTROLOGER_EMAIL that still has the default password is locked too', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PRO_ASTROLOGER_EMAIL', 'Studio@Co.test');
    vi.stubEnv('PRO_ASTROLOGER_PASSWORD', '');
    mocks.astro.getAstrologerByEmail.mockImplementation(async (email: string) => (email === 'studio@co.test' ? demo({ id: 'studio-id', email }) : undefined));
    await seed();
    expect(mocks.astro.updateAstrologer).toHaveBeenCalledWith('studio-id', expect.objectContaining({ isVerified: false }));
  });

  it('production with a private password still locks a leftover default-password demo account first', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PRO_ASTROLOGER_EMAIL', 'studio@co.test');
    vi.stubEnv('PRO_ASTROLOGER_PASSWORD', 'A-Private#Pass-2026');
    mocks.astro.getAstrologerByEmail.mockImplementation(async (email: string) => (email === 'pro@navagraha.app' ? demo() : undefined));
    mocks.astro.createAstrologerWithPassword.mockResolvedValue({ id: 'studio-new' });
    await seed();
    expect(mocks.astro.updateAstrologer).toHaveBeenCalledWith('demo-id', expect.objectContaining({ isVerified: false }));
    expect(mocks.astro.createAstrologerWithPassword).toHaveBeenCalledWith(expect.objectContaining({ email: 'studio@co.test', password: 'A-Private#Pass-2026' }));
  });

  it('production: a demo account whose password was already changed is left alone', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PRO_ASTROLOGER_PASSWORD', '');
    mocks.astro.getAstrologerByEmail.mockResolvedValue(demo({ passwordHash: sha256('a-private-password') }));
    await seed();
    expect(mocks.astro.updateAstrologer).not.toHaveBeenCalled();
    expect(mocks.pool.query).not.toHaveBeenCalled();
  });

  it('production with a private PRO_ASTROLOGER_PASSWORD seeds the Pro account under it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PRO_ASTROLOGER_PASSWORD', 'A-Private#Pass-2026');
    mocks.astro.getAstrologerByEmail.mockResolvedValue(undefined);
    mocks.astro.createAstrologerWithPassword.mockResolvedValue({ id: 'new-pro' });
    await seed();
    expect(mocks.astro.createAstrologerWithPassword).toHaveBeenCalledWith(expect.objectContaining({ password: 'A-Private#Pass-2026' }));
  });

  it('development keeps the documented demo account', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PRO_ASTROLOGER_PASSWORD', '');
    mocks.astro.getAstrologerByEmail.mockResolvedValue(undefined);
    mocks.astro.createAstrologerWithPassword.mockResolvedValue({ id: 'dev-pro' });
    await seed();
    expect(mocks.astro.createAstrologerWithPassword).toHaveBeenCalledWith(expect.objectContaining({ email: 'pro@navagraha.app', password: 'ProDemo@2026' }));
  });
});
