/**
 * Planetary findings (shadow mode, internal only): one record per planet that gathers what the
 * chart says about it — its calculated facts (from the FactIndex), the classifications the app
 * already applies to it (natural nature, functional role, lordships, karaka roles) and the
 * evidence items that concern it, by life area.
 *
 * Nothing here is a new rule or a new strength formula: natural nature is the evidence engine's
 * isNaturalBenefic, the functional role is the remedy logic's functionalRoles, karaka roles are the
 * engine's DOMAIN_SPECS and the chart's Jaimini karakas. Calculated facts and interpretive
 * classifications are kept apart, and every classification names its inputs and source.
 *
 * Reliability: values come only from the FactIndex, never from the CanonicalChart. A withheld fact
 * (approximate birth time) stays withheld, and a classification that needs one is withheld too.
 * Evidence is listed only when it is usable and every fact it read is reliable.
 */
import { GRAHAS, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { LIFE_DOMAINS, type EvidenceDirection, type EvidenceSource, type EvidenceStrength, type EvidenceTier, type LifeDomain } from '@shared/v3/evidence';
import { DOMAIN_SPECS, isNaturalBenefic } from '../evidence/engine.js';
import { functionalRoles, type FunctionalRoleName } from '../remedies.js';
import { fact, type DependencyType, type FactCategory, type FactId } from './facts.js';
import type { Fact, FactIndex, ReliabilityBasis } from './factIndex.js';
import { reasoningInput, type AnnotatedEvidence, type ReasoningInput } from './index.js';

/** A calculated fact as the FactIndex holds it: a value only when the birth time supports it. */
export type FactRef = Readonly<{ id: FactId; category: FactCategory; reliable: boolean; reliability: ReliabilityBasis }
  & ({ withheld: false; value: unknown } | { withheld: true })>;

/** An interpretive classification: what it is, which facts it read and which existing code applies it. */
export type Classified<T> = Readonly<{ source: string; inputs: readonly FactId[] }
  & ({ status: 'known'; value: T } | { status: 'withheld'; reason: string })>;

export type FunctionalClassification = Readonly<{
  role: FunctionalRoleName | 'no-lordship';
  ownedHouses: readonly number[];
  trikonaLord: boolean;
  kendraLord: boolean;
  dusthanaLord: boolean;
  yogakaraka: boolean;
}>;

/** An evidence item that concerns a planet: as its subject (item.planet) or as a participant in a yoga it reports. */
export type EvidenceRef = Readonly<{
  id: string;
  ruleId: string;
  relation: 'subject' | 'yoga-participant';
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  source: EvidenceSource;
  tier: EvidenceTier;
  factIds: readonly FactId[];
}>;

/** Admissible evidence for one planet in one life area; `counted` items are the ones a verdict counts (core, not neutral). */
export type PlanetDomainEvidence = Readonly<{
  supporting: readonly EvidenceRef[];
  challenging: readonly EvidenceRef[];
  neutral: readonly EvidenceRef[];
  experimental: readonly EvidenceRef[];
}>;

export type PlanetFinding = Readonly<{
  planet: Graha;
  calculated: Readonly<{ facts: readonly FactRef[]; runningPeriods: readonly ('mahadasha' | 'antardasha')[] }>;
  interpretation: Readonly<{
    natural: Classified<'benefic' | 'malefic'>;
    functional: Classified<FunctionalClassification>;
    lordships: Classified<readonly number[]>;
    naturalKarakaFor: Classified<readonly LifeDomain[]>;
    charaKaraka: Classified<readonly string[]>;
  }>;
  /** Detected yogas this planet forms, from reliable yoga facts only. */
  yogas: readonly Readonly<{ factId: FactId; name: string; planets: readonly string[]; cancelled: boolean }>[];
  evidence: Readonly<Record<LifeDomain, PlanetDomainEvidence>>;
  reliability: Readonly<{ approximate: boolean; withheldFactIds: readonly FactId[] }>;
}>;

export const CLASSIFICATION_SOURCES = Object.freeze({
  natural: 'evidence/engine.ts isNaturalBenefic (Jupiter, Venus, Mercury, waxing Moon)',
  functional: 'remedies.ts functionalRoles (the remedy logic)',
  lordships: 'FactIndex house.lord facts',
  naturalKaraka: 'evidence/engine.ts DOMAIN_SPECS karakas',
  charaKaraka: 'FactIndex jaimini.karaka facts',
});

const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(deepFreeze); Object.freeze(v); }
  return v;
};

const ref = (f: Fact): FactRef => (f.withheld
  ? { id: f.id, category: f.category, reliable: f.reliable, reliability: f.reliability, withheld: true }
  : { id: f.id, category: f.category, reliable: f.reliable, reliability: f.reliability, withheld: false, value: f.value });

/** Usable, and every fact it read is reliable: the only evidence the reasoning layer may use. */
export function admissible(facts: FactIndex, a: AnnotatedEvidence): boolean {
  return a.item.usable && a.metadata.factIds.every((id) => facts.get(id)?.reliable === true);
}

/** Counted toward a verdict: admissible, core and not neutral. */
export function counted(facts: FactIndex, a: AnnotatedEvidence): boolean {
  return admissible(facts, a) && a.item.tier === 'core' && a.item.direction !== 'neutral';
}

/** A fact's value when the FactIndex holds one (never read from the chart). */
export function valueOf<T>(facts: FactIndex, id: FactId): T | undefined {
  const f = facts.get(id);
  return f && !f.withheld ? (f.value as T) : undefined;
}

/** The planets of a yoga fact, when its value is held. */
function yogaPlanets(facts: FactIndex, id: FactId): readonly string[] | undefined {
  return valueOf<{ planets: string[] }>(facts, id)?.planets;
}

export function evidenceRef(a: AnnotatedEvidence, relation: EvidenceRef['relation']): EvidenceRef {
  const { item, metadata } = a;
  return { id: item.id, ruleId: metadata.ruleId, relation, direction: item.direction, strength: item.strength, source: item.source, tier: item.tier, factIds: metadata.factIds };
}

/** How an item relates to a planet, or null. A yoga participant is read from the yoga fact's value, so a withheld yoga relates to nobody else. */
export function relationTo(facts: FactIndex, a: AnnotatedEvidence, planet: Graha): EvidenceRef['relation'] | null {
  if (a.item.planet === planet) return 'subject';
  if (a.metadata.role !== 'yoga') return null;
  const yf = a.metadata.factIds.find((f) => f.startsWith('yoga:'));
  return yf && yogaPlanets(facts, yf)?.includes(planet) ? 'yoga-participant' : null;
}

function classify<T>(inputs: FactId[], facts: FactIndex, source: string, value: () => T, reason: string): Classified<T> {
  return inputs.some((id) => !facts.get(id)?.reliable)
    ? { status: 'withheld', source, inputs, reason }
    : { status: 'known', source, inputs, value: value() };
}

function planetFacts(r: ReasoningInput, planet: Graha): FactRef[] {
  const out: FactRef[] = [];
  const add = (id: FactId) => { const f = r.facts.get(id); if (f) out.push(ref(f)); };
  add(fact.sign(planet)); add(fact.house(planet)); add(fact.dignity(planet)); add(fact.combust(planet));
  add(fact.neechaBhanga(planet)); add(fact.aspect(planet)); add(fact.digBala(planet));
  if (planet === 'Moon') add(fact.paksha());
  for (const f of Array.from(r.facts.facts.values())) if (f.category === 'varga.sign' && f.subject.endsWith(`:${planet}`)) out.push(ref(f));
  return out;
}

export function buildPlanetFindings(r: ReasoningInput): PlanetFinding[] {
  const { facts } = r;
  const lordIds = Array.from({ length: 12 }, (_, i) => fact.lord(i + 1));
  const lordsKnown = lordIds.every((id) => facts.get(id)?.reliable);
  const houseLords = lordsKnown ? lordIds.map((id, i) => ({ house: i + 1, lord: valueOf<string>(facts, id)! })) : [];
  const roles = functionalRoles(houseLords);
  const karakaIds = Array.from(facts.facts.values()).filter((f) => f.category === 'jaimini.karaka').map((f) => f.id);
  const yogaFacts = Array.from(facts.facts.values()).filter((f) => f.category === 'yoga' && !f.withheld);
  const timing = Array.from(facts.facts.values()).filter((f) => f.category === 'dasha.running' && !f.withheld);

  return GRAHAS.map((planet) => {
    const calcFacts = planetFacts(r, planet);
    const owned = houseLords.filter((h) => h.lord === planet).map((h) => h.house);
    const ownedIds = lordsKnown ? owned.map((h) => fact.lord(h)) : lordIds;
    const role = roles[planet];
    const evidence = {} as Record<LifeDomain, PlanetDomainEvidence>;
    for (const d of LIFE_DOMAINS) {
      const bucket = { supporting: [] as EvidenceRef[], challenging: [] as EvidenceRef[], neutral: [] as EvidenceRef[], experimental: [] as EvidenceRef[] };
      for (const a of r.evidence) {
        if (a.item.domain !== d || !admissible(facts, a)) continue;
        const relation = relationTo(facts, a, planet);
        if (!relation) continue;
        const e = evidenceRef(a, relation);
        if (a.item.tier === 'experimental') bucket.experimental.push(e);
        else if (a.item.direction === 'positive') bucket.supporting.push(e);
        else if (a.item.direction === 'negative') bucket.challenging.push(e);
        else bucket.neutral.push(e);
      }
      evidence[d] = bucket;
    }
    const finding: PlanetFinding = {
      planet,
      calculated: {
        facts: calcFacts,
        runningPeriods: timing.filter((f) => !f.withheld && f.value === planet).map((f) => f.subject as 'mahadasha' | 'antardasha'),
      },
      interpretation: {
        natural: classify(planet === 'Moon' ? [fact.paksha()] : [], facts, CLASSIFICATION_SOURCES.natural,
          () => (isNaturalBenefic(planet, valueOf<string>(facts, fact.paksha()) === 'waxing') ? 'benefic' : 'malefic'),
          "The Moon's paksha is not reliable for this birth time."),
        // The yogakaraka is the first qualifying planet, so the role reads every lordship.
        functional: classify(lordIds, facts, CLASSIFICATION_SOURCES.functional, () => role
          ? { role: role.role, ownedHouses: role.ownedHouses, trikonaLord: role.trikonaLord, kendraLord: role.kendraLord, dusthanaLord: role.dusthanaLord, yogakaraka: role.yogakaraka }
          : { role: 'no-lordship' as const, ownedHouses: [], trikonaLord: false, kendraLord: false, dusthanaLord: false, yogakaraka: false },
        'House lordships rest on the Lagna, which this birth time cannot fix.'),
        lordships: classify(ownedIds, facts, CLASSIFICATION_SOURCES.lordships, () => owned, 'House lordships rest on the Lagna, which this birth time cannot fix.'),
        naturalKarakaFor: { status: 'known', source: CLASSIFICATION_SOURCES.naturalKaraka, inputs: [], value: LIFE_DOMAINS.filter((d) => DOMAIN_SPECS[d].karakas.includes(planet)) },
        charaKaraka: classify(karakaIds, facts, CLASSIFICATION_SOURCES.charaKaraka,
          () => karakaIds.filter((id) => valueOf(facts, id) === planet).map((id) => facts.get(id)!.subject),
          'Chara karakas are ranked by degree, which this birth time cannot fix.'),
      },
      yogas: yogaFacts
        .filter((f) => (f as { value: { planets: string[] } }).value.planets.includes(planet))
        .map((f) => { const v = (f as { value: { planets: string[]; cancelled: boolean } }).value; return { factId: f.id, name: f.subject, planets: v.planets, cancelled: v.cancelled }; }),
      evidence,
      reliability: { approximate: facts.approximate, withheldFactIds: calcFacts.filter((f) => f.withheld).map((f) => f.id) },
    };
    return deepFreeze(finding);
  });
}

/** Dependency types an item declares for a fact (empty when it does not read it). */
export function depTypes(a: AnnotatedEvidence, id: FactId): readonly DependencyType[] {
  return a.metadata.dependencyTypes[id] ?? [];
}

export function planetFindings(chart: CanonicalChart, asOf: Date): PlanetFinding[] {
  return buildPlanetFindings(reasoningInput(chart, asOf));
}
