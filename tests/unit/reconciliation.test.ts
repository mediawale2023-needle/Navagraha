// Shadow reconciliation (PR #104): only provisional-candidate policies (technically validated, classically
// provisional, not approved) shape a proposed shadow verdict; production resolver, evidence and verdicts are untouched.
import { describe, expect, it } from 'vitest';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { getKundli } from '../../server/astroEngine/index';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { functionalRoles } from '../../server/astroEngine/remedies';
import { reasoningInput } from '../../server/astroEngine/reasoning/index';
import { planetaryReasoningFrom } from '../../server/astroEngine/reasoning/planetary';
import * as reconciliationModule from '../../server/astroEngine/reasoning/reconciliation';
import { reconcileFrom } from '../../server/astroEngine/reasoning/reconciliation';
import { POLICIES, functionalRoleReview, policyById } from '../../server/astroEngine/reasoning/reconciliationPolicies';
import { fact } from '../../server/astroEngine/reasoning/facts';

const asOf = new Date('2026-10-13T06:00:00Z');
const PLACES: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [51.5074, -0.1278], [40.7128, -74.006]];
async function charts(n: number, timeAccuracy: 'exact' | 'approximate' = 'exact', offset = 0): Promise<CanonicalChart[]> {
  const out: CanonicalChart[] = [];
  for (let k = 0; k < n; k++) {
    const i = k + offset;
    const [lat, lng] = PLACES[i % PLACES.length];
    const date = `${1945 + ((i * 7) % 70)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + ((i * 5) % 28)).padStart(2, '0')}`;
    out.push(((await getKundli(date, `${String((i * 2) % 24).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`, lat, lng, { timeAccuracy })) as any).chartData.canonical);
  }
  return out;
}
const run = (c: CanonicalChart) => { const r = reasoningInput(c, asOf); const pr = planetaryReasoningFrom(r, c); return { r, pr, rec: reconcileFrom(r, pr) }; };
const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];

describe('policy registry', () => {
  it('every policy keeps technical, classical and production status apart; none is approved; no verse or chapter is claimed', () => {
    for (const p of POLICIES) {
      expect(['validated', 'not-implemented']).toContain(p.technicalStatus);
      expect(['validated', 'provisional', 'unresolved']).toContain(p.classicalStatus);
      expect(p.productionEligibility).toBe('not-approved');
      expect(p.activationRequires).toMatch(/primary-text validation.*or qualified expert review/i);
      expect(p.existingRule.length && p.proposedInterpretation.length && p.sources.length && p.shadowRoleReason.length).toBeTruthy();
      for (const s of p.sources) expect(s.reference).not.toMatch(/\b(verse|sloka|shloka|chapter)\s*\d/i);
      // No primary text was verified, so nothing is classically validated.
      expect(p.classicalStatus).not.toBe('validated');
      if (p.technicalStatus === 'not-implemented') expect([p.treatment, p.shadowRole]).toEqual(['none', 'flag-only']);
      expect(Object.isFrozen(p)).toBe(true);
    }
    const candidates = POLICIES.filter((p) => p.shadowRole === 'provisional-candidate');
    expect(candidates.map((p) => [p.id, p.technicalStatus, p.classicalStatus, p.productionEligibility]))
      .toEqual([['own-house-lord-not-malefic-occupant', 'validated', 'provisional', 'not-approved']]);
    expect(candidates[0].sources.some((s) => s.kind === 'engine-rule')).toBe(true);
  });

  it('the reconciliation API is shadow-only: no activation entry point, every result marked not approved', async () => {
    expect(Object.keys(reconciliationModule).sort()).toEqual(['reconcile', 'reconcileFrom']);
    const [c] = await charts(1, 'exact', 3);
    const { rec } = run(c);
    expect([rec.shadowOnly, rec.productionApproved]).toEqual([true, false]);
    for (const d of rec.domains) {
      for (const t of d.treatments) expect([t.shadowRole, t.classicalStatus]).toEqual(['provisional-candidate', 'provisional']);
      for (const g of d.diagnostics) expect(g.shadowRole).toBe('what-if');
    }
  });

  it('the functional-role review is diagnostic: remedy roles are unchanged and the flagged ascendants are the reviewed ones', () => {
    const yk = (asc: number) => Object.entries(functionalRoles(Array.from({ length: 12 }, (_, i) => ({ house: i + 1, lord: SIGN_LORDS[(asc + i) % 12] })))).find(([, r]) => r.yogakaraka)?.[0];
    expect([2, 5, 8, 11].map(yk)).toEqual(['Mercury', 'Mercury', 'Jupiter', 'Jupiter']); // existing behaviour kept
    for (const asc of [2, 5, 8, 11]) {
      const review = functionalRoleReview(Array.from({ length: 12 }, (_, i) => ({ house: i + 1, lord: SIGN_LORDS[(asc + i) % 12] })));
      expect(Object.values(review).filter((x) => x.proposed === 'yogakaraka')).toEqual([]);
    }
    const sag = functionalRoleReview(Array.from({ length: 12 }, (_, i) => ({ house: i + 1, lord: SIGN_LORDS[(8 + i) % 12] })));
    expect(sag.Moon.proposed).toBe('neutral-8th-exempt');
    const aries = functionalRoleReview(Array.from({ length: 12 }, (_, i) => ({ house: i + 1, lord: SIGN_LORDS[i] })));
    expect(aries.Mars.proposed).toBe('lagna-lord-benefic');
  });
});

describe('shadow reconciliation', () => {
  it('the original verdict is the production verdict; the proposed one changes only through provisional-candidate treatments', async () => {
    let candidates = 0, treated = 0;
    for (const c of await charts(80)) {
      const before = JSON.stringify(c);
      const { r, rec } = run(c);
      const ins = buildInsights(c, asOf);
      const evidenceBefore = JSON.stringify(r.evidence.map((a) => a.item));
      for (const d of rec.domains) {
        const prod = ins.domains.find((x) => x.domain === d.domain)!;
        expect(d.original).toEqual({ verdict: prod.verdict, confidence: prod.confidence });
        expect(d.originalEvidenceIds).toEqual([...prod.supporting, ...prod.conflicting].map((e) => e.id));
        for (const t of d.treatments) {
          treated++;
          expect(policyById(t.policyId)!.shadowRole).toBe('provisional-candidate');
          const a = r.evidence.find((e) => e.item.id === t.evidenceId)!;
          // The occupant rules the house it occupies, and the own-house item for it exists.
          expect([a.metadata.ruleId, (r.facts.get(fact.lord(a.item.house!)) as any).value]).toEqual(['house.occupant.malefic', a.item.planet]);
          expect(r.evidence.some((e) => e.metadata.ruleId === 'house.lord-placement.own-house' && e.item.planet === a.item.planet && e.item.house === a.item.house)).toBe(true);
          // Never rests on an unresolved question's facts.
          expect(t.factIds.some((f) => /^(combustion|neecha-bhanga|yoga|dasha)/.test(f))).toBe(false);
        }
        if (!d.treatments.length) expect(d.proposed).toEqual(d.original);
        expect(d.status === 'provisional-candidate-change').toBe(d.proposed.verdict !== d.original.verdict || d.proposed.confidence !== d.original.confidence);
        if (d.status === 'provisional-candidate-change') candidates++;
        for (const g of d.diagnostics) expect(policyById(g.policyId)!.shadowRole).toBe('what-if');
      }
      // Original evidence and chart are never mutated.
      expect(JSON.stringify(r.evidence.map((a) => a.item))).toBe(evidenceBefore);
      expect(JSON.stringify(c)).toBe(before);
      expect(JSON.stringify(buildInsights(c, asOf))).toBe(JSON.stringify(ins));
    }
    expect(treated).toBeGreaterThan(0);
    expect(candidates).toBeGreaterThan(0);
  });

  it('adversarial cases: unresolved conditions never drive a candidate change', async () => {
    const seen = new Set<string>();
    for (const c of await charts(80, 'exact', 100)) {
      const { r, pr, rec } = run(c);
      const touched = new Set(rec.domains.flatMap((d) => d.treatments.map((t) => t.evidenceId)));
      for (const k of pr.contradictions) {
        if (k.code === 'strong-dignity-combust') { seen.add('combust'); for (const id of k.evidenceIds) if (touched.has(id)) expect(r.evidence.find((e) => e.item.id === id)!.metadata.ruleId).toBe('house.occupant.malefic'); }
        if (k.code === 'neecha-bhanga-with-debilitation' || k.code === 'neecha-bhanga-raja-yoga') { seen.add('nb'); for (const id of k.evidenceIds) expect(touched.has(id) && r.evidence.find((e) => e.item.id === id)!.metadata.ruleId !== 'house.occupant.malefic').toBe(false); }
        if (k.code === 'yogakaraka-negative-occupant') {
          seen.add('yogakaraka');
          // Treated exactly when the yogakaraka occupies a house it rules.
          for (const id of k.evidenceIds) {
            const a = r.evidence.find((e) => e.item.id === id)!;
            expect(touched.has(id)).toBe((r.facts.get(fact.lord(a.item.house!)) as any).value === a.item.planet);
          }
        }
        if (k.code === 'natal-vs-period') { seen.add('natal-vs-period'); expect(touched.has(k.evidenceIds[0])).toBe(false); }
        if (k.code === 'yoga-with-weak-participant') { seen.add('weak-yoga'); for (const id of k.evidenceIds) expect(touched.has(id)).toBe(false); }
      }
      // Lord's aspect on its own house: what-if only, and only where the aspecting planet rules the house.
      for (const d of rec.domains) for (const g of d.diagnostics) if (g.policyId === 'lord-aspect-on-own-house') {
        seen.add('lord-aspect');
        for (const t of g.treatments) {
          const a = r.evidence.find((e) => e.item.id === t.evidenceId)!;
          expect([a.metadata.ruleId, (r.facts.get(fact.lord(a.item.house!)) as any).value]).toEqual(['house.aspect.saturn-mars', a.item.planet]);
          expect(touched.has(t.evidenceId)).toBe(false);
        }
      }
      // A planet in two roles of one area: what-if only.
      for (const d of rec.domains) for (const g of d.diagnostics) if (g.policyId === 'planet-dignity-once-per-area') { seen.add('two-roles'); for (const t of g.treatments) expect(d.treatments.some((x) => x.evidenceId === t.evidenceId)).toBe(false); }
      if (pr.yogas.some((y, i) => pr.yogas.some((z, j) => j > i && y.participants.some((p) => z.participants.includes(p))))) seen.add('shared-participants');
    }
    for (const k of ['combust', 'nb', 'yogakaraka', 'natal-vs-period', 'weak-yoga', 'two-roles', 'lord-aspect', 'shared-participants']) expect(seen).toContain(k);
  });

  it('approximate time: policies needing houses or lordships are inapplicable and nothing changes', async () => {
    for (const c of await charts(16, 'approximate')) {
      const { rec } = run(c);
      const ins = buildInsights(c, asOf);
      for (const d of rec.domains) {
        expect(d.reliability.inapplicablePolicies).toContain('own-house-lord-not-malefic-occupant');
        expect(d.treatments).toEqual([]);
        expect(d.proposed).toEqual(d.original);
        const prod = ins.domains.find((x) => x.domain === d.domain)!;
        expect(d.original).toEqual({ verdict: prod.verdict, confidence: prod.confidence });
      }
    }
  });

  it('is frozen and deterministic', async () => {
    const [c] = await charts(1, 'exact', 7);
    const a = JSON.stringify(run(c).rec);
    expect(JSON.stringify(run(c).rec)).toBe(a);
    expect(Object.isFrozen(run(c).rec.domains[0])).toBe(true);
  });
});
