/**
 * Shadow reconciliation (internal only): for each life area, the existing verdict beside a proposed
 * one shaped only by `provisional-candidate` policies (technically validated, classically
 * provisional, not approved for production), plus what-if diagnostics and the open questions.
 *
 * It never replaces the production resolver: verdicts are computed by the existing resolveDomain,
 * once on the area's evidence as it is and once on a shadow list in which a candidate policy has
 * replaced an item with a neutral copy. Original items are never changed or removed, no threshold is
 * copied, and no weight is added. Every result is shadow-only (`productionApproved: false`); this
 * module has no way to switch a policy on. With an approximate time every policy that needs a
 * withheld fact is inapplicable, so the proposed verdict is the existing one.
 */
import type { CanonicalChart, Graha } from '@shared/v3/canonical';
import { LIFE_DOMAINS, type Confidence, type EvidenceItem, type LifeDomain, type Verdict } from '@shared/v3/evidence';
import { resolveDomain } from '../evidence/resolution.js';
import { fact, type FactId } from './facts.js';
import type { AnnotatedEvidence, ReasoningInput } from './index.js';
import { planetaryReasoningFrom, type PlanetaryReasoning } from './planetary.js';
import { counted, valueOf } from './planetFindings.js';
import { POLICIES, policyById, type ClassicalStatus, type ShadowRole } from './reconciliationPolicies.js';

export type Treatment = Readonly<{
  policyId: string;
  shadowRole: ShadowRole;
  classicalStatus: ClassicalStatus;
  evidenceId: string;
  from: EvidenceItem['direction'];
  to: 'neutral';
  factIds: readonly FactId[];
  ruleIds: readonly string[];
  explanation: string;
}>;

export type VerdictView = Readonly<{ verdict: Verdict; confidence: Confidence }>;

export type DomainReconciliation = Readonly<{
  domain: LifeDomain;
  original: VerdictView;
  /** The counted (supporting or conflicting) evidence of the existing verdict. */
  originalEvidenceIds: readonly string[];
  /** Treatments from provisional-candidate policies: the only ones that shape the proposed verdict. */
  treatments: readonly Treatment[];
  proposed: VerdictView;
  /** A provisional candidate is not a validated prediction: its policy is classically provisional and not approved. */
  status: 'unchanged' | 'provisional-candidate-change';
  /** How the proposed verdict differs; null when it does not. Direction is not quality. */
  change: null | Readonly<{ verdict: boolean; confidence: boolean; towards: 'more-favourable' | 'less-favourable' | 'same-verdict' }>;
  /** Provisional what-ifs: each policy alone, diagnostic only. */
  diagnostics: ReadonlyArray<Readonly<{ policyId: string; shadowRole: ShadowRole; classicalStatus: ClassicalStatus; treatments: readonly Treatment[]; whatIf: VerdictView; wouldChange: boolean }>>;
  /** Open questions bearing on this area's evidence (unresolved policies and classifier questions). */
  openQuestions: ReadonlyArray<Readonly<{ policyId: string | null; question: string; evidenceIds: readonly string[] }>>;
  reliability: Readonly<{ approximate: boolean; inapplicablePolicies: readonly string[] }>;
}>;

export type Reconciliation = Readonly<{
  asOf: string;
  approximate: boolean;
  /** Always true: nothing here is served, and no policy is approved for production. */
  shadowOnly: true;
  productionApproved: false;
  domains: readonly DomainReconciliation[];
}>;

const VERDICT_ORDER: Verdict[] = ['Very Challenging', 'Challenging', 'Mixed', 'Strong', 'Very Strong', 'Exceptional'];
const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(freeze); Object.freeze(v); }
  return v;
};
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const view = (d: { verdict: Verdict; confidence: Confidence }): VerdictView => ({ verdict: d.verdict, confidence: d.confidence });

const role = (policyId: string) => {
  const p = policyById(policyId)!;
  return { policyId, shadowRole: p.shadowRole, classicalStatus: p.classicalStatus };
};

type TreatmentFn = (r: ReasoningInput, items: readonly AnnotatedEvidence[]) => Treatment[];

/** Provisional candidate: a malefic occupant that rules the house it occupies (the own-house rule governs). */
function ownHouseMaleficTreatments(r: ReasoningInput, items: readonly AnnotatedEvidence[]): Treatment[] {
  const out: Treatment[] = [];
  for (const a of items) {
    if (a.metadata.ruleId !== 'house.occupant.malefic' || !counted(r.facts, a) || !a.item.planet || a.item.house === undefined) continue;
    const lordFact = fact.lord(a.item.house);
    if (valueOf<Graha>(r.facts, lordFact) !== a.item.planet) continue;
    const own = items.find((x) => x.metadata.ruleId === 'house.lord-placement.own-house' && x.item.planet === a.item.planet && x.item.house === a.item.house);
    out.push({
      ...role('own-house-lord-not-malefic-occupant'), evidenceId: a.item.id, from: a.item.direction, to: 'neutral',
      factIds: [fact.house(a.item.planet), lordFact], ruleIds: ['house.occupant.malefic', 'house.lord-placement.own-house'],
      explanation: `${a.item.planet} occupies the ${ord(a.item.house)} house, which it rules: the own-house rule${own ? ` (${own.item.id})` : ''} reads it as protecting the house, so the malefic-occupant strain is not counted.`,
    });
  }
  return out;
}

/** What-if: Saturn's or Mars's aspect on a house it rules. */
function lordAspectTreatments(r: ReasoningInput, items: readonly AnnotatedEvidence[]): Treatment[] {
  return items.filter((a) => a.metadata.ruleId === 'house.aspect.saturn-mars' && counted(r.facts, a) && a.item.house !== undefined
    && valueOf<Graha>(r.facts, fact.lord(a.item.house)) === a.item.planet).map((a) => ({
    ...role('lord-aspect-on-own-house'), evidenceId: a.item.id, from: a.item.direction, to: 'neutral' as const,
    factIds: [fact.aspect(a.item.planet!), fact.lord(a.item.house!)], ruleIds: ['house.aspect.saturn-mars'],
    explanation: `${a.item.planet} aspects the ${ord(a.item.house!)} house, which it rules.`,
  }));
}

/** What-if: one planet's dignity reading counted once per area (the strongest item stays). */
function dignityOnceTreatments(r: ReasoningInput, items: readonly AnnotatedEvidence[]): Treatment[] {
  const W = { strong: 3, moderate: 2, weak: 1 } as const;
  const byPlanet = new Map<string, AnnotatedEvidence[]>();
  for (const a of items) {
    if ((a.metadata.ruleId !== 'house.lord-dignity' && a.metadata.ruleId !== 'karaka.dignity') || !counted(r.facts, a)) continue;
    byPlanet.set(a.item.planet!, [...(byPlanet.get(a.item.planet!) ?? []), a]);
  }
  const out: Treatment[] = [];
  byPlanet.forEach((list, planet) => {
    if (list.length < 2) return;
    const keep = [...list].sort((x, y) => W[y.item.strength] - W[x.item.strength])[0];
    for (const a of list) if (a !== keep) out.push({
      ...role('planet-dignity-once-per-area'), evidenceId: a.item.id, from: a.item.direction, to: 'neutral',
      factIds: [fact.dignity(planet)], ruleIds: [a.metadata.ruleId, keep.metadata.ruleId],
      explanation: `${planet}'s dignity is already counted in this area by ${keep.item.id}.`,
    });
  });
  return out;
}

// The implemented treatments, by policy id. Which of them shape the proposed verdict is decided by the
// registry's shadow role, never here.
const TREATMENTS: Record<string, TreatmentFn> = {
  'own-house-lord-not-malefic-occupant': ownHouseMaleficTreatments,
  'lord-aspect-on-own-house': lordAspectTreatments,
  'planet-dignity-once-per-area': dignityOnceTreatments,
};
const CANDIDATES = POLICIES.filter((p) => p.shadowRole === 'provisional-candidate').map((p) => p.id);
const WHAT_IFS = POLICIES.filter((p) => p.shadowRole === 'what-if').map((p) => p.id);
for (const id of [...CANDIDATES, ...WHAT_IFS]) if (!TREATMENTS[id]) throw new Error(`policy ${id}: no implemented treatment`);

/** The area's evidence with each treated item replaced by a neutral copy; originals are untouched. */
function shadowList(items: readonly AnnotatedEvidence[], treatments: readonly Treatment[]): EvidenceItem[] {
  const treated = new Set(treatments.map((t) => t.evidenceId));
  return items.map((a) => (treated.has(a.item.id) ? { ...a.item, direction: 'neutral' as const } : a.item));
}

function towards(a: Verdict, b: Verdict): 'more-favourable' | 'less-favourable' | 'same-verdict' {
  const i = VERDICT_ORDER.indexOf(a), j = VERDICT_ORDER.indexOf(b);
  if (a === b) return 'same-verdict';
  if (i < 0 || j < 0) return 'same-verdict'; // to or from 'Insufficient evidence': a classification change, not a direction
  return j > i ? 'more-favourable' : 'less-favourable';
}

export function reconcileFrom(r: ReasoningInput, pr: PlanetaryReasoning): Reconciliation {
  const approximate = r.facts.approximate;
  // A policy is inapplicable when every fact category it needs is withheld for this chart (an approximate time).
  const inapplicable = POLICIES.filter((x) => approximate && x.requires.some((c) => ['house.lord', 'planet.house', 'aspect', 'neecha-bhanga'].includes(c))).map((x) => x.id);
  const domains = LIFE_DOMAINS.map((domain) => {
    const items = r.evidence.filter((a) => a.item.domain === domain);
    const original = resolveDomain(domain, items.map((a) => a.item), { approximate });
    const treatments = CANDIDATES.filter((id) => !inapplicable.includes(id)).flatMap((id) => TREATMENTS[id](r, items));
    const proposed = treatments.length ? resolveDomain(domain, shadowList(items, treatments), { approximate }) : original;
    const diagnostics = WHAT_IFS.filter((id) => !inapplicable.includes(id))
      .map((id) => {
        const t = TREATMENTS[id](r, items);
        if (!t.length) return null;
        const whatIf = resolveDomain(domain, shadowList(items, t), { approximate });
        const p = policyById(id)!;
        return { policyId: id, shadowRole: p.shadowRole, classicalStatus: p.classicalStatus, treatments: t, whatIf: view(whatIf), wouldChange: whatIf.verdict !== original.verdict || whatIf.confidence !== original.confidence };
      }).filter((x): x is NonNullable<typeof x> => !!x);
    const ids = new Set(items.map((a) => a.item.id));
    const answered = new Set(treatments.map((t) => t.evidenceId));
    const openQuestions = pr.contradictions
      .filter((c) => c.validationQuestion && c.evidenceIds.some((e) => ids.has(e)) && !c.evidenceIds.every((e) => answered.has(e) || !ids.has(e) || items.find((a) => a.item.id === e)?.metadata.ruleId === 'house.lord-placement.own-house'))
      .map((c) => ({ policyId: policyFor(c.code, c.ruleIds), question: c.validationQuestion!, evidenceIds: c.evidenceIds.filter((e) => ids.has(e)) }));
    const changed = proposed.verdict !== original.verdict || proposed.confidence !== original.confidence;
    return freeze({
      domain, original: view(original),
      originalEvidenceIds: [...original.supporting, ...original.conflicting].map((e) => e.id),
      treatments, proposed: view(proposed),
      status: changed ? 'provisional-candidate-change' as const : 'unchanged' as const,
      change: changed ? { verdict: proposed.verdict !== original.verdict, confidence: proposed.confidence !== original.confidence, towards: towards(original.verdict, proposed.verdict) } : null,
      diagnostics, openQuestions,
      reliability: { approximate, inapplicablePolicies: inapplicable },
    }) as DomainReconciliation;
  });
  return freeze({ asOf: r.facts.asOf, approximate, shadowOnly: true as const, productionApproved: false as const, domains });
}

/** The policy a classifier question belongs to, when one does. */
function policyFor(code: string, ruleIds: readonly string[]): string | null {
  if (code === 'strong-dignity-combust') return 'combust-strong-dignity';
  if (code === 'neecha-bhanga-raja-yoga') return 'neecha-bhanga-raja-yoga';
  if (code === 'yoga-with-weak-participant') return 'weak-yoga-participant';
  if (code === 'natural-vs-functional') return 'functional-roles-laghu-parashari';
  if (code === 'natal-vs-period') return 'rahu-ketu-kendra-trikona';
  if (code === 'same-fact-opposing-readings' && ruleIds.includes('house.aspect.saturn-mars')) return 'lord-aspect-on-own-house';
  if (code === 'same-fact-opposing-readings' && ruleIds.includes('house.lord-placement.own-house') && ruleIds.includes('house.occupant.malefic')) return 'own-house-lord-not-malefic-occupant';
  return null;
}

export function reconcile(chart: CanonicalChart, r: ReasoningInput, pr: PlanetaryReasoning = planetaryReasoningFrom(r, chart)): Reconciliation {
  return reconcileFrom(r, pr);
}
