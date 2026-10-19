/**
 * Which paid reports an approximate birth time can honestly support. A report whose advertised
 * purpose rests on the houses, house lords, divisional charts or dasha dates cannot be delivered
 * without the exact time, so it is refused before any charge. The Life Reading stands on planet
 * signs, the Moon and natural significations, and is prepared in an approximate-time mode.
 */
import type { Kundli } from '@shared/schema';
import { isCurrentCanonicalChart } from '@shared/v3/canonical';
import { domainResolution } from './astroEngine/evidence/insights.js';
import { universalReportConfig } from './reportEngine/registry.js';

const CHARGE_NOTE = "Add the exact birth time to the chart to order it. You have not been charged.";

const NEEDS_EXACT_TIME: Record<string, string> = {
  career: `The Career report reads the 10th house, its lord, the D10 chart and the dasha periods that time career growth. All of these change with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  marriage: `The Marriage report reads the 7th house, its lord, the Navamsa (D9) and the dasha periods that time marriage. All of these change with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  finance: `The Wealth report reads the 2nd and 11th houses, their lords and the dasha periods that mark investment windows. All of these change with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  year_ahead: `The Year Ahead report predicts month by month from the running dasha periods, whose dates move with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  life_complete: "The Complete Life Report reads every house, so it needs an exact birth time. You have not been charged.",
};

/** Why a report cannot be prepared from an approximate birth time, or null when it can. */
export function exactTimeRequiredReason(category: string | null | undefined): string | null {
  return NEEDS_EXACT_TIME[category ?? "life"] ?? null;
}

export type ReportEvidenceEligibility = Readonly<{
  eligible: boolean;
  code: 'eligible' | 'insufficient_marriage_evidence';
  message: string;
  /** Required sections that would have to lead with an insufficient-evidence limitation. */
  inconclusiveSections: number;
  requiredSections: number;
}>;

const ELIGIBLE_MESSAGE = 'This chart contains enough reliable evidence to prepare this report.';
const INSUFFICIENT_MARRIAGE_MESSAGE =
  'This chart has too little reliable relationship evidence for a meaningful Marriage Report. This is not a difficult or negative relationship result; it means most of the report would be inconclusive. No payment will be taken.';

/**
 * Deterministic, pre-purchase evidence check. It deliberately uses the evidence engine's resolved
 * verdict rather than treating negative factors as missing evidence: Challenging and Very
 * Challenging charts remain eligible. The same function is called by preflight and checkout.
 */
export function reportEvidenceEligibility(
  category: string | null | undefined,
  kundli: Partial<Kundli>,
  asOf = new Date(),
): ReportEvidenceEligibility {
  if (category !== 'marriage') {
    return { eligible: true, code: 'eligible', message: ELIGIBLE_MESSAGE, inconclusiveSections: 0, requiredSections: 0 };
  }

  const chart = (kundli as any).chartData?.canonical;
  if (!isCurrentCanonicalChart(chart)) {
    // Chart-version errors are handled before this check on both routes. Keeping this non-refusing
    // prevents a malformed chart from being mislabeled as an evidence-sufficiency decision.
    return { eligible: true, code: 'eligible', message: ELIGIBLE_MESSAGE, inconclusiveSections: 0, requiredSections: 0 };
  }

  const config = universalReportConfig('marriage');
  const relationship = domainResolution(chart, 'relationships', asOf);
  const inconclusiveSections = relationship.verdict === 'Insufficient evidence'
    ? config.reportSections.filter((section) => section.domains.includes('relationships')).length
    : 0;
  const requiredSections = config.requiredSections.length;
  const predominantlyInconclusive = inconclusiveSections > requiredSections / 2;

  return predominantlyInconclusive
    ? { eligible: false, code: 'insufficient_marriage_evidence', message: INSUFFICIENT_MARRIAGE_MESSAGE, inconclusiveSections, requiredSections }
    : { eligible: true, code: 'eligible', message: ELIGIBLE_MESSAGE, inconclusiveSections, requiredSections };
}
