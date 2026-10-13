// Period and yoga findings and their relationships (PR #103): shadow mode, internal only.
import { describe, expect, it } from 'vitest';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { LIFE_DOMAINS } from '../../shared/v3/evidence';
import { getKundli } from '../../server/astroEngine/index';
import { DOMAIN_SPECS, dignityDirection, indexChart, planetCondition, planetDomainLinks, yogaDefinition } from '../../server/astroEngine/evidence/engine';
import { reasoningInput } from '../../server/astroEngine/reasoning/index';
import { domainResolution } from '../../server/astroEngine/evidence/insights';
import { planetaryReasoningFrom } from '../../server/astroEngine/reasoning/planetary';
import { fact } from '../../server/astroEngine/reasoning/facts';

const asOf = new Date('2026-10-13T06:00:00Z');
const PLACES: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [51.5074, -0.1278], [40.7128, -74.006]];
async function charts(n: number, timeAccuracy: 'exact' | 'approximate' = 'exact'): Promise<CanonicalChart[]> {
  const out: CanonicalChart[] = [];
  for (let i = 0; i < n; i++) {
    const [lat, lng] = PLACES[i % PLACES.length];
    const date = `${1945 + ((i * 7) % 70)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + ((i * 5) % 28)).padStart(2, '0')}`;
    out.push(((await getKundli(date, `${String((i * 2) % 24).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`, lat, lng, { timeAccuracy })) as any).chartData.canonical);
  }
  return out;
}
const reason = (c: CanonicalChart) => { const r = reasoningInput(c, asOf); return { r, pr: planetaryReasoningFrom(r, c) }; };

describe('period findings', () => {
  it('capacity is the existing rule\'s reading of the lord; area links and effects come from existing facts and items', async () => {
    let areasChecked = 0;
    for (const c of await charts(30)) {
      const { r, pr } = reason(c);
      const ix = indexChart(c);
      const [md, ad] = pr.periods;
      expect([md.level, ad.level]).toEqual(['mahadasha', 'antardasha']);
      for (const p of pr.periods.filter((x) => x.status === 'known')) {
        const lord = p.lord!;
        const items = r.evidence.filter((a) => a.metadata.ruleId === 'dasha.running-lord' && a.item.planet === lord);
        // One capacity per lord, the same one every period item carries; no new formula.
        for (const a of items) expect(a.item.direction).toBe(p.capacity!.direction);
        if (items.length) expect(p.capacity!.direction).toBe(planetCondition(ix, lord).direction);
        expect(p.effectBasis).toBe('capacity-applied-to-each-linked-area');
        if (p.level === 'antardasha') expect(p.sameLordAsMahadasha).toBe(lord === md.lord);
        const links = planetDomainLinks(ix, lord);
        for (const d of LIFE_DOMAINS) {
          const area = p.areas![d];
          const spec = DOMAIN_SPECS[d];
          expect(area.link.rules).toEqual({ status: 'known', houses: spec.houses.filter((h) => c.houses[h - 1].lord === lord) });
          const h = c.planets.find((x) => x.name === lord)!.house;
          expect(area.link.occupies).toEqual({ status: 'known', house: spec.houses.includes(h) ? h : null });
          expect(area.link.significator).toBe(spec.karakas.includes(lord));
          // The period has an item exactly where the engine links the lord to the area (an Antardasha of the Mahadasha lord has none of its own).
          if (!p.sameLordAsMahadasha) expect(!!area.periodEvidence, `${p.level} ${lord} ${d}`).toBe(links.some((l) => l.domain === d));
          for (const id of [...area.natal.supporting, ...area.natal.challenging, ...area.natal.neutral]) {
            const a = r.evidence.find((e) => e.item.id === id)!;
            expect([a.item.planet, a.metadata.ruleId === 'dasha.running-lord', a.item.domain]).toEqual([lord, false, d]);
          }
          areasChecked++;
        }
      }
    }
    expect(areasChecked).toBeGreaterThan(0);
  });

  it('approximate time: periods the birth date can move are withheld; lordships and houses are never inferred', async () => {
    let withheld = 0;
    for (const c of await charts(16, 'approximate')) {
      const { pr } = reason(c);
      for (const p of pr.periods) {
        if (p.status === 'withheld') { withheld++; expect(p.lord).toBeUndefined(); expect(p.areas).toBeUndefined(); continue; }
        if (p.status !== 'known') continue;
        for (const d of LIFE_DOMAINS) {
          expect(p.areas![d].link.rules).toEqual({ status: 'withheld' });
          expect(p.areas![d].link.occupies).toEqual({ status: 'withheld' });
        }
        expect(p.functional!.status).toBe('withheld');
        expect(p.capacity!.factIds.some((f) => f.startsWith('planet.house:'))).toBe(false);
      }
    }
    expect(withheld).toBeGreaterThan(0);
  });
});

describe('yoga findings', () => {
  it('one finding per detected yoga, with the engine\'s own definition; formation is never taken for effectiveness', async () => {
    const seen = new Set<string>();
    for (const c of await charts(60)) {
      const { r, pr } = reason(c);
      const ix = indexChart(c);
      expect(pr.yogas.map((y) => y.factId)).toEqual(c.yogas.map((y) => fact.yoga(y.name, y.planets)));
      for (const y of pr.yogas) {
        const src = c.yogas.find((x) => fact.yoga(x.name, x.planets) === y.factId)!;
        expect(y.formation.definingFactIds).toEqual(Array.from(new Set(yogaDefinition(ix, src).map(([id]) => id))));
        expect(y.formation.cancelled).toBe(!!src.cancelled);
        expect(y.effectiveness.assessed).toBe(false);
        expect(y.questions[0]).toMatch(/traditional result in full is not encoded/);
        for (const p of y.effectiveness.participants) {
          if (p.status !== 'known') continue;
          const d = c.strength.dignities.find((x) => x.planet === p.planet)!;
          expect(p.direction).toBe(dignityDirection(d)?.direction ?? null);
          if (p.bearing === 'challenging') seen.add('challenged');
        }
        for (const a of y.areas.filter((x) => x.evidenceId)) {
          const item = r.evidence.find((e) => e.item.id === a.evidenceId)!.item;
          // The engine's dusthana weakening is the one the finding reports.
          if (y.name !== 'Kemadruma Yoga') expect(item.rule.includes('weakened when formed in the 6th, 8th or 12th')).toBe(y.effectiveness.formedInDusthanas === true);
          seen.add(`area:${a.tier}`);
        }
        if (y.areas.some((a) => a.reason === 'counted-under-another-formation')) seen.add('repeat');
        if (y.effectiveness.participantPeriodRunning) seen.add('active');
      }
    }
    for (const s of ['challenged', 'area:core', 'area:experimental', 'repeat', 'active']) expect(seen).toContain(s);
  });

  it('approximate time: only yogas with a reliable fact of their own, read without houses', async () => {
    for (const c of await charts(24, 'approximate')) {
      const { r, pr } = reason(c);
      for (const y of pr.yogas) {
        expect(['Gajakesari Yoga', 'Budha-Aditya Yoga', 'Chandra-Mangala Yoga']).toContain(y.name);
        expect(r.facts.get(y.factId)!.reliable).toBe(true);
        expect(y.effectiveness.formedInDusthanas).toBeNull();
        for (const id of y.formation.definingFactIds) expect(r.facts.get(id)!.reliable).toBe(true);
      }
    }
  });
});

describe('PR #103 fixes: four distinct concepts', () => {
  it('verdict contribution is read from the verdicts themselves; top level and areas agree', async () => {
    const tally = { total: 0, contributing: 0, reasons: {} as Record<string, number> };
    for (const c of await charts(60)) {
      const { r, pr } = reason(c);
      const verdictIds = new Map(LIFE_DOMAINS.map((d) => { const res = domainResolution(c, d, asOf); return [d, new Set([...res.supporting, ...res.conflicting].map((e) => e.id))]; }));
      for (const y of pr.yogas) {
        tally.total++;
        const vc = y.verdictContribution;
        for (const a of y.areas) {
          // Matches the actual verdict evidence, area by area.
          expect(a.countsTowardVerdict, `${y.id} ${a.domain}`).toBe(!!a.evidenceId && verdictIds.get(a.domain)!.has(a.evidenceId));
          expect(!!a.reason).toBe(!a.countsTowardVerdict);
          // A non-contributing area never looks like counted evidence.
          if (!a.countsTowardVerdict && a.evidenceId) expect(a.tier === 'experimental' || a.direction === 'neutral').toBe(true);
        }
        expect(vc.areas).toEqual(y.areas.filter((a) => a.countsTowardVerdict).map((a) => a.domain));
        expect(vc.contributes).toBe(vc.areas.length > 0);
        expect(vc.reason === null).toBe(vc.contributes);
        // Not inferred from formation, direction, participant strength or periods.
        if (y.formation.cancelled) expect(vc.reason).toBe('cancelled');
        if (y.effectiveness.common) expect([vc.contributes, vc.reason]).toEqual([false, y.formation.cancelled ? 'cancelled' : 'common-experimental']);
        if (vc.contributes) tally.contributing++; else tally.reasons[vc.reason!] = (tally.reasons[vc.reason!] ?? 0) + 1;
        // Every verdict-evidence item that is this yoga's is reported as contributing.
        for (const d of LIFE_DOMAINS) for (const id of verdictIds.get(d)!) {
          const a = r.evidence.find((e) => e.item.id === id);
          if (a?.metadata.factIds[0] === y.factId) expect(vc.areas).toContain(d);
        }
      }
    }
    expect(tally.contributing).toBeGreaterThan(0);
    expect(tally.total - tally.contributing).toBe(Object.values(tally.reasons).reduce((x, n) => x + n, 0));
    for (const k of ['common-experimental', 'cancelled']) expect(tally.reasons[k], k).toBeGreaterThan(0);
  });

  it('participant-period-running only says a participant rules a running period; it never claims effectiveness', async () => {
    let seen = 0;
    for (const c of await charts(40)) {
      const { pr } = reason(c);
      for (const x of pr.relationships.filter((k) => k.type === 'yoga-activation')) {
        seen++;
        expect(x.status).toBe('participant-period-running');
        const y = pr.yogas.find((k) => k.id === x.findings[0])!;
        const p = pr.periods.find((k) => k.id === x.findings[1])!;
        expect(y.participants).toContain(p.lord);
        expect(y.effectiveness.participantPeriodRunning).toBe(true);
        expect(y.effectiveness.assessed).toBe(false);
        expect([x.evidenceIds, x.ruleIds]).toEqual([[], []]);
      }
      for (const y of pr.yogas) expect(y.effectiveness.participantPeriodRunning).toBe(y.effectiveness.participants.some((q) => q.activePeriods.length > 0));
      expect(JSON.stringify(pr.relationships)).not.toMatch(/"activated"/);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('every period area entry marks its direction as the lord\'s shared capacity, not an area result', async () => {
    let entries = 0;
    for (const c of [...await charts(20), ...await charts(8, 'approximate')]) {
      for (const p of reason(c).pr.periods.filter((x) => x.status === 'known')) {
        for (const d of LIFE_DOMAINS) {
          const a = p.areas![d];
          if (!a.periodEvidence) { expect(a.periodDirection).toBeNull(); continue; }
          entries++;
          expect(a.periodDirection).toEqual({ value: a.periodEvidence.direction, source: 'shared-period-lord-capacity', areaSpecific: false });
          expect(a.periodDirection!.value).toBe(p.capacity!.direction);
        }
      }
    }
    expect(entries).toBeGreaterThan(0);
  });
});

describe('relationships', () => {
  it('link existing findings through reliable facts; nothing is resolved or reweighted', async () => {
    const types = new Set<string>();
    for (const c of [...await charts(30), ...await charts(8, 'approximate')]) {
      const { r, pr } = reason(c);
      const ids = new Set([...pr.findings.map((f) => `planet:${f.planet}`), ...pr.periods.map((p) => p.id), ...pr.yogas.map((y) => y.id)]);
      for (const x of pr.relationships) {
        types.add(`${x.type}:${x.status}`);
        for (const f of x.findings) expect(ids.has(f), f).toBe(true);
        for (const f of x.factIds) expect(r.facts.get(f)?.reliable, f).toBe(true);
        for (const id of x.contradictionIds) expect(pr.contradictions.some((k) => k.id === id)).toBe(true);
        if (x.status === 'unresolved') expect(x.question).toBeTruthy();
        if (x.type === 'natal-vs-activation' && x.status === 'period-neutral') expect(r.evidence.find((e) => e.item.id === x.evidenceIds[0])!.item.direction).toBe('neutral');
        if (x.type === 'natal-vs-activation' && (x.status === 'legitimate-mixed' || x.status === 'unresolved')) {
          const [period, ...natal] = x.evidenceIds.map((id) => r.evidence.find((e) => e.item.id === id)!);
          expect(period.item.direction).not.toBe('neutral');
          expect(natal.some((n) => n.item.direction !== period.item.direction)).toBe(true);
        }
        if (x.type === 'natal-vs-activation' && x.status === 'aligned') {
          const [period, ...natal] = x.evidenceIds.map((id) => r.evidence.find((e) => e.item.id === id)!);
          for (const n of natal) expect(n.item.direction).toBe(period.item.direction);
        }
      }
      const s = pr.relationshipStats;
      expect(s.sharedCrossFindingPairs + s.independentCrossFindingPairs).toBe(s.crossFindingPairs);
      expect(s.sharedCrossFindingPairs).toBe(pr.relationships.filter((x) => x.type === 'shared-dependency').length);
    }
    for (const t of ['participates:linked', 'period-lord:linked', 'natal-vs-activation:aligned', 'natal-vs-activation:legitimate-mixed', 'natal-vs-activation:period-neutral', 'yoga-condition:challenging',
      'yoga-condition:supporting', 'yoga-activation:participant-period-running', 'shared-dependency:shared', 'tension:unresolved']) expect(types).toContain(t);
  });

  it('leaves the engine\'s output untouched', async () => {
    const [c] = await charts(1);
    const before = JSON.stringify(c);
    const { pr } = reason(c);
    expect(JSON.stringify(c)).toBe(before);
    expect(Object.isFrozen(pr.periods[0]) && Object.isFrozen(pr.yogas[0] ?? {}) && Object.isFrozen(pr.relationships[0])).toBe(true);
  });
});

