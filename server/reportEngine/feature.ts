import { isAdminAccount } from '../adminAccess';
import { features } from '../features';

type Account = { email?: string | null; emailVerifiedAt?: Date | string | null };

/** Comma-separated canonical lower-case verified accounts. Empty by default. */
export function universalReportAllowlist(): Set<string> {
  return new Set((process.env.UNIVERSAL_REPORT_ENGINE_ALLOWLIST || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
}

export function useUniversalReportEngine(account: Account | null | undefined): boolean {
  if (!features.universalReportEngine()) return false;
  if (isAdminAccount(account)) return true;
  const email = account?.email?.trim();
  return !!email && email === email.toLowerCase() && !!account?.emailVerifiedAt && universalReportAllowlist().has(email);
}
