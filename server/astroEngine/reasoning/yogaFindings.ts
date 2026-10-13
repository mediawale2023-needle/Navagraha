/**
 * Yoga findings (shadow mode, internal only): one record per yoga the chart's calculation detected and
 * the birth time supports. Formation and effectiveness are kept apart:
 * - formation: the conditions that define the yoga (evidence/engine.ts yogaDefinition) and whether the
 *   detector marked it cancelled — nothing is re-detected;
 * - effectiveness: never assessed. The finding lists what bears on it — each participant's condition read
 *   by the engine's own dignity rule (dignityDirection), the engine's dusthana weakening, whether the
 *   yoga is one of the common ones the engine never counts, and whether a participant's period is
 *   running — and the classical questions left open. A formed yoga is not assumed to give its full result.
 *
 * Four separate things, never inferred from one another:
 * - formation: the yoga is detected (and not cancelled);
 * - verdict contribution: its evidence item sits in an area's verdict evidence (supporting or
 *   conflicting in resolveDomain) — read from the verdict itself, never from detection, direction,
 *   participant strength or a running period;
 * - participant periods: a participant rules the running Mahadasha or Antardasha (timing only);
 * - effectiveness: whether it gives its traditional result — never assessed.
 *
 * With an approximate time only the sign-based yogas whose signs hold all day have a fact of their own
 * (PR #102); every other yoga is the one `yoga:time-dependent` fact and gets no finding.
 */
import type { CanonicalChart, Graha } from '@shared/v3/canonical';
import { type EvidenceDirection, type EvidenceStrength, type EvidenceTier, type LifeDomain } from '@shared/v3/evidence';
import { DUSTHANA, dignityDirection, indexChart, yogaAreaMapping, yogaDefinition } from '../evidence/engine.js';
import { domainResolution } from '../evidence/insights.js';
import { fact, type FactId } from './facts.js';
import type { ReasoningInput } from './index.js';
import { admissible, valueOf } from './planetFindings.js';
import type { PeriodFinding } from './periodFindings.js';

export type ParticipantCondition = Readonly<{
  planet: Graha;
  /** The engine's dignity reading of the participant (dignityDirection); 'no-dignity-rule' for Rahu and Ketu. */
  status: 'known' | 'withheld' | 'no-dignity-rule';
  bearing?: 'supporting' | 'challenging' | 'neutral';
  direction?: EvidenceDirection | null;
  reading?: string;
  factIds: readonly FactId[];
  /** Running Mahadasha or Antardasha lord as of the reasoning instant. */
  activePeriods: readonly ('mahadasha' | 'antardasha')[];
}>;

/**
 * Why a detected yoga (or one of its areas) adds nothing to a verdict:
 * - common-experimental: the engine shows it for context but never counts it (common yogas);
 * - cancelled: the detector marked it cancelled;
 * - counted-under-another-formation: another formation of the same yoga already stands for it in the area;
 * - not-usable: its item depends on something the birth time cannot support;
 * - neutral-evidence: its item is neutral, which a verdict does not weigh;
 * - no-area-mapped: the engine maps the yoga to no life area.
 */
export type NonContributionReason =
  | 'common-experimental' | 'cancelled' | 'counted-under-another-formation' | 'not-usable' | 'neutral-evidence' | 'no-area-mapped';

export type YogaArea = Readonly<{
  domain: LifeDomain;
  /** The evidence item the engine recorded for this yoga in the area, if any. */
  evidenceId: string | null;
  direction?: EvidenceDirection;
  strength?: EvidenceStrength;
  tier?: EvidenceTier;
  /** True only when that item is in the area's verdict evidence (supporting or conflicting). */
  countsTowardVerdict: boolean;
  /** Why the area's entry adds nothing to the verdict; absent when it counts. */
  reason?: NonContributionReason;
}>;

export type VerdictContribution = Readonly<{
  /** The yoga's evidence is part of at least one existing verdict. */
  contributes: boolean;
  /** The areas whose verdict counts it (the areas with countsTowardVerdict). */
  areas: readonly LifeDomain[];
  /** Why it counts nowhere; null when it contributes. */
  reason: NonContributionReason | null;
  source: 'evidence/resolution.ts resolveDomain (supporting and conflicting evidence)';
}>;

export type YogaFinding = Readonly<{
  /** The yoga's own fact id (`yoga:<name>:<planets>`). */
  id: string;
  factId: FactId;
  name: string;
  category: string;
  participants: readonly string[];
  formation: Readonly<{
    cancelled: boolean;
    /** The facts that define the yoga, as the engine declares them; all must be reliable. */
    definingFactIds: readonly FactId[];
    source: 'evidence/engine.ts yogaDefinition (detection in yogas.ts)';
  }>;
  areas: readonly YogaArea[];
  verdictContribution: VerdictContribution;
  effectiveness: Readonly<{
    assessed: false;
    participants: readonly ParticipantCondition[];
    /** Every participant sits in a dusthana, which the engine already reads as weakening (not for Vipreeta yogas); null when houses are withheld. */
    formedInDusthanas: boolean | null;
    /** The engine treats this yoga as too common to decide a verdict (experimental only). */
    common: boolean;
    /** A participant rules the running Mahadasha or Antardasha. Timing only: it says nothing about the yoga's result. */
    participantPeriodRunning: boolean;
  }>;
  reliability: Readonly<{ reliable: true; approximate: boolean; unresolvedDefiningFacts: readonly FactId[] }>;
  questions: readonly string[];
}>;

const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(freeze); Object.freeze(v); }
  return v;
};

// When a yoga counts nowhere, the reason its areas share, most decisive first.
const REASON_ORDER: NonContributionReason[] = ['cancelled', 'common-experimental', 'counted-under-another-formation', 'not-usable', 'neutral-evidence', 'no-area-mapped'];

const BASE_QUESTION = 'Whether this yoga gives its traditional result in full is not encoded: the engine detects formation only.';

export function buildYogaFindings(r: ReasoningInput, chart: CanonicalChart, periods: readonly PeriodFinding[]): YogaFinding[] {
  const { facts } = r;
  const ix = indexChart(chart);
  const running = periods.filter((p) => p.status === 'known').map((p) => [p.level, p.lord] as const);
  // The verdicts' own evidence, area by area: the only source of truth for contribution.
  const asOf = new Date(facts.asOf);
  const verdictEvidence = new Map<LifeDomain, Set<string>>();
  const counts = (d: LifeDomain, id: string) => {
    let ids = verdictEvidence.get(d);
    if (!ids) {
      const res = domainResolution(chart, d, asOf);
      verdictEvidence.set(d, (ids = new Set([...res.supporting, ...res.conflicting].map((e) => e.id))));
    }
    return ids.has(id);
  };
  const out: YogaFinding[] = [];
  for (const y of chart.yogas) {
    const factId = fact.yoga(y.name, y.planets);
    // Only yogas with a reliable fact of their own: nothing is read from the chart for any other.
    if (facts.get(factId)?.reliable !== true) continue;
    const defining = Array.from(new Set(yogaDefinition(ix, y).map(([id]) => id)));
    const unresolvedDefiningFacts = defining.filter((id) => facts.get(id)?.reliable !== true);
    const participants: ParticipantCondition[] = (y.planets as Graha[]).map((p) => {
      const activePeriods = running.filter(([, lord]) => lord === p).map(([level]) => level);
      if (p === 'Rahu' || p === 'Ketu') return { planet: p, status: 'no-dignity-rule', factIds: [], activePeriods };
      const ids = [fact.dignity(p), fact.combust(p), ...(facts.get(fact.neechaBhanga(p)) ? [fact.neechaBhanga(p)] : [])];
      const dignity = valueOf<string>(facts, fact.dignity(p));
      const combust = valueOf<boolean>(facts, fact.combust(p));
      const nb = valueOf<boolean>(facts, fact.neechaBhanga(p));
      if (dignity === undefined || combust === undefined || (dignity === 'Debilitated' && nb === undefined)) return { planet: p, status: 'withheld', factIds: ids, activePeriods };
      const dd = dignityDirection({ dignity, combust, neechaBhanga: nb });
      const direction = dd?.direction ?? null;
      return {
        planet: p, status: 'known', factIds: ids, activePeriods, direction, reading: dd?.text ?? `in ${dignity.toLowerCase()}`,
        bearing: direction === 'positive' ? 'supporting' : direction === 'negative' ? 'challenging' : 'neutral',
      };
    });
    const houses = y.planets.map((p) => valueOf<number>(facts, fact.house(p)));
    const formedInDusthanas = /Vipreeta/.test(y.name) || y.planets.length === 0 ? false
      : houses.some((h) => h === undefined) ? null : houses.every((h) => DUSTHANA.includes(h!));
    const mapping = yogaAreaMapping(y.name);
    const items = r.evidence.filter((a) => a.metadata.role === 'yoga' && a.metadata.factIds[0] === factId && admissible(facts, a));
    const domains: LifeDomain[] = y.name === 'Kemadruma Yoga' ? (y.cancelled ? [] : ['relationships']) : [...(mapping?.domains ?? [])];
    const areas: YogaArea[] = domains.map((domain) => {
      const item = items.find((a) => a.item.domain === domain);
      if (item) {
        const countsTowardVerdict = counts(domain, item.item.id);
        const reason: NonContributionReason | undefined = countsTowardVerdict ? undefined
          : item.item.tier === 'experimental' ? 'common-experimental'
          : item.item.direction === 'neutral' ? 'neutral-evidence'
          : 'not-usable';
        return { domain, evidenceId: item.item.id, direction: item.item.direction, strength: item.item.strength, tier: item.item.tier, countsTowardVerdict, ...(reason ? { reason } : {}) };
      }
      const reason: NonContributionReason = y.cancelled ? 'cancelled'
        : r.evidence.some((a) => a.metadata.role === 'yoga' && a.item.domain === domain && a.item.factor.replace(/^(Harsha|Sarala|Vimala) /, '') === y.name.replace(/^(Harsha|Sarala|Vimala) /, '')) ? 'counted-under-another-formation'
        : 'not-usable';
      return { domain, evidenceId: null, countsTowardVerdict: false, reason };
    });
    const contributing = areas.filter((a) => a.countsTowardVerdict).map((a) => a.domain);
    const reasons = areas.map((a) => a.reason).filter((x): x is NonContributionReason => !!x);
    const verdictContribution: VerdictContribution = {
      contributes: contributing.length > 0,
      areas: contributing,
      reason: contributing.length ? null
        : y.cancelled ? 'cancelled'
        : mapping?.common ? 'common-experimental'
        : REASON_ORDER.find((x) => reasons.includes(x)) ?? 'no-area-mapped',
      source: 'evidence/resolution.ts resolveDomain (supporting and conflicting evidence)',
    };
    out.push(freeze({
      id: factId, factId, name: y.name, category: y.category, participants: y.planets,
      formation: { cancelled: !!y.cancelled, definingFactIds: defining, source: 'evidence/engine.ts yogaDefinition (detection in yogas.ts)' as const },
      areas,
      verdictContribution,
      effectiveness: {
        assessed: false as const, participants, formedInDusthanas, common: !!mapping?.common,
        participantPeriodRunning: participants.some((p) => p.activePeriods.length > 0),
      },
      reliability: { reliable: true as const, approximate: facts.approximate, unresolvedDefiningFacts },
      questions: [
        BASE_QUESTION,
        ...(participants.some((p) => p.bearing === 'challenging') ? ['Whether a debilitated or combust participant weakens or cancels the yoga is not encoded.'] : []),
        ...(y.name === 'Neecha Bhanga Raja Yoga' ? ['Whether a cancelled debilitation only removes the weakness or also forms a Raja Yoga (and for which areas) is not encoded.'] : []),
      ],
    }));
  }
  return out;
}
