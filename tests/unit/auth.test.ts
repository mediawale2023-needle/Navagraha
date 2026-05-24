import { describe, expect, it } from 'vitest';
import { getSessionIdentity } from '../../server/auth';

describe('getSessionIdentity', () => {
  it('returns explicit email/password user sessions', () => {
    const identity = getSessionIdentity({
      session: { userId: 'user_123' },
    } as any);

    expect(identity).toEqual({ userId: 'user_123', astrologerId: undefined });
  });

  it('returns passport-backed user sessions', () => {
    const identity = getSessionIdentity({
      session: { passport: { user: 'google_user_456' } },
    } as any);

    expect(identity).toEqual({ userId: 'google_user_456', astrologerId: undefined });
  });

  it('returns astrologer sessions when present', () => {
    const identity = getSessionIdentity({
      session: { astrologerId: 'astro_789' },
    } as any);

    expect(identity).toEqual({ userId: undefined, astrologerId: 'astro_789' });
  });
});
