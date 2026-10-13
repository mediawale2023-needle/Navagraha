/**
 * Shadow-mode planetary reasoning (internal only): the planetary findings and the contradiction
 * classification for one chart at one instant. No route, prompt, verdict or display reads it, and
 * it logs nothing; it exists so a later reconciliation step can be measured before it is used.
 */
import type { CanonicalChart } from '@shared/v3/canonical';
import { classifyContradictions, type Contradiction, type ContradictionStats } from './contradictions.js';
import { reasoningInput, type ReasoningInput } from './index.js';
import { admissible, buildPlanetFindings, type PlanetFinding } from './planetFindings.js';
import { LIFE_DOMAINS, type LifeDomain } from '@shared/v3/evidence';

export interface PlanetaryReasoning {
  readonly asOf: string;
  readonly approximate: boolean;
  readonly findings: readonly PlanetFinding[];
  readonly contradictions: readonly Contradiction[];
  readonly stats: Readonly<ContradictionStats>;
  /** Items left out of findings and contradictions per area (not usable, or a fact they read is unreliable); a count only. */
  readonly notAdmissibleByDomain: Readonly<Record<LifeDomain, number>>;
  /** Usable items that read an unreliable fact: metadata the reasoning layer cannot honour (expected to be none). */
  readonly usableWithUnreliableFact: readonly string[];
  readonly unresolved: ReasoningInput['unresolved'];
}

export function planetaryReasoningFrom(r: ReasoningInput): PlanetaryReasoning {
  const findings = buildPlanetFindings(r);
  const { contradictions, stats } = classifyContradictions(r, findings);
  const notAdmissibleByDomain = Object.fromEntries(LIFE_DOMAINS.map((d) => [d, r.evidence.filter((a) => a.item.domain === d && !admissible(r.facts, a)).length])) as Record<LifeDomain, number>;
  const usableWithUnreliableFact = r.evidence.filter((a) => a.item.usable && !admissible(r.facts, a)).map((a) => a.item.id);
  return Object.freeze({
    asOf: r.facts.asOf, approximate: r.facts.approximate,
    findings: Object.freeze(findings), contradictions: Object.freeze(contradictions), stats: Object.freeze(stats),
    notAdmissibleByDomain: Object.freeze(notAdmissibleByDomain), usableWithUnreliableFact: Object.freeze(usableWithUnreliableFact),
    unresolved: r.unresolved,
  });
}

export function planetaryReasoning(chart: CanonicalChart, asOf: Date): PlanetaryReasoning {
  return planetaryReasoningFrom(reasoningInput(chart, asOf));
}
