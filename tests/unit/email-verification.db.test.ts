// Release B: email verification tokens against a real Postgres — single use, expiry, resend
// limits, concurrent use of one link, and the free Ask allowance that verification unlocks.
// Runs only when TEST_DATABASE_URL points at a disposable database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('email verification (Postgres)', () => {
  let storage: typeof import('../../server/storage')['storage'];
  let pool: typeof import('../../server/db')['pool'];
  const limits = { ttlS: 86400, minIntervalS: 60, perDay: 5 };
  const hash = () => crypto.randomBytes(32).toString('hex');

  const newUser = async (email?: string) => {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, email ?? `${id}@verify.test`]);
    return { id, email: email ?? `${id}@verify.test` };
  };
  const verifiedAt = async (id: string) => (await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [id])).rows[0].email_verified_at;
  const issue = (u: { id: string; email: string }, h = hash()) => storage.issueEmailVerificationToken(u.id, u.email, h, limits).then((r) => ({ r, h }));
  const age = (userId: string, seconds: number) => pool.query(`UPDATE email_verification_tokens SET created_at = created_at - make_interval(secs => $2) WHERE user_id = $1`, [userId, seconds]);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ storage } = await import('../../server/storage'));
    ({ pool } = await import('../../server/db'));
    await (await import('../../server/migrate')).runMigrations();
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('a link verifies once; using it again reports already verified', async () => {
    const u = await newUser();
    const { r, h } = await issue(u);
    expect(r).toEqual({ issued: true });
    expect(await storage.consumeEmailVerificationToken(h)).toBe('verified');
    expect(await verifiedAt(u.id)).not.toBeNull();
    expect(await storage.consumeEmailVerificationToken(h)).toBe('already');
  });

  it('only the hash is stored', async () => {
    const u = await newUser();
    const { h } = await issue(u);
    const { rows } = await pool.query('SELECT token_hash FROM email_verification_tokens WHERE user_id = $1', [u.id]);
    expect(rows).toEqual([{ token_hash: h }]);
  });

  it('an expired link verifies nothing', async () => {
    const u = await newUser();
    const { h } = await issue(u);
    await pool.query("UPDATE email_verification_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [h]);
    expect(await storage.consumeEmailVerificationToken(h)).toBe('expired');
    expect(await verifiedAt(u.id)).toBeNull();
  });

  it('an unknown link is invalid', async () => {
    expect(await storage.consumeEmailVerificationToken(hash())).toBe('invalid');
  });

  it('a new link ends the previous one', async () => {
    const u = await newUser();
    const first = await issue(u);
    await age(u.id, 120);
    const second = await issue(u);
    expect(second.r).toEqual({ issued: true });
    expect(await storage.consumeEmailVerificationToken(first.h)).toBe('expired');
    expect(await storage.consumeEmailVerificationToken(second.h)).toBe('verified');
  });

  it('at most one link a minute and five a day', async () => {
    const u = await newUser();
    await issue(u);
    const soon = await issue(u);
    expect(soon.r).toMatchObject({ throttled: true });
    expect((soon.r as any).retryAfterS).toBeGreaterThan(0);
    expect((soon.r as any).retryAfterS).toBeLessThanOrEqual(60);
    for (let i = 0; i < 4; i++) { await age(u.id, 120); expect((await issue(u)).r).toEqual({ issued: true }); }
    await age(u.id, 120);
    const sixth = await issue(u);
    expect(sixth.r).toMatchObject({ throttled: true });
    expect((sixth.r as any).retryAfterS).toBeGreaterThan(3600);
  });

  it('concurrent resends issue exactly one link', async () => {
    const u = await newUser();
    const results = await Promise.all(Array.from({ length: 8 }, () => issue(u)));
    expect(results.filter((x) => 'issued' in x.r)).toHaveLength(1);
  });

  it('ten concurrent uses of one link: one verifies, the rest report already', async () => {
    const u = await newUser();
    const { h } = await issue(u);
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => storage.consumeEmailVerificationToken(h)));
    expect(outcomes.filter((o) => o === 'verified')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'already')).toHaveLength(9);
  });

  it('a link for an address the account no longer has verifies nothing', async () => {
    const u = await newUser();
    const { h } = await issue(u);
    await pool.query('UPDATE users SET email = $2 WHERE id = $1', [u.id, `changed-${u.email}`]);
    expect(await storage.consumeEmailVerificationToken(h)).toBe('invalid');
    expect(await verifiedAt(u.id)).toBeNull();
  });

  it('a case-variant duplicate of a verified account is not verified a second time', async () => {
    const base = `${crypto.randomUUID()}@verify.test`;
    const first = await newUser(base);
    await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [first.id]);
    const variant = await newUser(base.toUpperCase());
    // Links are issued for the normalised address, so the variant's link names the verified one.
    const token = hash();
    await storage.issueEmailVerificationToken(variant.id, base, token, limits);
    expect(await storage.consumeEmailVerificationToken(token)).toBe('conflict');
    expect(await verifiedAt(variant.id)).toBeNull();
  });

  it('verification unlocks the three free questions', async () => {
    const { askFreeQuestionsFor } = await import('../../server/askMetering');
    const u = await newUser();
    const { h } = await issue(u);
    const before = (await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [u.id])).rows[0];
    expect(askFreeQuestionsFor({ emailVerifiedAt: before.email_verified_at })).toBe(0);
    await storage.consumeEmailVerificationToken(h);
    const user = await storage.getUser(u.id);
    expect(askFreeQuestionsFor(user)).toBe(3);
    const r = await storage.reserveAskUsage({
      userId: u.id, chartKey: 'kundli:a', sessionId: crypto.randomUUID(), idempotencyKey: `k_${crypto.randomUUID()}`,
      freeQuestions: askFreeQuestionsFor(user), freeFollowUps: 1, enforce: true, unlimited: false,
    });
    expect(r).toMatchObject({ kind: 'reserved', usage: { entitlement: 'free', followUpsAllowed: 1 } });
  });
});
