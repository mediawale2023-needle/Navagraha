// Shared Astrology Reasoning Engine — foundation (PR #101). The FactIndex, rule registry and
// evidence dependency metadata are internal and additive: nothing the engine returns changes.
import { describe, expect, it } from 'vitest';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { LIFE_DOMAINS } from '../../shared/v3/evidence';
import { getKundli } from '../../server/astroEngine/index';
import { dashaEvidence, indexChart, natalEvidence } from '../../server/astroEngine/evidence/engine';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { reasoningInput, type AnnotatedEvidence } from '../../server/astroEngine/reasoning/index';
import { buildFactIndex } from '../../server/astroEngine/reasoning/factIndex';
import { evidenceMetadata } from '../../server/astroEngine/reasoning/evidenceMetadata';
import { RULES, ruleById } from '../../server/astroEngine/reasoning/rules';
import { fact } from '../../server/astroEngine/reasoning/facts';

const asOf = new Date('2026-10-13T06:00:00Z');
const PLACES: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [51.5074, -0.1278], [40.7128, -74.006]];

/** Charts spread over every ascendant and many dates; exact and approximate. */
async function charts(n: number, timeAccuracy: 'exact' | 'approximate' = 'exact'): Promise<CanonicalChart[]> {
  const out: CanonicalChart[] = [];
  for (let i = 0; i < n; i++) {
    const [lat, lng] = PLACES[i % PLACES.length];
    const date = `${1945 + ((i * 7) % 70)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + ((i * 5) % 28)).padStart(2, '0')}`;
    out.push(((await getKundli(date, `${String((i * 2) % 24).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`, lat, lng, { timeAccuracy })) as any).chartData.canonical);
  }
  return out;
}
const direct = (a: AnnotatedEvidence) => a.metadata.factIds.filter((f) => a.metadata.dependencyTypes[f].some((t) => t === 'direct' || t === 'derived'));

describe('FactIndex', () => {
  it('reads the CanonicalChart without changing it, under stable ids', async () => {
    const [c] = await charts(1);
    const before = JSON.stringify(c);
    const ix = buildFactIndex(c, asOf);
    reasoningInput(c, asOf);
    expect(JSON.stringify(c)).toBe(before);
    for (const p of c.planets) {
      expect(ix.get(fact.sign(p.name))!.value).toBe(p.sign);
      expect(ix.get(fact.house(p.name))!.value).toBe(p.house);
    }
    c.houses.forEach((h) => expect(ix.get(fact.lord(h.house))!.value).toBe(h.lord));
    c.strength.ashtakavarga.savByHouse.forEach((b, i) => expect(ix.get(fact.sav(i + 1))!.value).toBe(b));
    for (const d of c.strength.dignities) expect(ix.get(fact.dignity(d.planet))!.value).toBe(d.dignity);
    expect(Object.isFrozen(ix.get(fact.dignity('Sun')))).toBe(true);
    // Every fact carries provenance and reliability; an exact time makes every fact reliable.
    for (const f of ix.facts.values()) {
      expect(f.provenance.path.length).toBeGreaterThan(0);
      expect([f.reliable, f.reliability]).toEqual([true, 'exact-birth-time']);
    }
  });

  it('takes approximate-time reliability from the PR #98 birth-day stability check', async () => {
    for (const c of await charts(12, 'approximate')) {
      const ix = buildFactIndex(c, asOf);
      // Lagna-bound facts are never reliable with an approximate time.
      for (const id of [fact.house('Sun'), fact.lord(10), fact.sav(10), fact.varga('D9', 'Venus'), fact.digBala('Mars'), fact.aspect('Saturn')]) {
        expect([id, ix.get(id)!.reliable, ix.get(id)!.reliability]).toEqual([id, false, 'requires-exact-birth-time']);
      }
      expect(ix.get(fact.sign('Moon'))!.reliable).toBe(c.uncertainty.moonSignStableAcrossBirthDate && ix.get(fact.sign('Moon'))!.reliability === 'stable-across-birth-date');
    }
  });
});

describe('rule registry', () => {
  it('has unique, versioned rules and claims no validation it cannot document', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    for (const r of RULES) {
      expect(r.version).toBeGreaterThanOrEqual(1);
      expect(r.description.length).toBeGreaterThan(10);
      expect(r.validation === 'documented' ? !!r.reference : true).toBe(true);
    }
    expect(RULES.every((r) => r.validation === 'unvalidated')).toBe(true);
  });
});

describe('evidence dependency metadata', () => {
  it('every item is tagged; every factId and ruleId resolves; coverage is complete for every category', async () => {
    const coverage: Record<string, number> = {};
    for (const c of [...(await charts(36)), ...(await charts(12, 'approximate'))]) {
      const r = reasoningInput(c, asOf);
      expect(r.unresolved).toEqual([]);
      const ix = indexChart(c);
      const all = LIFE_DOMAINS.flatMap((d) => [...natalEvidence(c, d, ix), ...dashaEvidence(c, d, asOf, ix)]);
      expect(r.evidence.length).toBe(all.length);
      for (const { item, metadata } of r.evidence) {
        expect(ruleById(metadata.ruleId), metadata.ruleId).toBeDefined();
        expect(metadata.factIds.length, item.id).toBeGreaterThan(0);
        for (const f of metadata.factIds) expect(r.facts.get(f), `${item.id} → ${f}`).toBeDefined();
        coverage[metadata.ruleId] = (coverage[metadata.ruleId] ?? 0) + 1;
      }
    }
    // The categories the brief names are all present in this sample.
    for (const id of ['house.lord-dignity', 'house.lord-placement.kendra-trikona', 'house.occupant.natural-benefic', 'house.aspect.jupiter', 'house.sav', 'varga.lord-dignity', 'karaka.dignity', 'yoga.domain', 'jaimini.karaka-dignity', 'dasha.running-lord']) {
      expect(coverage[id], id).toBeGreaterThan(0);
    }
  });

  it('a shared planet is not a shared fact: lord placement and lord dignity read different facts', async () => {
    let checked = 0;
    for (const c of await charts(12)) {
      const r = reasoningInput(c, asOf);
      for (const d of LIFE_DOMAINS) {
        const inArea = r.evidence.filter((a) => a.item.domain === d);
        for (const p of inArea.filter((a) => a.metadata.ruleId.startsWith('house.lord-placement'))) {
          const dig = inArea.find((a) => a.metadata.ruleId === 'house.lord-dignity' && a.item.planet === p.item.planet && a.item.house === p.item.house);
          if (!dig) continue;
          checked++;
          expect(direct(p).filter((f) => direct(dig).includes(f))).toEqual([]);
          expect(direct(p)).toEqual([fact.house(p.item.planet!)]);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('one planet ruling two houses keeps two distinguishable lordship roles', async () => {
    let checked = 0;
    for (const c of await charts(36)) {
      const r = reasoningInput(c, asOf);
      const wealth = r.evidence.filter((a) => a.item.domain === 'wealth' && a.metadata.ruleId === 'house.lord-dignity');
      if (wealth.length === 2 && wealth[0].item.planet === wealth[1].item.planet) {
        checked++;
        const roles = wealth.map((a) => a.metadata.factIds.filter((f) => a.metadata.dependencyTypes[f].includes('role')));
        expect(roles[0]).not.toEqual(roles[1]);
        expect(roles.flat().sort()).toEqual([fact.lord(11), fact.lord(2)].sort());
        // The dignity both read is the same calculated fact — recorded, not hidden.
        expect(direct(wealth[0])).toEqual(direct(wealth[1]));
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('yoga evidence references the conditions that define the yoga', async () => {
    const seen = new Set<string>();
    for (const c of await charts(60)) {
      for (const { item, metadata } of reasoningInput(c, asOf).evidence.filter((a) => a.metadata.role === 'yoga')) {
        const derived = metadata.factIds.filter((f) => metadata.dependencyTypes[f].includes('derived'));
        const p = item.planet!;
        if (/^(Ruchaka|Bhadra|Hamsa|Malavya|Sasa) Yoga$/.test(item.factor)) { seen.add('mahapurusha'); expect(derived).toEqual(expect.arrayContaining([fact.dignity(p), fact.house(p)])); }
        if (item.factor === 'Gajakesari Yoga') { seen.add('gajakesari'); expect(derived).toEqual(expect.arrayContaining([fact.sign('Jupiter'), fact.sign('Moon')])); }
        if (item.factor === 'Neecha Bhanga Raja Yoga') { seen.add('nbry'); expect(derived).toEqual(expect.arrayContaining([fact.dignity(p), fact.neechaBhanga(p)])); }
        if (item.factor === 'Raja Yoga') { seen.add('raja'); expect(derived.some((f) => f.startsWith('house.lord:'))).toBe(true); }
        expect(metadata.factIds[0].startsWith('yoga:')).toBe(true);
      }
    }
    expect(Array.from(seen).sort()).toEqual(['gajakesari', 'mahapurusha', 'nbry', 'raja']);
  });

  it('dasha activation is a timing dependency, separate from the lord\'s natal condition', async () => {
    let checked = 0;
    for (const c of await charts(12)) {
      for (const { metadata } of reasoningInput(c, asOf).evidence) {
        const timing = metadata.factIds.filter((f) => metadata.dependencyTypes[f].includes('timing'));
        if (metadata.ruleId === 'dasha.running-lord') {
          checked++;
          expect(timing.length).toBe(1);
          expect(timing[0]).toMatch(/^dasha\.running:/);
          for (const f of metadata.factIds.filter((x) => x.startsWith('dignity:'))) expect(metadata.dependencyTypes[f]).toEqual(['derived']);
        } else {
          expect(timing).toEqual([]);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('approximate time: no usable item rests on a fact the birth time cannot support', async () => {
    let usable = 0;
    for (const c of await charts(24, 'approximate')) {
      const r = reasoningInput(c, asOf);
      for (const { item, metadata } of r.evidence.filter((a) => a.item.usable)) {
        usable++;
        for (const f of metadata.factIds) expect(r.facts.get(f)!.reliable, `${item.id} → ${f}`).toBe(true);
      }
    }
    expect(usable).toBeGreaterThan(0);
  });

  it('is deterministic and never part of what the engine returns', async () => {
    const [c] = await charts(1);
    const a = reasoningInput(c, asOf), b = reasoningInput(c, asOf);
    expect(a.evidence.map((e) => [e.item.id, e.metadata])).toEqual(b.evidence.map((e) => [e.item.id, e.metadata]));
    expect(Array.from(a.dependencies)).toEqual(Array.from(b.dependencies));
    // The metadata sits beside the items: serialised evidence and insights carry none of it.
    const insights = JSON.stringify(buildInsights(c, asOf));
    expect(insights).not.toMatch(/ruleId|factIds|dependencyTypes/);
    for (const { item } of a.evidence) expect(Object.keys(item)).not.toContain('ruleId');
    expect(evidenceMetadata({ ...a.evidence[0].item })).toBeUndefined();
  });
});
