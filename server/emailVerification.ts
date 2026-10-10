/**
 * Email verification for email/password accounts (Google sign-in verifies the address itself).
 * A link carries a random 256-bit token; only its SHA-256 is stored. Links are single use,
 * expire after a day, and an account can ask for a new one at most once a minute and five
 * times a day. Behind FEATURE_EMAIL_VERIFICATION, and only when email can actually be sent.
 */
import crypto from "crypto";
import { features } from "./features";
import { emailConfigured, sendVerificationEmail } from "./emailService";
import { normalizeEmail } from "./adminAccess";
import { storage, type EmailVerificationLimits } from "./storage";

export const EMAIL_VERIFICATION_LIMITS: EmailVerificationLimits = { ttlS: 24 * 60 * 60, minIntervalS: 60, perDay: 5 };

export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newVerificationToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashVerificationToken(token) };
}

/** 32 random bytes in base64url; anything else is refused before a database lookup. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function verificationAvailable(): boolean {
  return features.emailVerification() && emailConfigured();
}

export type SendVerificationResult = { sent: true } | { throttled: true; retryAfterS: number } | { unavailable: true };

/** Issues a new link for the account's current address and emails it. */
export async function sendVerification(user: { id: string; email?: string | null; firstName?: string | null }): Promise<SendVerificationResult> {
  if (!verificationAvailable() || !user.email) return { unavailable: true };
  const email = normalizeEmail(user.email);
  const { token, hash } = newVerificationToken();
  const issued = await storage.issueEmailVerificationToken(user.id, email, hash, EMAIL_VERIFICATION_LIMITS);
  if (!("issued" in issued)) return { throttled: true, retryAfterS: issued.retryAfterS };
  return (await sendVerificationEmail(email, user.firstName ?? "", token)) ? { sent: true } : { unavailable: true };
}
