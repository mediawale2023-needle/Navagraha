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

describe('D1 — approximate time: unreliable facts keep their identity but not their value', () => {
  it('withholds every unreliable value, in every affected category, and keeps reliable values', async () => {
    const withheldCategories = new Set<string>();
    for (const c of await charts(24, 'approximate')) {
      const ix = buildFactIndex(c, asOf);
      for (const f of ix.facts.values()) {
        if (f.reliable) { expect(f.withheld).toBe(false); expect('value' in f).toBe(true); continue; }
        withheldCategories.add(f.category);
        expect([f.id, f.withheld, 'value' in f]).toEqual([f.id, true, false]);
        expect(f.provenance.path.length).toBeGreaterThan(0);
      }
      // A reliable fact still carries the chart's value.
      for (const p of c.planets) {
        const s = ix.get(fact.sign(p.name))!;
        if (s.reliable && !s.withheld) expect(s.value).toBe(p.sign);
      }
      // Dependencies still resolve to the withheld facts' identities.
      for (const { metadata } of reasoningInput(c, asOf).evidence) for (const f of metadata.factIds) expect(ix.facts.has(f), f).toBe(true);
    }
    for (const cat of ['planet.house', 'house.lord', 'varga.sign', 'sav.house', 'aspect', 'shadbala.dig', 'jaimini.karaka', 'neecha-bhanga', 'moon.paksha']) expect(withheldCategories, cat).toContain(cat);
    // Yogas, doshas, running periods and unstable planet conditions are withheld when the birth date moves them.
    expect(['yoga', 'dosha', 'dasha.running'].some((c) => withheldCategories.has(c))).toBe(true);
  });

  it('a withheld value is told apart from a value that is undefined; an exact chart withholds nothing', async () => {
    const [approx] = await charts(1, 'approximate');
    const f = buildFactIndex(approx, asOf).get(fact.house('Sun'))!;
    expect(f.withheld).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(f, 'value')).toBe(false);
    const [exact] = await charts(1);
    for (const x of buildFactIndex(exact, asOf).facts.values()) expect([x.withheld, 'value' in x]).toEqual([false, true]);
  });
});

describe('D2 — Raja Yoga dependencies are the house pairs that formed it', () => {
  it('declares only kendra–trikona lord pairs that unite, matching the detector', async () => {
    let checked = 0;
    for (const c of await charts(60)) {
      for (const { item, metadata } of reasoningInput(c, asOf).evidence.filter((a) => a.item.factor === 'Raja Yoga')) {
        const yoga = buildFactIndex(c, asOf).get(metadata.factIds[0])!;
        const planets = (yoga as any).value.planets as string[];
        const used = new Set<number>();
        for (const k of [1, 4, 7, 10]) for (const t of [1, 5, 9]) {
          const lk = c.houses[k - 1], lt = c.houses[t - 1];
          if (k !== t && lk.lord !== lt.lord && lk.lordHouse === lt.lordHouse && planets.includes(lk.lord) && planets.includes(lt.lord)) { used.add(k); used.add(t); }
        }
        const declared = metadata.factIds.filter((f) => f.startsWith('house.lord:')).map((f) => Number(f.split(':')[1]));
        expect(new Set(declared), item.id).toEqual(used);
        expect(used.size).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('D3 — running-period facts are bound to their instant', () => {
  it('a dasha dependency resolves only against the FactIndex for the same instant, across period boundaries', async () => {
    let crossed = 0;
    for (const c of await charts(12)) {
      const md = c.dashas.vimshottari.mahadashas;
      const i = md.findIndex((m) => Date.parse(m.start) <= asOf.getTime() && asOf.getTime() < Date.parse(m.end));
      const dates = [asOf, new Date(Date.parse(md[i].end) + 3_600_000), new Date(Date.parse(md[i].antardashas[0].end) - 3_600_000), new Date(Date.parse(md[i].antardashas[0].end) + 3_600_000)];
      const runs = dates.map((d) => reasoningInput(c, d));
      runs.forEach((r, k) => {
        for (const { item, metadata } of r.evidence.filter((a) => a.metadata.ruleId === 'dasha.running-lord')) {
          const f = metadata.factIds.find((x) => x.startsWith('dasha.running:'))!;
          expect(f.endsWith(`@${dates[k].toISOString()}`)).toBe(true);
          expect((r.facts.get(f) as any).value).toBe(item.planet);
          // Not a valid timing dependency for any other instant.
          runs.forEach((other, j) => { if (j !== k) { expect(other.facts.get(f)).toBeUndefined(); crossed++; } });
        }
      });
      // Identical instants give identical ids.
      const again = reasoningInput(c, new Date(asOf.getTime()));
      expect(again.evidence.map((a) => a.metadata.factIds)).toEqual(runs[0].evidence.map((a) => a.metadata.factIds));
    }
    expect(crossed).toBeGreaterThan(0);
  });

  it('the instant is captured when the evidence is built, even if the caller later changes its Date', async () => {
    const [c] = await charts(1);
    const d = new Date(asOf.getTime());
    const items = dashaEvidence(c, 'career', d);
    d.setUTCFullYear(2050);
    for (const it of items) expect(evidenceMetadata(it)!.factIds.some((f) => f.endsWith(`@${asOf.toISOString()}`))).toBe(true);
  });
});

describe('D4 — metadata is read-only', () => {
  it('the registry, facts, fact collections, metadata and dependency map reject changes', async () => {
    const [c] = await charts(1);
    const r = reasoningInput(c, asOf);
    expect(Object.isFrozen(RULES) && RULES.every((x) => Object.isFrozen(x))).toBe(true);
    expect(() => (RULES as any).push({ id: 'x' })).toThrow();
    expect(() => { (RULES[0] as any).validation = 'documented'; }).toThrow();
    // The fact collection has no write methods and its store is not reachable.
    expect((r.facts.facts as any).set).toBeUndefined();
    expect((r.facts.facts as any).delete).toBeUndefined();
    expect((r.facts.facts as any).clear).toBeUndefined();
    expect(() => { (r.facts as any).facts = new Map(); }).toThrow();
    const aspect = r.facts.get(fact.aspect('Jupiter')) as any;
    expect(() => { aspect.reliable = false; }).toThrow();
    expect(() => aspect.value.push(13)).toThrow();
    // Fact values are copies: the CanonicalChart's own arrays stay unfrozen and unchanged.
    expect(Object.isFrozen(c.aspects.find((a) => a.planet === 'Jupiter')!.aspectsHouses)).toBe(false);
    const m = r.evidence[0].metadata as any;
    expect(() => m.factIds.push('x')).toThrow();
    expect(() => { m.ruleId = 'x'; }).toThrow();
    expect(() => m.dependencyTypes[m.factIds[0]].push('timing')).toThrow();
    expect(() => (r.evidence as any).push({})).toThrow();
    expect((r.dependencies as any).set).toBeUndefined();
    const [first] = r.dependencies.keys();
    expect(() => (r.dependencies.get(first) as any).push('x')).toThrow();
    // A later call is unaffected by attempts on an earlier one.
    expect(reasoningInput(c, asOf).facts.get(fact.aspect('Jupiter'))!.reliable).toBe(true);
  });
});
