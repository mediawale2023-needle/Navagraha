/**
 * Which Career Report pipeline an order runs. The facts-first pipeline (careerReportGeneration.ts) is under
 * controlled testing: it runs only when FEATURE_CAREER_FACTS_FIRST is on AND the account placing the order is either
 * an admin account (isAdminAccount: ADMIN_EMAILS / ADMIN_EMAIL, canonical lower-case address; admins order at ₹0 via
 * storage.hasFreeAccess) or an allow-listed customer test account (CAREER_FACTS_FIRST_ALLOWLIST; charged and refunded
 * exactly like every other customer). Everyone else gets the three-part Career Report, which stays the rollback:
 * unset the flag (or empty the list) and every order is three-part again. The decision is made by the order route from
 * the signed-in account; nothing in the request can choose it.
 */
import { isAdminAccount } from './adminAccess';
import { features } from './features';

export type CareerPipeline = 'facts-first' | 'three-part';

type Account = { email?: string | null; emailVerifiedAt?: Date | string | null };

/** CAREER_FACTS_FIRST_ALLOWLIST: comma-separated email addresses, compared in lower case. Empty by default. */
export function careerFactsFirstAllowlist(): Set<string> {
  return new Set((process.env.CAREER_FACTS_FIRST_ALLOWLIST || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/**
 * An allow-listed customer test account: its stored address is the canonical lower-case one on the list (a case
 * variant is a different, possibly attacker-registered account, as for admins) and the account has proved it owns
 * that mailbox (emailVerifiedAt), so the address cannot be claimed by registering it.
 */
export function isCareerFactsFirstTester(account: Account | null | undefined): boolean {
  const stored = account?.email?.trim();
  if (!stored || stored !== stored.toLowerCase() || !account?.emailVerifiedAt) return false;
  return careerFactsFirstAllowlist().has(stored);
}

export function careerPipelineFor(category: string | null | undefined, account: Account | null | undefined): CareerPipeline {
  if (category !== 'career' || !features.careerFactsFirst()) return 'three-part';
  return isAdminAccount(account) || isCareerFactsFirstTester(account) ? 'facts-first' : 'three-part';
}
