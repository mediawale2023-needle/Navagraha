/**
 * Contradiction classification (shadow mode, internal only). Finds where the evidence for a chart
 * leans twice on one fact, or pulls two ways, and says what kind of tension it is. A shared fact and
 * opposite directions are not, by themselves, proof that a rule is wrong; the kinds say what each case is:
 *
 * - shared-dependency: two counted items in one area rest on the same calculated fact (read directly,
 *   through a combination, or through a fact derived from it), so they are not independent. A fact read
 *   only as a gate, a role or a timing activation is not shared evidence, and neither is a shared planet.
 * - incompatible-claim: two natal items make opposite claims about the same house from the same fact,
 *   and nothing else decides either direction (a malefic lord in its own house: "protects" vs "harms").
 * - opposing-natal-readings: two natal items read the same fact in opposite directions in different
 *   contexts (different houses of the area, or other facts also decide one of them); needs reconciling.
 * - natal-vs-timing: the running period reads a planet one way, natal evidence about it the other.
 * - formation-vs-effectiveness: a yoga is formed, but a condition it does not read (a weak participant,
 *   a debilitation it rests on) bears on whether it delivers.
 * - natural-vs-functional: a planet's natural nature and its functional role by lordship differ.
 * - needs-validation: the encoded rules leave a classical question open (combust in a strong dignity,
 *   a yogakaraka read as a malefic occupant).
 * - legitimate-mixed: two facts that both hold and pull different ways (a debilitation and its cancellation).
 *
 * Cases that raise a classical question carry it in `validationQuestion`. It reads only admissible
 * evidence and FactIndex values, so nothing withheld for an approximate time is reconstructed, and it
 * changes no evidence, weight or verdict.
 */
import type { Graha } from '@shared/v3/canonical';
import { LIFE_DOMAINS, type LifeDomain } from '@shared/v3/evidence';
import { STRONG_DIGNITIES } from '../evidence/engine.js';
import { fact, type DependencyType, type FactId } from './facts.js';
import type { FactIndex } from './factIndex.js';
import type { AnnotatedEvidence, ReasoningInput } from './index.js';
import { admissible, counted, depTypes, valueOf, type PlanetFinding } from './planetFindings.js';

export type ContradictionKind =
  | 'shared-dependency' | 'incompatible-claim' | 'opposing-natal-readings' | 'natal-vs-timing'
  | 'formation-vs-effectiveness' | 'natural-vs-functional' | 'needs-validation' | 'legitimate-mixed';
export type ContradictionCode =
  | 'repeated-fact'
  | 'same-fact-opposing-readings'
  | 'natal-vs-period'
  | 'neecha-bhanga-raja-yoga'
  | 'yoga-with-weak-participant'
  | 'natural-vs-functional'
  | 'strong-dignity-combust'
  | 'yogakaraka-negative-occupant'
  | 'neecha-bhanga-with-debilitation';

/** How an item reaches a shared fact: it decides the direction, enters through a combination, or underlies a fact the item reads. */
export type SharedVia = 'direct' | 'derived' | 'fact-derivation';

export type Contradiction = Readonly<{
  id: string;
  code: ContradictionCode;
  kind: ContradictionKind;
  planet?: Graha;
  domain?: LifeDomain;
  evidenceIds: readonly string[];
  /** The calculated facts the case rests on. */
  factIds: readonly FactId[];
  ruleIds: readonly string[];
  /** Existing classifications involved (natural nature, functional role), by source. */
  classificationSources: readonly string[];
  /** For shared facts: how each item reaches each one. */
  via?: Readonly<Record<string, Readonly<Record<FactId, SharedVia>>>>;
  /** For repeated-fact: whether the items point the same way. */
  agreement?: 'same-direction' | 'opposite-direction';
  /** For natal-vs-period: whether both items rest on exactly the same facts. */
  sameFacts?: boolean;
  explanation: string;
  /** The classical question the case raises, when one is open. */
  validationQuestion?: string;
}>;

export interface ContradictionStats {
  /** Pairs of counted items in one area whose only common fact is read as a gate by at least one of them. */
  gateOnlyPairs: number;
  /** Pairs of counted items in one area that share only a role or timing fact. */
  roleOrTimingOnlyPairs: number;
  /** Pairs of counted items in one area about the same planet that share no fact at all. */
  samePlanetNoSharedFactPairs: number;
  /** Shared-dependency pairs found only because one fact is derived from another (a dignity from its sign). */
  factDerivationOnlyPairs: number;
}

const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(freeze); Object.freeze(v); }
  return v;
};
const uniq = <T>(xs: T[]) => Array.from(new Set(xs));
const has = (a: AnnotatedEvidence, id: FactId, t: DependencyType) => depTypes(a, id).includes(t);
const isPeriod = (a: AnnotatedEvidence) => a.metadata.ruleId === 'dasha.running-lord';
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** The facts an item's reading rests on: what it reads directly or through a combination, then what those are calculated from. */
export function closure(facts: FactIndex, a: AnnotatedEvidence): Map<FactId, SharedVia> {
  const out = new Map<FactId, SharedVia>();
  for (const f of a.metadata.factIds) {
    if (has(a, f, 'direct')) out.set(f, 'direct');
    else if (has(a, f, 'derived')) out.set(f, 'derived');
  }
  const queue = Array.from(out.keys());
  while (queue.length) {
    for (const src of facts.get(queue.shift()!)?.derivedFrom ?? []) {
      if (out.has(src) || facts.get(src)?.reliable !== true) continue;
      out.set(src, 'fact-derivation');
      queue.push(src);
    }
  }
  return out;
}

const gates = (a: AnnotatedEvidence) => a.metadata.factIds.filter((f) => has(a, f, 'gate') && !has(a, f, 'direct') && !has(a, f, 'derived'));

/** The classical question two opposing readings of one fact raise, when a known one applies. */
function opposingQuestion(a: AnnotatedEvidence, b: AnnotatedEvidence, shared: FactId[], domain: LifeDomain): string {
  const rules = [a.metadata.ruleId, b.metadata.ruleId];
  const pair = (x: (r: string) => boolean, y: (r: string) => boolean) => (x(rules[0]) && y(rules[1])) || (x(rules[1]) && y(rules[0]));
  const placement = (r: string) => r.startsWith('house.lord-placement');
  if (pair((r) => r === 'house.lord-placement.own-house', (r) => r === 'house.occupant.malefic')) {
    return 'Whether a natural malefic occupying the house it rules harms that house (many texts hold that a lord protects its own house) is not encoded.';
  }
  if (pair(placement, (r) => r === 'house.aspect.saturn-mars')) {
    const [pl, asp] = placement(rules[0]) ? [a, b] : [b, a];
    if (pl.item.planet === asp.item.planet && pl.item.house === asp.item.house) return "Whether a lord's aspect on the house it rules protects that house rather than pressuring it is not encoded.";
  }
  if (pair(placement, (r) => r.startsWith('house.occupant.'))) {
    return 'Whether a planet well or badly placed as a house lord helps or harms the other house of the area it occupies, as an occupant, is not encoded.';
  }
  if (pair((r) => r === 'varga.vargottama', (r) => /dignity/.test(r))) {
    return 'Whether vargottama strengthens a planet whose sign dignity is weak is not encoded.';
  }
  return `Which reading of ${shared.join(', ')} governs ${domain} — ${rules[0]} or ${rules[1]} — is not encoded.`;
}

export function classifyContradictions(r: ReasoningInput, findings: readonly PlanetFinding[]): { contradictions: Contradiction[]; stats: ContradictionStats } {
  const { facts } = r;
  const out: Omit<Contradiction, 'id'>[] = [];
  const stats: ContradictionStats = { gateOnlyPairs: 0, roleOrTimingOnlyPairs: 0, samePlanetNoSharedFactPairs: 0, factDerivationOnlyPairs: 0 };
  const cl = new Map<string, Map<FactId, SharedVia>>();
  const closureOf = (a: AnnotatedEvidence) => { let c = cl.get(a.item.id); if (!c) cl.set(a.item.id, (c = closure(facts, a))); return c; };

  // 1. Pairs of counted items in one area: shared facts, and same-fact opposing natal readings.
  for (const domain of LIFE_DOMAINS) {
    const items = r.evidence.filter((a) => a.item.domain === domain && counted(facts, a));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [a, b] = [items[i], items[j]];
      const ca = closureOf(a), cb = closureOf(b);
      const shared = Array.from(ca.keys()).filter((f) => cb.has(f));
      if (!shared.length) {
        const ga = gates(a), gb = gates(b);
        if (ga.some((f) => cb.has(f) || gb.includes(f)) || gb.some((f) => ca.has(f))) stats.gateOnlyPairs++;
        else if (a.metadata.factIds.some((f) => b.metadata.factIds.includes(f))) stats.roleOrTimingOnlyPairs++;
        else if (a.item.planet && a.item.planet === b.item.planet) stats.samePlanetNoSharedFactPairs++;
        continue;
      }
      if (shared.every((f) => ca.get(f) === 'fact-derivation' || cb.get(f) === 'fact-derivation')) stats.factDerivationOnlyPairs++;
      const via = Object.fromEntries([[a.item.id, Object.fromEntries(shared.map((f) => [f, ca.get(f)!]))], [b.item.id, Object.fromEntries(shared.map((f) => [f, cb.get(f)!]))]]);
      const opposite = a.item.direction !== b.item.direction;
      const base = { domain, planet: a.item.planet === b.item.planet ? a.item.planet : undefined, evidenceIds: [a.item.id, b.item.id], factIds: shared, ruleIds: uniq([a.metadata.ruleId, b.metadata.ruleId]), classificationSources: [], via };
      out.push({
        ...base, code: 'repeated-fact', kind: 'shared-dependency', agreement: opposite ? 'opposite-direction' : 'same-direction',
        explanation: `${a.metadata.ruleId} and ${b.metadata.ruleId} both rest on ${shared.join(', ')} in ${domain}, so they are not independent evidence.`,
      });
      if (!opposite || isPeriod(a) || isPeriod(b)) continue;
      // Same house, same fact read directly by both, and nothing else deciding either direction: the claims cannot both hold as stated.
      const directOnly = (c: Map<FactId, SharedVia>) => Array.from(c).filter(([, v]) => v === 'direct').map(([f]) => f);
      const incompatible = a.item.house !== undefined && a.item.house === b.item.house
        && [ca, cb].every((c) => directOnly(c).length > 0 && directOnly(c).every((f) => shared.includes(f)) && shared.every((f) => c.get(f) === 'direct'));
      const [pos, neg] = a.item.direction === 'positive' ? [a, b] : [b, a];
      out.push({
        ...base, code: 'same-fact-opposing-readings', kind: incompatible ? 'incompatible-claim' : 'opposing-natal-readings',
        explanation: incompatible
          ? `From ${shared.join(', ')} alone, ${pos.metadata.ruleId} says the ${ord(pos.item.house!)} house is supported while ${neg.metadata.ruleId} says it is strained.`
          : `${pos.metadata.ruleId} reads ${shared.join(', ')} as support for ${domain} (${pos.item.factor}); ${neg.metadata.ruleId} reads it as strain (${neg.item.factor}).`,
        validationQuestion: opposingQuestion(a, b, shared, domain),
      });
    }
  }

  for (const f of findings) {
    const p = f.planet;
    const subjectCounted = (d?: LifeDomain) => r.evidence.filter((a) => (!d || a.item.domain === d) && counted(facts, a) && a.item.planet === p);
    const nat = f.interpretation.natural, fun = f.interpretation.functional;

    // 2. Natural nature against functional role (both must be known).
    if (nat.status === 'known' && fun.status === 'known') {
      const role = fun.value.role;
      if ((nat.value === 'benefic' && role === 'functional-malefic') || (nat.value === 'malefic' && (role === 'functional-benefic' || role === 'yogakaraka'))) {
        const items = subjectCounted();
        out.push({
          code: 'natural-vs-functional', kind: 'natural-vs-functional', planet: p,
          evidenceIds: items.map((a) => a.item.id), factIds: uniq([...nat.inputs, ...fun.value.ownedHouses.map((h) => fact.lord(h))]),
          ruleIds: uniq(items.map((a) => a.metadata.ruleId)), classificationSources: [nat.source, fun.source],
          explanation: `${p} is a natural ${nat.value} and, by lordship, ${role} (owns ${fun.value.ownedHouses.join(', ')}). The evidence engine uses the natural nature for occupants; the remedies use the functional role.`,
          validationQuestion: 'Which classification governs which reading (occupant effects, period results, remedies) is not encoded.',
        });
      }
    }

    // 3. Strong dignity and combustion together.
    const dignity = valueOf<string>(facts, fact.dignity(p));
    const combust = valueOf<boolean>(facts, fact.combust(p));
    if (dignity && STRONG_DIGNITIES.includes(dignity) && combust === true) {
      const items = r.evidence.filter((a) => admissible(facts, a) && a.item.planet === p && closureOf(a).has(fact.dignity(p)));
      const readsCombust = items.filter((a) => closureOf(a).has(fact.combust(p)));
      const ignores = items.filter((a) => !closureOf(a).has(fact.combust(p)));
      out.push({
        code: 'strong-dignity-combust', kind: 'needs-validation', planet: p,
        evidenceIds: items.map((a) => a.item.id), factIds: [fact.dignity(p), fact.combust(p)], ruleIds: uniq(items.map((a) => a.metadata.ruleId)), classificationSources: [],
        explanation: `${p} is ${dignity.toLowerCase()} and combust. ${ignores.length ? `${uniq(ignores.map((a) => a.metadata.ruleId)).join(', ')} read the dignity without the combustion` : 'No item reads the dignity without the combustion'}; ${readsCombust.length ? `${uniq(readsCombust.map((a) => a.metadata.ruleId)).join(', ')} also count the combustion` : 'no item counts the combustion'}.`,
        validationQuestion: 'Whether combustion reduces a planet in exaltation, own sign or moolatrikona (and by how much) is not encoded.',
      });
    }

    // 4. A yogakaraka read as a malefic occupant.
    if (fun.status === 'known' && fun.value.yogakaraka) {
      for (const d of LIFE_DOMAINS) {
        const neg = subjectCounted(d).filter((a) => a.metadata.ruleId === 'house.occupant.malefic');
        if (!neg.length) continue;
        out.push({
          code: 'yogakaraka-negative-occupant', kind: 'needs-validation', planet: p, domain: d,
          evidenceIds: neg.map((a) => a.item.id), factIds: uniq([...neg.flatMap((a) => Array.from(closureOf(a).keys())), ...fun.value.ownedHouses.map((h) => fact.lord(h))]),
          ruleIds: ['house.occupant.malefic'], classificationSources: [fun.source],
          explanation: `${p} is the yogakaraka for this Lagna, but as a natural malefic occupying a non-upachaya house it counts against ${d}.`,
          validationQuestion: 'Whether a yogakaraka occupying a house harms it as a natural malefic is not encoded.',
        });
      }
    }

    // 5. Neecha Bhanga alongside debilitation, and the Neecha Bhanga Raja Yoga it forms.
    const nb = fact.neechaBhanga(p);
    if (dignity === 'Debilitated' && valueOf<boolean>(facts, nb) === true) {
      const items = r.evidence.filter((a) => admissible(facts, a) && closureOf(a).has(nb));
      out.push({
        code: 'neecha-bhanga-with-debilitation', kind: 'legitimate-mixed', planet: p,
        evidenceIds: items.map((a) => a.item.id), factIds: [fact.dignity(p), nb], ruleIds: uniq(items.map((a) => a.metadata.ruleId)), classificationSources: [],
        explanation: `${p} is debilitated and the debilitation is cancelled (Neecha Bhanga): both facts hold.`,
      });
      for (const d of LIFE_DOMAINS) {
        // The natal readings of the planet's own strength that the cancellation turns neutral (not a period lord's overall condition).
        const neutral = items.filter((a) => a.item.domain === d && a.item.tier === 'core' && a.item.direction === 'neutral' && !isPeriod(a) && has(a, nb, 'direct'));
        const yoga = items.filter((a) => a.item.domain === d && a.item.direction === 'positive' && a.metadata.role === 'yoga' && a.item.factor === 'Neecha Bhanga Raja Yoga');
        if (!neutral.length || !yoga.length) continue;
        out.push({
          code: 'neecha-bhanga-raja-yoga', kind: 'formation-vs-effectiveness', planet: p, domain: d,
          evidenceIds: [...neutral, ...yoga].map((a) => a.item.id), factIds: [fact.dignity(p), nb], ruleIds: uniq([...neutral, ...yoga].map((a) => a.metadata.ruleId)), classificationSources: [],
          explanation: `In ${d}, ${uniq(neutral.map((a) => a.metadata.ruleId)).join(', ')} read ${p}'s cancelled debilitation as restoring it to neutral strength, while the Neecha Bhanga Raja Yoga counts the same cancellation as a formed yoga.`,
          validationQuestion: 'Whether a cancelled debilitation only removes the weakness or also forms a Raja Yoga (and for which areas) is not encoded.',
        });
      }
    }

    // 6. Natal evidence against the running period, same planet and area.
    for (const d of LIFE_DOMAINS) {
      const mine = subjectCounted(d);
      for (const pa of mine.filter(isPeriod)) {
        const opposed = mine.filter((n) => !isPeriod(n) && n.item.direction !== pa.item.direction);
        if (!opposed.length) continue;
        const pf = Array.from(closureOf(pa).keys());
        const sameFacts = opposed.some((n) => { const nf = Array.from(closureOf(n).keys()); return nf.length === pf.length && nf.every((x) => pf.includes(x)); });
        const node = p === 'Rahu' || p === 'Ketu';
        out.push({
          code: 'natal-vs-period', kind: 'natal-vs-timing', planet: p, domain: d, sameFacts,
          evidenceIds: [pa.item.id, ...opposed.map((a) => a.item.id)], factIds: uniq([...pf, ...opposed.flatMap((a) => Array.from(closureOf(a).keys()))]),
          ruleIds: uniq([pa.metadata.ruleId, ...opposed.map((a) => a.metadata.ruleId)]), classificationSources: [],
          explanation: `The running ${p} period reads ${pa.item.direction} for ${d} (how well ${p} can deliver now), while ${opposed.length} natal item(s) about ${p} read ${opposed[0].item.direction} (its effect on the area's houses)${sameFacts ? ', from the same facts' : ''}.`,
          ...(node && sameFacts ? { validationQuestion: `Whether ${p} in a kendra or trikona delivers well in its period while harming that house as a malefic occupant is not encoded.` } : {}),
        });
      }
    }
  }

  // 7. A yoga whose participant is debilitated (uncancelled) or combust: formed, but is it effective?
  const seen = new Set<string>();
  for (const a of r.evidence.filter((x) => x.metadata.role === 'yoga' && x.item.direction === 'positive' && admissible(facts, x))) {
    const yf = a.metadata.factIds.find((f) => f.startsWith('yoga:'))!;
    const y = valueOf<{ planets: string[]; cancelled: boolean }>(facts, yf);
    if (!y || y.cancelled) continue;
    for (const p of y.planets as Graha[]) {
      const dig = valueOf<string>(facts, fact.dignity(p));
      const comb = valueOf<boolean>(facts, fact.combust(p));
      // Neecha Bhanga Raja Yoga is defined by its planet's debilitation.
      const debilitated = dig === 'Debilitated' && valueOf<boolean>(facts, fact.neechaBhanga(p)) === false && a.item.factor !== 'Neecha Bhanga Raja Yoga';
      if (!debilitated && comb !== true) continue;
      const key = `${yf}|${p}|${a.item.domain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const weakFacts = [...(debilitated ? [fact.dignity(p), fact.neechaBhanga(p)] : []), ...(comb ? [fact.combust(p)] : [])];
      out.push({
        code: 'yoga-with-weak-participant', kind: 'formation-vs-effectiveness', planet: p, domain: a.item.domain,
        evidenceIds: [a.item.id], factIds: [yf, ...weakFacts], ruleIds: [a.metadata.ruleId], classificationSources: [],
        explanation: `${a.item.factor} is formed and counted as support in ${a.item.domain} (${a.item.tier}), while ${p}, one of its planets, is ${[debilitated && 'debilitated without cancellation', comb && 'combust'].filter(Boolean).join(' and ')}; the yoga rule does not read that condition.`,
        validationQuestion: 'Whether a debilitated or combust participant weakens or cancels the yoga is not encoded.',
      });
    }
  }

  const n = new Map<string, number>();
  const contradictions = out.map((c) => {
    const base = `${c.code}:${c.planet ?? '-'}:${c.domain ?? '-'}`;
    const k = (n.get(base) ?? 0) + 1;
    n.set(base, k);
    return freeze({ id: `${base}:${k}`, ...c }) as Contradiction;
  });
  return { contradictions, stats };
}
