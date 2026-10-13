/**
 * Dependency metadata for evidence items, kept beside the items rather than on them: the items
 * the engine returns (and every API response, prompt and verdict built from them) stay exactly
 * as they were. Only the reasoning layer reads this.
 */
import type { EvidenceItem } from '@shared/v3/evidence';
import type { DependencyType, EvidenceRole, FactId } from './facts.js';

export interface EvidenceMetadata {
  ruleId: string;
  /** The facts the rule read for this item, in the order it read them (no duplicates). */
  factIds: FactId[];
  /** How the item depends on each fact; one fact can play two parts (a period lord's house is both its link and its condition). */
  dependencyTypes: Record<FactId, DependencyType[]>;
  role: EvidenceRole;
}

export type Dependency = [FactId, DependencyType];

type Inputs = { ruleId: string; role: EvidenceRole; deps: Dependency[] };
// The rule site hands over a thunk; it is only evaluated (once) when the reasoning layer reads it,
// so building insights for the app costs nothing extra.
const META = new WeakMap<EvidenceItem, EvidenceMetadata | (() => Inputs)>();

export function attachEvidenceMetadata(item: EvidenceItem, inputs: () => Inputs): void {
  META.set(item, inputs);
}

function build({ ruleId, role, deps }: Inputs): EvidenceMetadata {
  const factIds: FactId[] = [];
  const dependencyTypes = {} as Record<FactId, DependencyType[]>;
  for (const [id, type] of deps) {
    if (!dependencyTypes[id]) { dependencyTypes[id] = []; factIds.push(id); }
    if (!dependencyTypes[id].includes(type)) dependencyTypes[id].push(type);
  }
  return { ruleId, factIds, dependencyTypes, role };
}

/** The metadata for an item the evidence engine produced, or undefined for any other object. */
export function evidenceMetadata(item: EvidenceItem): EvidenceMetadata | undefined {
  const m = META.get(item);
  if (typeof m !== 'function') return m;
  const built = build(m());
  META.set(item, built);
  return built;
}
