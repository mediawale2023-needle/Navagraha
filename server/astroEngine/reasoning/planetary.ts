/**
 * Shadow-mode reasoning (internal only): planetary, period and yoga findings, the contradiction
 * classification and the relationships between them, for one chart at one instant. No route, prompt,
 * verdict or display reads it, and it logs nothing; it exists so a later reconciliation step can be
 * measured before it is used.
 */
import type { CanonicalChart } from '@shared/v3/canonical';
import { classifyContradictions, type Contradiction, type ContradictionStats } from './contradictions.js';
import { reasoningInput, type ReasoningInput } from './index.js';
import { buildPeriodFindings, type PeriodFinding } from './periodFindings.js';
import { buildPlanetFindings, type PlanetFinding } from './planetFindings.js';
import { buildRelationships, type Relationship, type RelationshipStats } from './relationships.js';
import { buildYogaFindings, type YogaFinding } from './yogaFindings.js';

export interface PlanetaryReasoning {
  readonly asOf: string;
  readonly approximate: boolean;
  readonly findings: readonly PlanetFinding[];
  readonly periods: readonly PeriodFinding[];
  readonly yogas: readonly YogaFinding[];
  readonly contradictions: readonly Contradiction[];
  readonly relationships: readonly Relationship[];
  readonly relationshipStats: Readonly<RelationshipStats>;
  readonly stats: Readonly<ContradictionStats>;
  readonly unresolved: ReasoningInput['unresolved'];
}

/** `chart` must be the chart `r` was built from; it is read only for the yogas the FactIndex holds as reliable. */
export function planetaryReasoningFrom(r: ReasoningInput, chart: CanonicalChart): PlanetaryReasoning {
  const findings = buildPlanetFindings(r);
  const periods = buildPeriodFindings(r, findings);
  const yogas = buildYogaFindings(r, chart, periods);
  const { contradictions, stats } = classifyContradictions(r, findings);
  const { relationships, stats: relationshipStats } = buildRelationships(r, findings, periods, yogas, contradictions);
  return Object.freeze({
    asOf: r.facts.asOf, approximate: r.facts.approximate,
    findings: Object.freeze(findings), periods: Object.freeze(periods), yogas: Object.freeze(yogas),
    contradictions: Object.freeze(contradictions), relationships: Object.freeze(relationships), relationshipStats: Object.freeze(relationshipStats), stats: Object.freeze(stats),
    unresolved: r.unresolved,
  });
}

export function planetaryReasoning(chart: CanonicalChart, asOf: Date): PlanetaryReasoning {
  return planetaryReasoningFrom(reasoningInput(chart, asOf), chart);
}
