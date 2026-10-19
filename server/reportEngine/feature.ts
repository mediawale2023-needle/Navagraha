import { isAdminAccount } from '../adminAccess';
import { features } from '../features';

type Account = { email?: string | null; emailVerifiedAt?: Date | string | null };

/** Comma-separated canonical lower-case verified accounts. Empty by default. */
export function universalReportAllowlist(): Set<string> {
  return new Set((process.env.UNIVERSAL_REPORT_ENGINE_ALLOWLIST || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
}

/**
 * Products released to the universal engine. Complete Life stays registered but is not released: its 46 sections do not
 * fit the $0.25 ceiling, so it keeps the legacy generator for every account, flag or not.
 */
export const UNIVERSAL_RELEASED_CATEGORIES: readonly string[] = ['career', 'marriage', 'finance', 'year_ahead', 'life'];
export const isUniversalReleased = (category: string | null | undefined) => !!category && UNIVERSAL_RELEASED_CATEGORIES.includes(category);

export function useUniversalReportEngine(account: Account | null | undefined, category: string | null | undefined): boolean {
  if (!isUniversalReleased(category)) return false;
  if (!features.universalReportEngine()) return false;
  if (isAdminAccount(account)) return true;
  const email = account?.email?.trim();
  return !!email && email === email.toLowerCase() && !!account?.emailVerifiedAt && universalReportAllowlist().has(email);
}
