// Single source of truth for which accounts are admins. Kept dependency-free
// so both auth.ts (authorization) and storage.ts (free-access billing bypass)
// can import it without a circular dependency.

export function getAdminEmails(): Set<string> {
  const set = new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  // ADMIN_EMAIL (singular) is the bootstrap admin account seeded on boot.
  const single = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (single) set.add(single);
  return set;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.trim().toLowerCase());
}
