/**
 * Reconciliation relationships (shadow mode, internal only): how planetary, period and yoga findings
 * bear on each other, through the fact ids and rules they share. Nothing is resolved: a relationship
 * records what the existing evidence and the contradiction classifier already say, and an open
 * classical question stays open (`unresolved`). No weight, verdict or rule is touched.
 *
 * - participates / period-lord: a planet forms a yoga, or rules a running period.
 * - natal-vs-activation: in one area, the natal evidence about a period lord against the period's own
 *   item (natal potential vs period activation); a neutral period is `period-neutral`, not a conflict.
 * - yoga-condition: a formed yoga and a participant's condition (supporting, challenging or neutral).
 * - yoga-activation: a participating planet rules the running Mahadasha or Antardasha
 *   (`participant-period-running`). Timing only: it does not mean the yoga is effective, will give its
 *   result in full, or that anything positive follows.
 * - shared-dependency: two findings' evidence in one area rests on one fact (from the classifier).
 * - tension: every other classified contradiction, marked legitimate-mixed or unresolved.
 */
import type { LifeDomain } from '@shared/v3/evidence';
import type { FactId } from './facts.js';
import type { ReasoningInput } from './index.js';
import type { Contradiction } from './contradictions.js';
import { counted } from './planetFindings.js';
import type { PlanetFinding } from './planetFindings.js';
import type { PeriodFinding } from './periodFindings.js';
import type { YogaFinding } from './yogaFindings.js';

export type RelationshipType = 'participates' | 'period-lord' | 'natal-vs-activation' | 'yoga-condition' | 'yoga-activation' | 'shared-dependency' | 'tension';
export type RelationshipStatus =
  | 'linked' | 'aligned' | 'period-only' | 'period-neutral' | 'supporting' | 'challenging' | 'neutral' | 'withheld'
  | 'participant-period-running' | 'shared' | 'legitimate-mixed' | 'unresolved';

export type Relationship = Readonly<{
  id: string;
  type: RelationshipType;
  status: RelationshipStatus;
  /** Finding ids: `planet:<Graha>`, `period:<level>@<ISO>`, and a yoga finding's own fact id (`yoga:<name>:<planets>`). */
  findings: readonly string[];
  domain?: LifeDomain;
  factIds: readonly FactId[];
  ruleIds: readonly string[];
  evidenceIds: readonly string[];
  contradictionIds: readonly string[];
  question?: string;
}>;

const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v as object).forEach(freeze); Object.freeze(v); }
  return v;
};
const uniq = <T>(xs: T[]) => Array.from(new Set(xs));
export const planetFindingId = (p: string) => `planet:${p}`;

export interface RelationshipStats {
  /** Pairs of counted items in one area that belong to different findings. */
  crossFindingPairs: number;
  /** Of those, pairs resting on a shared fact (shared-dependency relationships). */
  sharedCrossFindingPairs: number;
  /** Of those, pairs with no shared fact: independent evidence (a gate, role or timing overlap does not make them dependent). */
  independentCrossFindingPairs: number;
}

export function buildRelationships(
  r: ReasoningInput, planets: readonly PlanetFinding[], periods: readonly PeriodFinding[], yogas: readonly YogaFinding[], contradictions: readonly Contradiction[],
): { relationships: Relationship[]; stats: RelationshipStats } {
  const out: Omit<Relationship, 'id'>[] = [];
  const known = periods.filter((p) => p.status === 'known');
  const byItem = new Map(r.evidence.map((a) => [a.item.id, a]));

  // Which finding an evidence item belongs to: a period's item, a yoga's item, else the planet it is about.
  const owner = (evidenceId: string): string | null => {
    const a = byItem.get(evidenceId);
    if (!a) return null;
    if (a.metadata.ruleId === 'dasha.running-lord') return known.find((p) => a.metadata.factIds.includes(p.timingFactId))?.id ?? null;
    if (a.metadata.role === 'yoga') { const y = yogas.find((x) => x.factId === a.metadata.factIds[0]); if (y) return y.id; }
    return a.item.planet ? planetFindingId(a.item.planet) : null;
  };

  for (const y of yogas) for (const p of y.participants) {
    out.push({ type: 'participates', status: 'linked', findings: [planetFindingId(p), y.id], factIds: [y.factId], ruleIds: [], evidenceIds: [], contradictionIds: [] });
  }
  for (const p of known) {
    out.push({ type: 'period-lord', status: 'linked', findings: [planetFindingId(p.lord!), p.id], factIds: [p.timingFactId], ruleIds: ['dasha.running-lord'], evidenceIds: [], contradictionIds: [] });
  }

  // Natal potential vs period activation, area by area.
  for (const p of known) {
    for (const [domain, area] of Object.entries(p.areas!) as Array<[LifeDomain, NonNullable<PeriodFinding['areas']>[LifeDomain]]>) {
      if (!area.periodEvidence) continue;
      const natal = [...area.natal.supporting, ...area.natal.challenging].map((id) => byItem.get(id)!).filter((a) => counted(r.facts, a));
      // A neutral period opposes nothing: the lord's capacity is neither help nor strain, and the natal evidence stands.
      const opposed = area.periodEvidence.direction === 'neutral' ? [] : natal.filter((a) => a.item.direction !== area.periodEvidence!.direction);
      const c = contradictions.filter((x) => x.code === 'natal-vs-period' && x.planet === p.lord && x.domain === domain && x.evidenceIds[0] === area.periodEvidence!.id);
      const question = c.find((x) => x.validationQuestion)?.validationQuestion;
      out.push({
        type: 'natal-vs-activation', domain,
        status: !natal.length ? 'period-only' : area.periodEvidence.direction === 'neutral' ? 'period-neutral' : !opposed.length ? 'aligned' : question ? 'unresolved' : 'legitimate-mixed',
        findings: [p.id, planetFindingId(p.lord!)],
        factIds: uniq([p.timingFactId, ...area.periodEvidence.factIds, ...natal.flatMap((a) => a.metadata.factIds)]),
        ruleIds: uniq(['dasha.running-lord', ...natal.map((a) => a.metadata.ruleId)]),
        evidenceIds: [area.periodEvidence.id, ...natal.map((a) => a.item.id)],
        contradictionIds: c.map((x) => x.id),
        ...(question ? { question } : {}),
      });
    }
  }

  // Formed yogas against their participants' conditions, and participants whose period is running.
  for (const y of yogas) {
    for (const pc of y.effectiveness.participants) {
      const c = contradictions.filter((x) => (x.code === 'yoga-with-weak-participant' || x.code === 'neecha-bhanga-raja-yoga') && x.planet === pc.planet
        && (x.factIds.includes(y.factId) || x.evidenceIds.some((e) => y.areas.some((a) => a.evidenceId === e))));
      if (pc.status === 'known') {
        out.push({
          type: 'yoga-condition', status: pc.bearing!, findings: [y.id, planetFindingId(pc.planet)],
          factIds: uniq([y.factId, ...pc.factIds]), ruleIds: [], evidenceIds: y.areas.flatMap((a) => (a.evidenceId ? [a.evidenceId] : [])),
          contradictionIds: c.map((x) => x.id),
          ...(pc.bearing === 'challenging' ? { question: 'Whether a debilitated or combust participant weakens or cancels the yoga is not encoded.' } : {}),
        });
      } else if (pc.status === 'withheld') {
        out.push({ type: 'yoga-condition', status: 'withheld', findings: [y.id, planetFindingId(pc.planet)], factIds: [y.factId], ruleIds: [], evidenceIds: [], contradictionIds: [] });
      }
      for (const level of pc.activePeriods) {
        const p = known.find((x) => x.level === level)!;
        out.push({ type: 'yoga-activation', status: 'participant-period-running', findings: [y.id, p.id], factIds: [y.factId, p.timingFactId], ruleIds: [], evidenceIds: [], contradictionIds: [] });
      }
    }
  }

  // Shared dependencies between different findings, and every other classified tension.
  for (const c of contradictions) {
    const findings = uniq(c.evidenceIds.map(owner).filter((x): x is string => !!x));
    if (c.code === 'repeated-fact') {
      if (findings.length < 2) continue;
      out.push({ type: 'shared-dependency', status: 'shared', findings, domain: c.domain, factIds: c.factIds, ruleIds: c.ruleIds, evidenceIds: c.evidenceIds, contradictionIds: [c.id] });
      continue;
    }
    if (c.code === 'natal-vs-period' || c.code === 'yoga-with-weak-participant') continue; // carried by natal-vs-activation and yoga-condition
    const all = uniq([...(c.planet ? [planetFindingId(c.planet)] : []), ...findings]);
    out.push({
      type: 'tension', status: c.validationQuestion ? 'unresolved' : 'legitimate-mixed', findings: all, domain: c.domain,
      factIds: c.factIds, ruleIds: c.ruleIds, evidenceIds: c.evidenceIds, contradictionIds: [c.id],
      ...(c.validationQuestion ? { question: c.validationQuestion } : {}),
    });
  }

  // Shared dependencies against independent evidence, across findings.
  const sharedPairs = new Set(contradictions.filter((c) => c.code === 'repeated-fact').map((c) => [...c.evidenceIds].sort().join('|')));
  const stats: RelationshipStats = { crossFindingPairs: 0, sharedCrossFindingPairs: 0, independentCrossFindingPairs: 0 };
  const domains = uniq(r.evidence.map((a) => a.item.domain));
  for (const d of domains) {
    const items = r.evidence.filter((a) => a.item.domain === d && counted(r.facts, a));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const oa = owner(items[i].item.id), ob = owner(items[j].item.id);
      if (!oa || !ob || oa === ob) continue;
      stats.crossFindingPairs++;
      if (sharedPairs.has([items[i].item.id, items[j].item.id].sort().join('|'))) stats.sharedCrossFindingPairs++;
      else stats.independentCrossFindingPairs++;
    }
  }

  const n = new Map<string, number>();
  const relationships = out.map((x) => {
    const base = `${x.type}:${x.findings.join('|')}:${x.domain ?? '-'}`;
    const k = (n.get(base) ?? 0) + 1;
    n.set(base, k);
    return freeze({ id: `${base}:${k}`, ...x }) as Relationship;
  });
  return { relationships, stats };
}
