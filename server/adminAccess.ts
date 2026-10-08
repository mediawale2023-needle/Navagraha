// Single source of truth for which accounts are admins. Kept dependency-free
// so both auth.ts (authorization) and storage.ts (free-access billing bypass)
// can import it without a circular dependency.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminEmails(): Set<string> {
  const set = new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
  );
  // ADMIN_EMAIL (singular) is the bootstrap admin account seeded on boot.
  const single = process.env.ADMIN_EMAIL ? normalizeEmail(process.env.ADMIN_EMAIL) : '';
  if (single) set.add(single);
  return set;
}

/** Whether an address is on the admin list, in any letter case. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(normalizeEmail(email));
}

/**
 * Whether a stored account carries admin rights. Only an account stored under the
 * canonical lower-case address qualifies: email lookups were once case-sensitive, so
 * a case variant of an admin address (e.g. "ADMIN@…") may exist as a separate,
 * attacker-registered account and must never inherit the privilege.
 */
export function isAdminAccount(user: { email?: string | null } | null | undefined): boolean {
  const stored = user?.email?.trim();
  if (!stored || stored !== stored.toLowerCase()) return false;
  return getAdminEmails().has(stored);
}

/**
 * The email to store for a Google sign-in, or null to refuse it. Google must affirm the
 * address is verified: an unverified or unconfirmed address proves nothing about who
 * owns it. A returning user keeps the address already stored, so normalising it cannot
 * collide with another account's address.
 */
export function googleSignInEmail(
  profile: { emails?: Array<{ value?: string; verified?: boolean | string }>; _json?: { email_verified?: unknown } },
  storedEmail: string | null | undefined,
): { email: string | undefined } | null {
  const raw = profile.emails?.[0]?.value;
  if (!raw) return { email: storedEmail ?? undefined };
  const verified = profile._json?.email_verified === true || profile.emails?.[0]?.verified === true;
  if (!verified) return null;
  return { email: storedEmail ?? normalizeEmail(raw) };
}
