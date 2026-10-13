/**
 * Contradiction classification (shadow mode, internal only). Finds where the evidence for a chart
 * pulls two ways, or leans twice on one fact, and says what kind of tension it is:
 *
 * - legitimate-mixed: two different facts genuinely point in different directions (a natural
 *   benefic that rules a dusthana, a natal promise against the current period). Not an error.
 * - shared-dependency: two counted items in one life area read the same calculated fact (direct or
 *   derived), so they are not independent. Sharing a planet, a role or a timing fact is not enough.
 * - rule-conflict: two encoded rules read the same fact in opposite ways within one area.
 * - needs-validation: the encoded rules disagree on a question the classical sources settle
 *   differently (or have not been checked against): it is listed for classical review, not resolved.
 *
 * It reads only admissible evidence (usable, every fact reliable) and FactIndex values, so nothing
 * withheld for an approximate birth time is reconstructed. It changes no evidence, weight or verdict.
 */
import type { Graha } from '@shared/v3/canonical';
import { LIFE_DOMAINS, type LifeDomain } from '@shared/v3/evidence';
import { STRONG_DIGNITIES } from '../evidence/engine.js';
import { fact, type DependencyType, type FactId } from './facts.js';
import type { AnnotatedEvidence, ReasoningInput } from './index.js';
import { admissible, counted, depTypes, valueOf, type PlanetFinding } from './planetFindings.js';

export type ContradictionKind = 'legitimate-mixed' | 'shared-dependency' | 'rule-conflict' | 'needs-validation';
export type ContradictionCode =
  | 'repeated-fact'
  | 'natural-vs-functional'
  | 'strong-dignity-combust'
  | 'yogakaraka-negative-occupant'
  | 'neecha-bhanga-with-debilitation'
  | 'neecha-bhanga-read-two-ways'
  | 'yoga-with-weak-participant'
  | 'natal-vs-period';

export type Contradiction = Readonly<{
  id: string;
  code: ContradictionCode;
  kind: ContradictionKind;
  planet?: Graha;
  domain?: LifeDomain;
  evidenceIds: readonly string[];
  /** The calculated facts the tension rests on. */
  factIds: readonly FactId[];
  ruleIds: readonly string[];
  /** Existing classifications involved (natural nature, functional role), by source. */
  classificationSources: readonly string[];
  /** For repeated-fact: how each item depends on each shared fact. */
  dependencies?: Readonly<Record<string, Readonly<Record<FactId, readonly DependencyType[]>>>>;
  /** For repeated-fact: whether the items sharing the fact point the same way. */
  agreement?: 'same-direction' | 'opposite-direction';
  explanation: string;
  /** The classical question this raises, when it needs review. */
  validationQuestion?: string;
}>;

const CONTENT: DependencyType[] = ['direct', 'derived'];
const reads = (a: AnnotatedEvidence, id: FactId) => depTypes(a, id).some((t) => CONTENT.includes(t));
const contentFacts = (a: AnnotatedEvidence) => a.metadata.factIds.filter((id) => reads(a, id));
const uniq = <T>(xs: T[]) => Array.from(new Set(xs));
const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(freeze); Object.freeze(v); }
  return v;
};

export interface ContradictionStats {
  /** Pairs of counted items in one area that share only a role or timing fact (not duplicated evidence). */
  roleOrTimingOnlyPairs: number;
  /** Pairs of counted items in one area about the same planet that share no calculated fact at all. */
  samePlanetNoSharedFactPairs: number;
}

export function classifyContradictions(r: ReasoningInput, findings: readonly PlanetFinding[]): { contradictions: Contradiction[]; stats: ContradictionStats } {
  const { facts } = r;
  const out: Omit<Contradiction, 'id'>[] = [];
  const stats: ContradictionStats = { roleOrTimingOnlyPairs: 0, samePlanetNoSharedFactPairs: 0 };
  const byDomain = new Map<LifeDomain, AnnotatedEvidence[]>(LIFE_DOMAINS.map((d) => [d, r.evidence.filter((a) => a.item.domain === d && counted(facts, a))]));

  // 1. Repeated use of one fact by two counted items in an area.
  byDomain.forEach((items, domain) => {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [a, b] = [items[i], items[j]];
      const shared = contentFacts(a).filter((id) => reads(b, id));
      if (!shared.length) {
        if (a.metadata.factIds.some((id) => b.metadata.factIds.includes(id))) stats.roleOrTimingOnlyPairs++;
        else if (a.item.planet && a.item.planet === b.item.planet) stats.samePlanetNoSharedFactPairs++;
        continue;
      }
      const dirs = [a.item.direction, b.item.direction];
      out.push({
        code: 'repeated-fact', kind: 'shared-dependency', domain, planet: a.item.planet === b.item.planet ? a.item.planet : undefined,
        evidenceIds: [a.item.id, b.item.id], factIds: shared, ruleIds: uniq([a.metadata.ruleId, b.metadata.ruleId]), classificationSources: [],
        dependencies: Object.fromEntries([a, b].map((x) => [x.item.id, Object.fromEntries(shared.map((id) => [id, depTypes(x, id)]))])),
        agreement: dirs[0] === dirs[1] ? 'same-direction' : 'opposite-direction',
        explanation: `${a.metadata.ruleId} and ${b.metadata.ruleId} both read ${shared.join(', ')} in ${domain}; they are not independent pieces of evidence.`,
      });
    }
  });

  for (const f of findings) {
    const p = f.planet;
    const subjectCounted = (d?: LifeDomain) => r.evidence.filter((a) => (!d || a.item.domain === d) && counted(facts, a) && a.item.planet === p);
    const nat = f.interpretation.natural, fun = f.interpretation.functional;

    // 2. Natural nature against functional role (both must be known).
    if (nat.status === 'known' && fun.status === 'known') {
      const role = fun.value.role;
      const clash = (nat.value === 'benefic' && role === 'functional-malefic') || (nat.value === 'malefic' && (role === 'functional-benefic' || role === 'yogakaraka'));
      if (clash) {
        const items = subjectCounted();
        out.push({
          code: 'natural-vs-functional', kind: 'legitimate-mixed', planet: p,
          evidenceIds: items.map((a) => a.item.id), factIds: uniq([...nat.inputs, ...fun.value.ownedHouses.map((h) => fact.lord(h))]),
          ruleIds: uniq(items.map((a) => a.metadata.ruleId)), classificationSources: [nat.source, fun.source],
          explanation: `${p} is a natural ${nat.value} and, by lordship, ${role} (owns ${fun.value.ownedHouses.join(', ')}). The two classifications describe different things; the evidence engine uses the natural one for occupants and the remedies use the functional one.`,
          validationQuestion: 'Which classification governs which reading (occupant effects, period results, remedies) is not decided by any encoded rule.',
        });
      }
    }

    // 3. Strong dignity and combustion together.
    const dignity = valueOf<string>(facts, fact.dignity(p));
    const combust = valueOf<boolean>(facts, fact.combust(p));
    if (dignity && STRONG_DIGNITIES.includes(dignity) && combust === true) {
      const items = r.evidence.filter((a) => admissible(facts, a) && reads(a, fact.dignity(p)) && (a.item.planet === p));
      const readsCombust = items.filter((a) => reads(a, fact.combust(p)));
      const ignores = items.filter((a) => !reads(a, fact.combust(p)));
      out.push({
        code: 'strong-dignity-combust', kind: 'needs-validation', planet: p,
        evidenceIds: items.map((a) => a.item.id), factIds: [fact.dignity(p), fact.combust(p)], ruleIds: uniq(items.map((a) => a.metadata.ruleId)), classificationSources: [],
        explanation: `${p} is ${dignity.toLowerCase()} and combust. ${ignores.length ? `${uniq(ignores.map((a) => a.metadata.ruleId)).join(', ')} read the dignity without the combustion` : 'No item reads the dignity without the combustion'}; ${readsCombust.length ? `${uniq(readsCombust.map((a) => a.metadata.ruleId)).join(', ')} also count the combustion` : 'no item counts the combustion'}.`,
        validationQuestion: 'Whether combustion reduces a planet in exaltation, own sign or moolatrikona (and by how much) is not settled by the encoded rules.',
      });
    }

    // 4. A yogakaraka read as a malefic occupant.
    if (fun.status === 'known' && fun.value.yogakaraka) {
      for (const d of LIFE_DOMAINS) {
        const neg = subjectCounted(d).filter((a) => a.metadata.ruleId === 'house.occupant.malefic');
        if (!neg.length) continue;
        out.push({
          code: 'yogakaraka-negative-occupant', kind: 'needs-validation', planet: p, domain: d,
          evidenceIds: neg.map((a) => a.item.id), factIds: uniq([...neg.flatMap(contentFacts), ...fun.value.ownedHouses.map((h) => fact.lord(h))]),
          ruleIds: ['house.occupant.malefic'], classificationSources: [fun.source],
          explanation: `${p} is the yogakaraka for this Lagna, but as a natural malefic occupying a non-upachaya house it counts against ${d}.`,
          validationQuestion: 'Whether a yogakaraka occupying a house harms it as a natural malefic is not settled by the encoded rules.',
        });
      }
    }

    // 5. Neecha Bhanga alongside debilitation.
    if (dignity === 'Debilitated' && valueOf<boolean>(facts, fact.neechaBhanga(p)) === true) {
      const nb = fact.neechaBhanga(p);
      const items = r.evidence.filter((a) => admissible(facts, a) && reads(a, nb));
      out.push({
        code: 'neecha-bhanga-with-debilitation', kind: 'legitimate-mixed', planet: p,
        evidenceIds: items.map((a) => a.item.id), factIds: [fact.dignity(p), nb], ruleIds: uniq(items.map((a) => a.metadata.ruleId)), classificationSources: [],
        explanation: `${p} is debilitated and the debilitation is cancelled (Neecha Bhanga): both facts hold.`,
      });
      // The same cancellation read as neutral by one rule and as a positive yoga by another, in one area.
      for (const d of LIFE_DOMAINS) {
        const inArea = items.filter((a) => a.item.domain === d && a.item.tier === 'core');
        const neutral = inArea.filter((a) => a.item.direction === 'neutral');
        const positive = inArea.filter((a) => a.item.direction === 'positive');
        if (!neutral.length || !positive.length) continue;
        out.push({
          code: 'neecha-bhanga-read-two-ways', kind: 'rule-conflict', planet: p, domain: d,
          evidenceIds: [...neutral, ...positive].map((a) => a.item.id), factIds: [nb], ruleIds: uniq([...neutral, ...positive].map((a) => a.metadata.ruleId)), classificationSources: [],
          explanation: `In ${d}, ${uniq(neutral.map((a) => a.metadata.ruleId)).join(', ')} read ${p}'s cancelled debilitation as neutral, while ${uniq(positive.map((a) => a.metadata.ruleId)).join(', ')} count it as a positive yoga.`,
          validationQuestion: 'Whether a cancelled debilitation is neutral or a Raja Yoga (and in which areas) is decided differently by two encoded rules.',
        });
      }
    }

    // 7. Natal evidence against the running period, same planet and area.
    for (const d of LIFE_DOMAINS) {
      const mine = subjectCounted(d);
      const period = mine.filter((a) => a.metadata.ruleId === 'dasha.running-lord');
      const natal = mine.filter((a) => a.metadata.ruleId !== 'dasha.running-lord');
      for (const pa of period) {
        const opposed = natal.filter((n) => n.item.direction !== pa.item.direction);
        if (!opposed.length) continue;
        const pFacts = contentFacts(pa);
        // The same facts read in opposite directions is a rule conflict; different facts is a genuinely mixed picture.
        const same = opposed.filter((n) => { const nf = contentFacts(n); return nf.length > 0 && nf.length === pFacts.length && nf.every((id) => pFacts.includes(id)); });
        out.push({
          code: 'natal-vs-period', kind: same.length ? 'rule-conflict' : 'legitimate-mixed', planet: p, domain: d,
          evidenceIds: [pa.item.id, ...opposed.map((a) => a.item.id)], factIds: uniq([...pFacts, ...opposed.flatMap(contentFacts)]),
          ruleIds: uniq([pa.metadata.ruleId, ...opposed.map((a) => a.metadata.ruleId)]), classificationSources: [],
          explanation: `The running ${p} period reads ${pa.item.direction} for ${d}, while ${opposed.length} natal item(s) about ${p} read ${opposed[0].item.direction}${same.length ? ', from the same facts' : ', from different facts'}.`,
        });
      }
    }
  }

  // 6. A yoga whose participant is debilitated (uncancelled) or combust.
  const yogaItems = r.evidence.filter((a) => a.metadata.role === 'yoga' && a.item.direction === 'positive' && admissible(facts, a));
  const seen = new Set<string>();
  for (const a of yogaItems) {
    const yf = a.metadata.factIds.find((f) => f.startsWith('yoga:'))!;
    const y = valueOf<{ planets: string[]; cancelled: boolean }>(facts, yf);
    if (!y || y.cancelled) continue;
    for (const p of y.planets as Graha[]) {
      const dig = valueOf<string>(facts, fact.dignity(p));
      const nb = valueOf<boolean>(facts, fact.neechaBhanga(p));
      const comb = valueOf<boolean>(facts, fact.combust(p));
      // Neecha Bhanga Raja Yoga is defined by its planet's debilitation.
      const debilitated = dig === 'Debilitated' && nb === false && !/Neecha Bhanga/.test(a.item.factor);
      if (!debilitated && comb !== true) continue;
      const key = `${yf}|${p}|${a.item.domain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const weakFacts = [...(debilitated ? [fact.dignity(p), fact.neechaBhanga(p)] : []), ...(comb ? [fact.combust(p)] : [])];
      if (weakFacts.some((id) => !facts.get(id)?.reliable)) continue;
      out.push({
        code: 'yoga-with-weak-participant', kind: 'needs-validation', planet: p, domain: a.item.domain,
        evidenceIds: [a.item.id], factIds: [yf, ...weakFacts], ruleIds: [a.metadata.ruleId], classificationSources: [],
        explanation: `${a.item.factor} is counted as support in ${a.item.domain} (${a.item.tier}), while ${p}, one of its planets, is ${[debilitated && 'debilitated without cancellation', comb && 'combust'].filter(Boolean).join(' and ')}; the yoga rule does not read that condition.`,
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
