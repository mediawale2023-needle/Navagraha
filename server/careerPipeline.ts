/**
 * Which Career Report pipeline an order runs. The facts-first pipeline (careerReportGeneration.ts) is under
 * controlled testing: it runs only when FEATURE_CAREER_FACTS_FIRST is on AND the account placing the order is an
 * admin account (isAdminAccount: ADMIN_EMAILS / ADMIN_EMAIL, canonical lower-case address). Admin accounts already
 * order reports at ₹0 (storage.hasFreeAccess, FREE_ACCESS_REPORTS_PER_DAY), so testing takes no real payment.
 * Everyone else gets the three-part Career Report. The decision is made by the order route from the signed-in
 * account; nothing in the request can choose it.
 */
import { isAdminAccount } from './adminAccess';
import { features } from './features';

export type CareerPipeline = 'facts-first' | 'three-part';

export function careerPipelineFor(category: string | null | undefined, account: { email?: string | null } | null | undefined): CareerPipeline {
  return category === 'career' && features.careerFactsFirst() && isAdminAccount(account) ? 'facts-first' : 'three-part';
}
