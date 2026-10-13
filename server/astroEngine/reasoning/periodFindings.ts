/**
 * Period findings (shadow mode, internal only): one record per running Vimshottari level
 * (Mahadasha, Antardasha) that keeps apart
 * - the period lord's capacity: its natal condition, as the existing `dasha.running-lord` rule reads it
 *   (planetCondition: dignity, cancellation, combustion and, for an exact time, house);
 * - the lord's natural nature and functional role (from its PlanetFinding);
 * - its relationship to each life area (rules, occupies, signifies), from the FactIndex;
 * - the effect the existing rule records in each linked area, and the natal evidence about the lord there;
 * - the timing activation (the running-period fact).
 *
 * No new scoring: the capacity direction is the one the engine already gave the period's evidence. The
 * engine applies that one direction to every linked area; it has no area-specific period rule, and the
 * finding says so instead of inventing one. With an approximate time a period the birth date can move is
 * withheld (no lord), and lordships and houses are never inferred.
 */
import { LIFE_DOMAINS, type EvidenceDirection, type LifeDomain } from '@shared/v3/evidence';
import type { Graha } from '@shared/v3/canonical';
import { DOMAIN_SPECS } from '../evidence/engine.js';
import { fact, type FactId } from './facts.js';
import type { ReasoningInput } from './index.js';
import { admissible, evidenceRef, valueOf, type Classified, type EvidenceRef, type FunctionalClassification, type PlanetFinding } from './planetFindings.js';

export type PeriodLevel = 'mahadasha' | 'antardasha';

export type AreaLink = Readonly<{
  /** Houses of the area the lord rules; withheld when the lordships rest on a Lagna the birth time cannot fix. */
  rules: Readonly<{ status: 'known'; houses: readonly number[] } | { status: 'withheld' }>;
  /** The area's house the lord occupies, if any; withheld likewise. */
  occupies: Readonly<{ status: 'known'; house: number | null } | { status: 'withheld' }>;
  /** A natural significator (karaka) of the area (DOMAIN_SPECS): never depends on the birth time. */
  significator: boolean;
}>;

export type PeriodArea = Readonly<{
  link: AreaLink;
  /** The existing period evidence in this area (dasha.running-lord), when the rule produced a usable item. */
  periodEvidence: EvidenceRef | null;
  /** Natal evidence about the lord in this area (not the period's own item), by direction. */
  natal: Readonly<{ supporting: readonly string[]; challenging: readonly string[]; neutral: readonly string[]; experimental: readonly string[] }>;
}>;

export type PeriodFinding = Readonly<{
  id: string;
  level: PeriodLevel;
  timingFactId: FactId;
  status: 'known' | 'withheld' | 'not-running';
  lord?: Graha;
  /** The Antardasha lord is the Mahadasha lord: the engine gives that sub-period no separate evidence. */
  sameLordAsMahadasha?: boolean;
  /** What the lord can deliver, wherever it acts: the existing rule's reading of its natal condition. */
  capacity?: Readonly<{
    source: 'evidence/engine.ts planetCondition (read by dasha.running-lord)';
    /** The direction the existing rule gave the lord's period evidence; null when it produced no usable item for the lord (no linked area). */
    direction: EvidenceDirection | null;
    factIds: readonly FactId[];
  }>;
  natural?: PlanetFinding['interpretation']['natural'];
  functional?: Classified<FunctionalClassification>;
  /** What the period does in each area: the link, the rule's recorded effect there, and the natal evidence about the lord. */
  areas?: Readonly<Record<LifeDomain, PeriodArea>>;
  /** The engine applies the capacity direction to every linked area; it has no area-specific period rule. */
  effectBasis?: 'capacity-applied-to-each-linked-area';
}>;

const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(freeze); Object.freeze(v); }
  return v;
};

export function buildPeriodFindings(r: ReasoningInput, planets: readonly PlanetFinding[]): PeriodFinding[] {
  const { facts } = r;
  const asOf = new Date(facts.asOf);
  const mdLord = valueOf<Graha>(facts, fact.running('mahadasha', asOf));
  return (['mahadasha', 'antardasha'] as const).map((level) => {
    const timingFactId = fact.running(level, asOf);
    const id = `period:${level}@${facts.asOf}`;
    const f = facts.get(timingFactId);
    if (!f) return freeze({ id, level, timingFactId, status: 'not-running' as const });
    if (f.withheld) return freeze({ id, level, timingFactId, status: 'withheld' as const });
    const lord = f.value as Graha;
    const pf = planets.find((p) => p.planet === lord)!;
    const items = r.evidence.filter((a) => a.metadata.ruleId === 'dasha.running-lord' && admissible(facts, a)
      && a.metadata.factIds.includes(timingFactId));
    // Capacity belongs to the lord, not the level: an Antardasha of the Mahadasha lord has no item of its
    // own, so its capacity is the same reading the Mahadasha's items carry.
    const capacityItems = items.length ? items : r.evidence.filter((a) => a.metadata.ruleId === 'dasha.running-lord' && admissible(facts, a) && a.item.planet === lord);
    const capacityFacts = Array.from(new Set(capacityItems.flatMap((a) => a.metadata.factIds.filter((x) => a.metadata.dependencyTypes[x].includes('derived')))));
    const lords = Array.from({ length: 12 }, (_, i) => fact.lord(i + 1));
    const lordsKnown = lords.every((x) => facts.get(x)?.reliable);
    const house = valueOf<number>(facts, fact.house(lord));
    const areas = {} as Record<LifeDomain, PeriodArea>;
    for (const d of LIFE_DOMAINS) {
      const spec = DOMAIN_SPECS[d];
      const periodItem = items.find((a) => a.item.domain === d);
      const natal = { supporting: [] as string[], challenging: [] as string[], neutral: [] as string[], experimental: [] as string[] };
      const e = pf.evidence[d];
      for (const [k, list] of [['supporting', e.supporting], ['challenging', e.challenging], ['neutral', e.neutral], ['experimental', e.experimental]] as const) {
        for (const x of list) if (x.ruleId !== 'dasha.running-lord' && x.relation === 'subject') natal[k].push(x.id);
      }
      areas[d] = {
        link: {
          rules: lordsKnown ? { status: 'known', houses: spec.houses.filter((h) => valueOf(facts, fact.lord(h)) === lord) } : { status: 'withheld' },
          occupies: house !== undefined ? { status: 'known', house: spec.houses.includes(house) ? house : null } : { status: 'withheld' },
          significator: spec.karakas.includes(lord),
        },
        periodEvidence: periodItem ? evidenceRef(periodItem, 'subject') : null,
        natal,
      };
    }
    return freeze({
      id, level, timingFactId, status: 'known' as const, lord,
      ...(level === 'antardasha' ? { sameLordAsMahadasha: lord === mdLord } : {}),
      capacity: { source: 'evidence/engine.ts planetCondition (read by dasha.running-lord)' as const, direction: capacityItems[0]?.item.direction ?? null, factIds: capacityFacts },
      natural: pf.interpretation.natural,
      functional: pf.interpretation.functional,
      areas,
      effectBasis: 'capacity-applied-to-each-linked-area' as const,
    });
  });
}
