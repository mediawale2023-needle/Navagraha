/**
 * Shadow-mode planetary reasoning (internal only): the planetary findings and the contradiction
 * classification for one chart at one instant. No route, prompt, verdict or display reads it, and
 * it logs nothing; it exists so a later reconciliation step can be measured before it is used.
 */
import type { CanonicalChart } from '@shared/v3/canonical';
import { classifyContradictions, type Contradiction, type ContradictionStats } from './contradictions.js';
import { reasoningInput, type ReasoningInput } from './index.js';
import { buildPlanetFindings, type PlanetFinding } from './planetFindings.js';

export interface PlanetaryReasoning {
  readonly asOf: string;
  readonly approximate: boolean;
  readonly findings: readonly PlanetFinding[];
  readonly contradictions: readonly Contradiction[];
  readonly stats: Readonly<ContradictionStats>;
  readonly unresolved: ReasoningInput['unresolved'];
}

export function planetaryReasoningFrom(r: ReasoningInput): PlanetaryReasoning {
  const findings = buildPlanetFindings(r);
  const { contradictions, stats } = classifyContradictions(r, findings);
  return Object.freeze({
    asOf: r.facts.asOf, approximate: r.facts.approximate,
    findings: Object.freeze(findings), contradictions: Object.freeze(contradictions), stats: Object.freeze(stats),
    unresolved: r.unresolved,
  });
}

export function planetaryReasoning(chart: CanonicalChart, asOf: Date): PlanetaryReasoning {
  return planetaryReasoningFrom(reasoningInput(chart, asOf));
}
