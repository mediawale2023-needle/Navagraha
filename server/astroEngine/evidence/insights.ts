/**
 * KundliInsights: CanonicalChart → evidence → resolution → timeline.
 * Deterministic and cheap (pure functions over the canonical chart), so it is
 * computed on read with an explicit `asOf` rather than cached — the natal
 * part never changes and the timing part must reflect today.
 */
import type { CanonicalChart } from '@shared/v3/canonical';
import { EVIDENCE_ENGINE_VERSION, LIFE_DOMAINS, type KundliInsights, type LifeDomain } from '@shared/v3/evidence';
import { dashaEvidence, dashaTimingStable, indexChart, natalEvidence, runningPeriod } from './engine.js';
import { resolveDomain } from './resolution.js';
import { buildTimeline } from './timeline.js';

export const INTERPRETIVE_NOTE =
  'Jyotish is a traditional interpretive system, not a scientific prediction. These readings describe tendencies and timing as the tradition reads them; they are not guarantees.';

export function domainResolution(chart: CanonicalChart, domain: LifeDomain, asOf = new Date()) {
  const ix = indexChart(chart);
  const evidence = [...natalEvidence(chart, domain, ix), ...dashaEvidence(chart, domain, asOf, ix)];
  return resolveDomain(domain, evidence, { approximate: ix.approximate });
}

export function buildInsights(chart: CanonicalChart, asOf = new Date()): KundliInsights {
  const ix = indexChart(chart);
  const approximate = ix.approximate;
  const domains = LIFE_DOMAINS.map((d) => resolveDomain(d, [...natalEvidence(chart, d, ix), ...dashaEvidence(chart, d, asOf, ix)], { approximate }));
  const rp = runningPeriod(chart, asOf);
  const planet = (n: string) => chart.planets.find((p) => p.name === n)!;
  const stable = dashaTimingStable(chart, asOf);
  const timingNote = !stable.mahadasha
    ? 'The birth time is approximate, so the dasha dates could be shifted: the current Mahadasha and Antardasha are uncertain and are not used in the verdicts.'
    : !stable.antardasha
      ? 'The birth time is approximate, so Antardasha dates could be shifted: the current Antardasha is uncertain and is not used in the verdicts.'
      : null;
  return {
    engineVersion: EVIDENCE_ENGINE_VERSION,
    asOf: asOf.toISOString(),
    headline: {
      lagna: approximate ? null : chart.ascendant.sign,
      moonSign: planet('Moon').sign,
      sunSign: planet('Sun').sign,
      calculation: `${chart.meta.ephemeris.replace(/ \(.*\)$/, '')} · ${chart.meta.ayanamsa} ayanamsa`,
      timeAccuracy: chart.birth.timeAccuracy,
    },
    domains,
    timeline: buildTimeline(chart, asOf, ix),
    currentPeriod: rp ? { mahadasha: rp.mahadasha, antardasha: rp.antardasha, start: rp.antarStart ?? rp.mahaStart, end: rp.antarEnd ?? rp.mahaEnd } : null,
    timing: { mahadashaReliable: stable.mahadasha, antardashaReliable: stable.antardasha, note: timingNote },
    notes: [...chart.uncertainty.notes, ...(timingNote ? [timingNote] : []), INTERPRETIVE_NOTE],
  };
}
