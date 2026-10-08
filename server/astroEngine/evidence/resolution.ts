/**
 * Resolution Engine — deterministic aggregation of domain evidence into a
 * qualitative verdict and confidence. Contradictions are kept and shown, not
 * averaged away. No percentages: the weights only order evidence.
 *
 * Only CORE, usable items decide (experimental items are returned for display;
 * birth-time-dependent items are excluded outright when the time is approximate).
 *
 *   weight: strong 3, moderate 2, weak 1
 *   balance r = (support − conflict) / (support + conflict)
 *   independent sources = distinct sources among items of at least moderate strength
 *     (a weak or common indicator can add weight but never "confirm")
 *
 *   Insufficient evidence  fewer than 4 core items, or total weight < 6
 *   Exceptional            r ≥ 0.75, support ≥ 18, ≥ 5 independent supporting sources
 *   Very Strong            r ≥ 0.55 and ≥ 3 independent supporting sources
 *   Strong                 r ≥ 0.25
 *   Mixed                  −0.25 < r < 0.25
 *   Challenging            r ≤ −0.25
 *   Very Challenging       r ≤ −0.55 and ≥ 3 independent conflicting sources (symmetric with Very Strong)
 *
 * Confidence: High needs ≥ 6 core items, ≥ 3 independent sources on the winning
 * side and the losing side ≤ 40% of it. Low when fewer than 5 core items, when
 * the balance is near zero, or when the birth time is approximate. Otherwise Medium.
 */
import {
  DOMAIN_LABELS, type Confidence, type DomainResolution, type EvidenceItem, type EvidenceSource, type LifeDomain, type Verdict,
} from '@shared/v3/evidence';

const WEIGHT = { strong: 3, moderate: 2, weak: 1 } as const;
const sum = (xs: EvidenceItem[]) => xs.reduce((s, e) => s + WEIGHT[e.strength], 0);
const sources = (xs: EvidenceItem[]) => Array.from(new Set(xs.map((e) => e.source))) as EvidenceSource[];
const byWeight = (a: EvidenceItem, b: EvidenceItem) => WEIGHT[b.strength] - WEIGHT[a.strength];

const independent = (xs: EvidenceItem[]) => sources(xs.filter((e) => e.strength !== 'weak'));

export function resolveDomain(domain: LifeDomain, evidence: EvidenceItem[], opts: { approximate: boolean }): DomainResolution {
  const usable = evidence.filter((e) => e.usable);
  const excluded = evidence.filter((e) => !e.usable);
  const core = usable.filter((e) => e.tier === 'core');
  const experimental = usable.filter((e) => e.tier !== 'core');
  const supporting = core.filter((e) => e.direction === 'positive').sort(byWeight);
  const conflicting = core.filter((e) => e.direction === 'negative').sort(byWeight);
  const neutral = core.filter((e) => e.direction === 'neutral');
  const pos = sum(supporting);
  const neg = sum(conflicting);
  const total = pos + neg;
  const r = total === 0 ? 0 : (pos - neg) / total;
  const confirmedBy = independent(supporting);
  const contradictedBy = independent(conflicting);
  const notes: string[] = [];

  let verdict: Verdict;
  if (core.length < 4 || total < 6) {
    verdict = 'Insufficient evidence';
    notes.push('Too few reliable indicators to judge this area.');
  } else if (r >= 0.75 && pos >= 18 && confirmedBy.length >= 5) verdict = 'Exceptional';
  else if (r >= 0.55 && confirmedBy.length >= 3) verdict = 'Very Strong';
  else if (r >= 0.25) verdict = 'Strong';
  else if (r <= -0.55 && contradictedBy.length >= 3) verdict = 'Very Challenging';
  else if (r <= -0.25) verdict = 'Challenging';
  else verdict = 'Mixed';

  const winning = r >= 0 ? confirmedBy : contradictedBy;
  const winW = Math.max(pos, neg);
  const loseW = Math.min(pos, neg);
  let confidence: Confidence;
  if (verdict === 'Insufficient evidence' || opts.approximate || core.length < 5 || Math.abs(r) < 0.25) confidence = 'Low';
  else if (core.length >= 6 && winning.length >= 3 && loseW <= 0.4 * winW) confidence = 'High';
  else confidence = 'Medium';

  if (opts.approximate && excluded.length) {
    notes.push(`${excluded.length} birth-time-dependent indicator${excluded.length === 1 ? ' was' : 's were'} not used because the birth time is approximate.`);
  }
  if (experimental.length) {
    notes.push(`${experimental.length} experimental indicator${experimental.length === 1 ? ' is' : 's are'} shown for context but not counted.`);
  }

  const label = DOMAIN_LABELS[domain];
  const lead = supporting[0];
  const counter = conflicting[0];
  const conclusion = verdict === 'Insufficient evidence'
    ? `${label}: there is not enough reliable evidence in this chart to give a reading${opts.approximate ? ' with an approximate birth time' : ''}.`
    : [
      `${label} reads as ${verdict.toLowerCase()}: ${supporting.length} supporting and ${conflicting.length} conflicting indicator${conflicting.length === 1 ? '' : 's'}.`,
      lead ? `The strongest support is ${lead.factor.toLowerCase()} (${lead.source}).` : '',
      counter ? `The main counter-indication is ${counter.factor.toLowerCase()} (${counter.source}).` : '',
    ].filter(Boolean).join(' ');

  return { domain, label, verdict, confidence, supporting, conflicting, neutral, excluded, experimental, confirmedBy, contradictedBy, conclusion, notes };
}
