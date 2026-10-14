/**
 * Canonical interpretation context (USER_FACING_REASONING_V1): one read-only view of a chart that
 * Kundli, Insights, Ask and paid reports all explain from.
 *
 * It holds only what is already established:
 * - reliable calculated facts (from the FactIndex; nothing withheld for an approximate time);
 * - the production verdicts, confidence and their own supporting and conflicting evidence;
 * - planetary, period and yoga findings and their relationships, as far as they restate production
 *   evidence or reliable facts.
 *
 * It never holds: a shadow or proposed verdict, a reconciliation policy (PR #104), a functional-role
 * classification (still provisional), a new score or a new formula. Formation, verdict contribution,
 * participant periods and effectiveness stay four separate things, and effectiveness is never assessed.
 * Every entry keeps the evidence and fact ids it rests on.
 */
import type { CanonicalChart, Graha } from '@shared/v3/canonical';
import { DOMAIN_LABELS, LIFE_DOMAINS, type Confidence, type DomainResolution, type EvidenceDirection, type EvidenceItem, type EvidenceStrength, type KundliInsights, type LifeDomain, type Verdict } from '@shared/v3/evidence';
import { buildInsights } from '../evidence/insights.js';
import { STRONG_DIGNITIES } from '../evidence/engine.js';
import { fact, type FactId } from './facts.js';
import { reasoningInput } from './index.js';
import { planetaryReasoningFrom } from './planetary.js';
import { valueOf } from './planetFindings.js';
import type { NonContributionReason } from './yogaFindings.js';

export type ContextFactor = Readonly<{
  evidenceId: string;
  factor: string;
  /** The engine's own sentence for the item. */
  text: string;
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  kind: 'natal' | 'period' | 'yoga';
  planet: Graha | null;
}>;

export type ContextArea = Readonly<{
  domain: LifeDomain;
  label: string;
  verdict: Verdict;
  confidence: Confidence;
  conclusion: string;
  supporting: readonly ContextFactor[];
  challenging: readonly ContextFactor[];
  periods: ReadonlyArray<Readonly<{
    periodId: string; level: 'mahadasha' | 'antardasha'; lord: Graha; direction: EvidenceDirection;
    via: Readonly<{ rules: readonly number[] | null; occupies: number | null | 'withheld'; significator: boolean }>;
    /** Natal evidence about the lord here, against the period's reading. */
    natal: 'aligned' | 'period-only' | 'period-neutral' | 'mixed';
  }>>;
  /** Yogas whose evidence is in this area's verdict. */
  yogas: ReadonlyArray<Readonly<{ yogaId: string; name: string }>>;
  /** Both supporting and challenging evidence count here. */
  mixed: boolean;
  /** The tradition leaves the weighing of some of this evidence open (no verdict changes because of it). */
  openInterpretation: boolean;
}>;

export type ContextPlanet = Readonly<{
  planet: Graha;
  sign: string | null;
  house: number | null;
  dignity: string | null;
  combust: boolean | null;
  naturalNature: 'benefic' | 'malefic' | null;
  rules: readonly number[] | null;
  karakaFor: readonly LifeDomain[];
  areas: ReadonlyArray<Readonly<{ domain: LifeDomain; supporting: readonly ContextFactor[]; challenging: readonly ContextFactor[] }>>;
  /** Strong dignity, yet counted challenging evidence about it in some area. */
  strongButChallenged: boolean;
  runningPeriods: readonly ('mahadasha' | 'antardasha')[];
  factIds: readonly FactId[];
}>;

export type ContextYoga = Readonly<{
  id: string;
  name: string;
  participants: readonly string[];
  cancelled: boolean;
  contributesTo: readonly LifeDomain[];
  nonContribution: NonContributionReason | null;
  effectivenessAssessed: false;
  challengedParticipants: ReadonlyArray<Readonly<{ planet: string; reading: string }>>;
  participantPeriods: ReadonlyArray<Readonly<{ planet: string; level: 'mahadasha' | 'antardasha' }>>;
}>;

export type ContextPeriod = Readonly<{
  id: string;
  level: 'mahadasha' | 'antardasha';
  status: 'known' | 'withheld' | 'not-running';
  lord: Graha | null;
  sameLordAsMahadasha: boolean;
  /** The lord's one capacity reading, applied by the engine to every linked area. */
  direction: EvidenceDirection | null;
  /** Areas where the period's evidence counts toward the verdict. */
  areas: readonly LifeDomain[];
  /** Areas the period bears on (its evidence is shown there), whether or not it counts: a neutral reading counts nowhere. */
  linkedAreas: readonly LifeDomain[];
}>;

export type InterpretationContext = Readonly<{
  version: 1;
  asOf: string;
  birthTime: 'exact' | 'approximate';
  areas: readonly ContextArea[];
  planets: readonly ContextPlanet[];
  yogas: readonly ContextYoga[];
  periods: readonly ContextPeriod[];
  /** What the birth time keeps out, stated the same for every approximate chart. */
  withheld: readonly string[];
}>;

const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(freeze); Object.freeze(v); }
  return v;
};

const kindOf = (e: EvidenceItem): ContextFactor['kind'] => (e.source === 'Dasha' ? 'period' : e.source === 'Yoga' ? 'yoga' : 'natal');
const factorOf = (e: EvidenceItem): ContextFactor => ({
  evidenceId: e.id, factor: e.factor, text: e.explanation, direction: e.direction, strength: e.strength, kind: kindOf(e), planet: e.planet ?? null,
});

/**
 * Build the context. Pass the production insights the request already has, to reuse them; the
 * verdicts in the context are always the production ones.
 */
export function buildInterpretationContext(chart: CanonicalChart, asOf: Date, insights?: KundliInsights): InterpretationContext {
  const ins = insights ?? buildInsights(chart, asOf);
  const r = reasoningInput(chart, asOf);
  const pr = planetaryReasoningFrom(r, chart);
  const approximate = chart.birth.timeAccuracy === 'approximate';
  const byDomain = new Map<LifeDomain, DomainResolution>(ins.domains.map((d) => [d.domain, d]));

  const areas: ContextArea[] = LIFE_DOMAINS.map((domain) => {
    const res = byDomain.get(domain)!;
    const counted = new Set([...res.supporting, ...res.conflicting].map((e) => e.id));
    const periods = pr.periods.filter((p) => p.status === 'known' && p.areas![domain].periodEvidence && counted.has(p.areas![domain].periodEvidence!.id)).map((p) => {
      const a = p.areas![domain];
      const rel = pr.relationships.find((x) => x.type === 'natal-vs-activation' && x.domain === domain && x.findings[0] === p.id);
      const natal = !rel || rel.status === 'period-only' ? 'period-only' as const : rel.status === 'aligned' ? 'aligned' as const : rel.status === 'period-neutral' ? 'period-neutral' as const : 'mixed' as const;
      return {
        periodId: p.id, level: p.level, lord: p.lord!, direction: a.periodDirection!.value,
        via: {
          rules: a.link.rules.status === 'known' ? a.link.rules.houses : null,
          occupies: a.link.occupies.status === 'known' ? a.link.occupies.house : 'withheld' as const,
          significator: a.link.significator,
        },
        natal,
      };
    });
    const yogas = pr.yogas.filter((y) => y.verdictContribution.areas.includes(domain)).map((y) => ({ yogaId: y.id, name: y.name }));
    const openInterpretation = pr.contradictions.some((c) => c.validationQuestion && c.domain === domain && c.evidenceIds.some((e) => counted.has(e)));
    return {
      domain, label: DOMAIN_LABELS[domain], verdict: res.verdict, confidence: res.confidence, conclusion: res.conclusion,
      supporting: res.supporting.map(factorOf), challenging: res.conflicting.map(factorOf),
      periods, yogas, mixed: res.supporting.length > 0 && res.conflicting.length > 0, openInterpretation,
    };
  });

  const planets: ContextPlanet[] = pr.findings.map((f) => {
    const p = f.planet;
    const sign = valueOf<string>(r.facts, fact.sign(p)) ?? null;
    const dignity = valueOf<string>(r.facts, fact.dignity(p)) ?? null;
    const combust = valueOf<boolean>(r.facts, fact.combust(p)) ?? null;
    const house = valueOf<number>(r.facts, fact.house(p)) ?? null;
    const nat = f.interpretation.natural;
    const lord = f.interpretation.lordships;
    const planetAreas = areas.map((a) => ({
      domain: a.domain,
      supporting: a.supporting.filter((x) => x.planet === p && x.kind !== 'period'),
      challenging: a.challenging.filter((x) => x.planet === p && x.kind !== 'period'),
    })).filter((a) => a.supporting.length || a.challenging.length);
    return {
      planet: p, sign, house, dignity, combust,
      naturalNature: nat.status === 'known' ? nat.value : null,
      rules: lord.status === 'known' ? lord.value : null,
      karakaFor: f.interpretation.naturalKarakaFor.status === 'known' ? f.interpretation.naturalKarakaFor.value : [],
      areas: planetAreas,
      strongButChallenged: !!dignity && STRONG_DIGNITIES.includes(dignity) && planetAreas.some((a) => a.challenging.length > 0),
      runningPeriods: f.calculated.runningPeriods,
      factIds: f.calculated.facts.filter((x) => !x.withheld).map((x) => x.id),
    };
  });

  const yogas: ContextYoga[] = pr.yogas.map((y) => ({
    id: y.id, name: y.name, participants: y.participants, cancelled: y.formation.cancelled,
    contributesTo: y.verdictContribution.areas, nonContribution: y.verdictContribution.reason,
    effectivenessAssessed: false as const,
    challengedParticipants: y.effectiveness.participants.filter((x) => x.bearing === 'challenging').map((x) => ({ planet: x.planet, reading: x.reading ?? '' })),
    participantPeriods: y.effectiveness.participants.flatMap((x) => x.activePeriods.map((level) => ({ planet: x.planet, level }))),
  }));

  const periods: ContextPeriod[] = pr.periods.map((p) => ({
    id: p.id, level: p.level, status: p.status, lord: p.lord ?? null, sameLordAsMahadasha: !!p.sameLordAsMahadasha,
    direction: p.status === 'known' ? p.capacity!.direction : null,
    areas: areas.filter((a) => a.periods.some((x) => x.periodId === p.id)).map((a) => a.domain),
    linkedAreas: p.status !== 'known' ? [] : LIFE_DOMAINS.filter((d) => {
      const id = p.areas![d].periodEvidence?.id;
      const res = byDomain.get(d)!;
      return !!id && [...res.supporting, ...res.conflicting, ...res.neutral].some((e) => e.id === id);
    }),
  }));

  const withheld = approximate ? ['the Ascendant (Lagna)', 'house positions and house lords', 'divisional charts and house bindus', 'house-based yogas', 'dasha dates'] : [];
  return freeze({ version: 1 as const, asOf: r.facts.asOf, birthTime: approximate ? 'approximate' : 'exact', areas, planets, yogas, periods, withheld });
}
