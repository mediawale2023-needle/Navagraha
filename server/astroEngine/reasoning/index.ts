/**
 * Shadow-mode foundation for the Shared Astrology Reasoning Engine (internal only).
 *
 * Gives a future reconciliation layer one read-only view of a chart: its canonical facts, every
 * evidence item with the rule and facts behind it, the rule registry and the fact → evidence
 * dependency map. It computes no verdicts and changes nothing the app shows; no route calls it,
 * and it logs nothing.
 */
import type { CanonicalChart } from '@shared/v3/canonical';
import { LIFE_DOMAINS, type EvidenceItem } from '@shared/v3/evidence';
import { dashaEvidence, indexChart, natalEvidence } from '../evidence/engine.js';
import { buildFactIndex, type FactIndex } from './factIndex.js';
import { evidenceMetadata, type EvidenceMetadata } from './evidenceMetadata.js';
import { RULES, ruleById, type RuleDefinition } from './rules.js';
import type { FactId } from './facts.js';

export interface AnnotatedEvidence { item: EvidenceItem; metadata: EvidenceMetadata }

export interface ReasoningInput {
  facts: FactIndex;
  rules: readonly RuleDefinition[];
  evidence: AnnotatedEvidence[];
  /** Which evidence items read each fact. */
  dependencies: ReadonlyMap<FactId, string[]>;
  /** Declared inputs that do not resolve: a fact missing from the index, an unknown rule, or a yoga with no known definition. */
  unresolved: Array<{ evidenceId: string; problem: 'unknown-fact' | 'unknown-rule' | 'no-metadata' | 'yoga-definition-unknown'; detail: string }>;
}

export function reasoningInput(chart: CanonicalChart, asOf: Date): ReasoningInput {
  const facts = buildFactIndex(chart, asOf);
  const ix = indexChart(chart);
  const items = LIFE_DOMAINS.flatMap((d) => [...natalEvidence(chart, d, ix), ...dashaEvidence(chart, d, asOf, ix)]);
  const evidence: AnnotatedEvidence[] = [];
  const dependencies = new Map<FactId, string[]>();
  const unresolved: ReasoningInput['unresolved'] = [];
  for (const item of items) {
    const metadata = evidenceMetadata(item);
    if (!metadata) { unresolved.push({ evidenceId: item.id, problem: 'no-metadata', detail: item.factor }); continue; }
    evidence.push({ item, metadata });
    if (!ruleById(metadata.ruleId)) unresolved.push({ evidenceId: item.id, problem: 'unknown-rule', detail: metadata.ruleId });
    if (metadata.role === 'yoga' && !metadata.factIds.some((f) => metadata.dependencyTypes[f].includes('derived'))) {
      unresolved.push({ evidenceId: item.id, problem: 'yoga-definition-unknown', detail: item.factor });
    }
    for (const f of metadata.factIds) {
      if (!facts.get(f)) unresolved.push({ evidenceId: item.id, problem: 'unknown-fact', detail: f });
      const list = dependencies.get(f) ?? [];
      list.push(item.id);
      dependencies.set(f, list);
    }
  }
  return { facts, rules: RULES, evidence, dependencies, unresolved };
}
