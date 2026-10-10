/**
 * Response shapes for user and astrologer rows. A route never sends a raw row: password
 * hashes never leave the server, and full bank account numbers are not shown even to admins.
 */
import type { Astrologer, User } from "@shared/schema";

/** The signed-in user's own account. */
export function selfUser<T extends Partial<User>>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

/** An astrologer's own account (their dashboard prefills the payout details they entered). */
export function selfAstrologer<T extends Partial<Astrologer>>(astrologer: T): Omit<T, "passwordHash"> {
  const { passwordHash: _ph, ...safe } = astrologer;
  return safe;
}

/** An astrologer as admins see it: KYC fields stay, the account number shrinks to its last 4 digits. */
export function adminAstrologer<T extends Partial<Astrologer>>(astrologer: T) {
  const { passwordHash: _ph, bankAccountNumber, ...safe } = astrologer;
  return { ...safe, bankAccountLast4: bankAccountNumber ? String(bankAccountNumber).slice(-4) : null };
}

/** Fields an admin may change on an astrologer; anything else in the body is ignored. */
export const ADMIN_ASTROLOGER_EDITABLE = [
  "isVerified", "name", "about", "specializations", "languages", "certifications", "experience", "pricePerMinute", "profileImageUrl",
] as const;

export function adminAstrologerUpdate(body: unknown): Partial<Astrologer> {
  const src = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ADMIN_ASTROLOGER_EDITABLE) if (src[key] !== undefined) out[key] = src[key];
  return out as Partial<Astrologer>;
}
