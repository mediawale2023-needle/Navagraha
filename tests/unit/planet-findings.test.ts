// Planetary findings and contradiction classification (PR #102): shadow mode, internal only.
// Built on the PR #101 FactIndex, rule registry and evidence metadata; changes nothing the app returns.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { LIFE_DOMAINS } from '../../shared/v3/evidence';
import { getKundli } from '../../server/astroEngine/index';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { indexChart } from '../../server/astroEngine/evidence/engine';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { computeRemedies, functionalRoles, isFunctionalMaleficLord } from '../../server/astroEngine/remedies';
import { reasoningInput } from '../../server/astroEngine/reasoning/index';
import { admissible, counted } from '../../server/astroEngine/reasoning/planetFindings';
import { planetaryReasoning, planetaryReasoningFrom } from '../../server/astroEngine/reasoning/planetary';
import { closure, type ContradictionCode, type ContradictionKind } from '../../server/astroEngine/reasoning/contradictions';
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

const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const lordsFor = (asc: number) => Array.from({ length: 12 }, (_, i) => ({ house: i + 1, lord: SIGN_LORDS[(asc + i) % 12], lordHouse: 1 }));

const KIND: Record<ContradictionCode, ContradictionKind[]> = {
  'repeated-fact': ['shared-dependency'],
  'same-fact-opposing-readings': ['incompatible-claim', 'opposing-natal-readings'],
  'natal-vs-period': ['natal-vs-timing'],
  'neecha-bhanga-raja-yoga': ['formation-vs-effectiveness'],
  'yoga-with-weak-participant': ['formation-vs-effectiveness'],
  'natural-vs-functional': ['natural-vs-functional'],
  'strong-dignity-combust': ['needs-validation'],
  'yogakaraka-negative-occupant': ['needs-validation'],
  'neecha-bhanga-with-debilitation': ['legitimate-mixed'],
};
const content = (m: { factIds: readonly string[]; dependencyTypes: Record<string, readonly string[]> }) =>
  m.factIds.filter((f) => m.dependencyTypes[f].some((t) => t === 'direct' || t === 'derived'));

describe('functionalRoles (extracted from the remedy logic)', () => {
  it('names the yogakaraka of each Lagna as the remedies always have, documented limits included', () => {
    const yk = SIGNS.map((_, asc) => Object.entries(functionalRoles(lordsFor(asc))).find(([, r]) => r.yogakaraka)?.[0] ?? null);
    expect(Object.fromEntries(SIGNS.map((s, i) => [s, yk[i]]))).toEqual({
      Aries: null, Taurus: 'Saturn', Gemini: 'Mercury', Cancer: 'Mars', Leo: 'Mars', Virgo: 'Mercury',
      Libra: 'Saturn', Scorpio: null, Sagittarius: 'Jupiter', Capricorn: 'Venus', Aquarius: 'Venus', Pisces: 'Jupiter',
    });
  });

  it('classifies by trikona/dusthana lordship, and isFunctionalMaleficLord keeps its definition', () => {
    for (let asc = 0; asc < 12; asc++) {
      const hl = lordsFor(asc);
      const roles = functionalRoles(hl);
      for (const p of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']) {
        const owned = hl.filter((h) => h.lord === p).map((h) => h.house);
        const tri = owned.some((h) => [1, 5, 9].includes(h)), dus = owned.some((h) => [6, 8, 12].includes(h));
        expect(isFunctionalMaleficLord(p, hl)).toBe(dus && !tri);
        if (!owned.length) { expect(roles[p]).toBeUndefined(); continue; }
        expect(roles[p].ownedHouses).toEqual(owned);
        if (!roles[p].yogakaraka) expect(roles[p].role).toBe(tri && dus ? 'mixed' : tri ? 'functional-benefic' : dus ? 'functional-malefic' : 'neutral');
      }
    }
  });

  it('remedies still strengthen the yogakaraka and pacify dusthana lords', () => {
    const r = computeRemedies([], lordsFor(1)); // Taurus
    expect(r.find((x) => x.focus === 'Saturn')?.action).toBe('Strengthen');
    expect(r.find((x) => x.focus === 'Jupiter')?.action).toBe('Pacify'); // 8th and 11th
  });
});

describe('planetary findings', () => {
  it('one frozen finding per planet; calculated values are the FactIndex values; classifications reuse existing code', async () => {
    for (const c of await charts(12)) {
      const r = reasoningInput(c, asOf);
      const pr = planetaryReasoningFrom(r);
      const ix = indexChart(c);
      expect(pr.findings.map((f) => f.planet)).toEqual(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']);
      expect(Object.isFrozen(pr.findings[0]) && Object.isFrozen(pr.findings[0].interpretation.functional)).toBe(true);
      for (const f of pr.findings) {
        for (const fr of f.calculated.facts) expect(fr.withheld ? undefined : fr.value).toEqual((r.facts.get(fr.id) as any).value);
        const nat = f.interpretation.natural;
        expect(nat.status === 'known' && nat.value).toBe(ix.isBenefic(f.planet) ? 'benefic' : 'malefic');
        const lordships = f.interpretation.lordships;
        expect(lordships.status === 'known' && lordships.value).toEqual(c.houses.filter((h) => h.lord === f.planet).map((h) => h.house));
        const fun = f.interpretation.functional;
        expect(fun.status).toBe('known');
        if (fun.status === 'known') expect(fun.value.role).toBe(functionalRoles(c.houses)[f.planet]?.role ?? 'no-lordship');
        // Every admissible item about this planet is filed, in the bucket its direction and tier say.
        for (const d of LIFE_DOMAINS) {
          const e = f.evidence[d];
          const filed = [...e.supporting, ...e.challenging, ...e.neutral, ...e.experimental];
          const expected = r.evidence.filter((a) => a.item.domain === d && a.item.planet === f.planet && admissible(r.facts, a));
          for (const a of expected) expect(filed.map((x) => x.id)).toContain(a.item.id);
          for (const x of e.supporting) expect([x.direction, x.tier]).toEqual(['positive', 'core']);
          for (const x of e.challenging) expect([x.direction, x.tier]).toEqual(['negative', 'core']);
          for (const x of e.experimental) expect(x.tier).toBe('experimental');
        }
      }
    }
  });

  it('approximate time: nothing withheld is reconstructed, and lordship-based classifications are withheld', async () => {
    for (const c of await charts(16, 'approximate')) {
      const r = reasoningInput(c, asOf);
      const pr = planetaryReasoningFrom(r);
      expect(pr.unresolved).toEqual([]);
      expect(Object.keys(pr)).not.toContain('notAdmissibleByDomain');
      for (const f of pr.findings) {
        expect(f.interpretation.functional.status).toBe('withheld');
        expect(f.interpretation.lordships.status).toBe('withheld');
        expect(f.interpretation.charaKaraka.status).toBe('withheld');
        expect('value' in f.interpretation.functional).toBe(false);
        if (f.planet === 'Moon') expect(f.interpretation.natural.status).toBe('withheld');
        for (const fr of f.calculated.facts) {
          expect(fr.reliable).toBe(!fr.withheld);
          if (fr.withheld) expect('value' in fr).toBe(false);
        }
        expect(f.calculated.facts.find((x) => x.id === fact.house(f.planet))!.withheld).toBe(true);
        for (const y of f.yogas) expect(r.facts.get(y.factId)!.reliable).toBe(true);
        for (const d of LIFE_DOMAINS) for (const e of [...f.evidence[d].supporting, ...f.evidence[d].challenging, ...f.evidence[d].neutral, ...f.evidence[d].experimental]) {
          for (const id of e.factIds) expect(r.facts.get(id)!.reliable).toBe(true);
        }
      }
      for (const k of pr.contradictions) {
        for (const id of k.factIds) expect(r.facts.get(id)!.reliable).toBe(true);
        for (const id of k.evidenceIds) expect(admissible(r.facts, r.evidence.find((a) => a.item.id === id)!)).toBe(true);
      }
    }
  });
});

describe('contradiction classification', () => {
  it('shared-dependency needs a fact both readings rest on; a gate, role, timing fact or shared planet is not enough', async () => {
    const totals = { repeated: 0, derivation: 0, gateOnly: 0, roleOnly: 0, samePlanet: 0 };
    for (const c of await charts(30)) {
      const r = reasoningInput(c, asOf);
      const pr = planetaryReasoningFrom(r);
      totals.gateOnly += pr.stats.gateOnlyPairs; totals.roleOnly += pr.stats.roleOrTimingOnlyPairs; totals.samePlanet += pr.stats.samePlanetNoSharedFactPairs;
      for (const k of pr.contradictions) {
        expect(KIND[k.code]).toContain(k.kind);
        if (k.code !== 'repeated-fact') continue;
        totals.repeated++;
        const [a, b] = k.evidenceIds.map((id) => r.evidence.find((e) => e.item.id === id)!);
        expect(a.item.domain).toBe(b.item.domain);
        for (const id of k.factIds) {
          expect(closure(r.facts, a).has(id) && closure(r.facts, b).has(id)).toBe(true);
          expect(id.startsWith('dasha.running')).toBe(false);
          if (Object.values(k.via!).some((v) => v[id] === 'fact-derivation')) totals.derivation++;
        }
        expect(k.agreement).toBe(a.item.direction === b.item.direction ? 'same-direction' : 'opposite-direction');
      }
      // A gate-only read never makes two items dependent: a malefic occupant and the lord's dignity.
      for (const k of pr.contradictions.filter((x) => x.code === 'repeated-fact')) {
        expect(k.ruleIds.includes('house.occupant.malefic') && k.factIds.every((f) => f.startsWith('dignity:'))).toBe(false);
      }
    }
    expect(Object.values(totals).every((n) => n > 0), JSON.stringify(totals)).toBe(true);
  });

  it('a dignity and a reading of the same sign are one dependency (vargottama and the lord\'s dignity)', async () => {
    let found = 0;
    for (const c of await charts(40)) {
      const r = reasoningInput(c, asOf);
      for (const k of planetaryReasoningFrom(r).contradictions.filter((x) => x.code === 'repeated-fact' && x.ruleIds.includes('varga.vargottama') && x.ruleIds.some((id) => id === 'house.lord-dignity' || id === 'karaka.dignity'))) {
        found++;
        expect(k.factIds.some((f) => f.startsWith('planet.sign:'))).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('classifies each tension from the facts it rests on, not by direction alone', async () => {
    const seen = new Set<string>();
    for (const c of await charts(60)) {
      const r = reasoningInput(c, asOf);
      for (const k of planetaryReasoningFrom(r).contradictions) {
        seen.add(`${k.code}:${k.kind}`);
        expect(k.kind).not.toBe('rule-conflict');
        const items = k.evidenceIds.map((id) => r.evidence.find((e) => e.item.id === id)!);
        const val = (id: string) => (r.facts.get(id as any) as any).value;
        if (k.code === 'same-fact-opposing-readings') {
          const [a, b] = items;
          expect(a.item.direction).not.toBe(b.item.direction);
          for (const x of items) expect([x.metadata.ruleId === 'dasha.running-lord', counted(r.facts, x)]).toEqual([false, true]);
          if (k.kind === 'incompatible-claim') {
            expect(a.item.house).toBe(b.item.house);
            for (const x of items) for (const [f, via] of closure(r.facts, x)) if (via === 'direct') expect(k.factIds).toContain(f);
          }
          expect(k.validationQuestion).toBeTruthy();
        }
        if (k.code === 'natal-vs-period') {
          const [period, ...natal] = items;
          expect(period.metadata.ruleId).toBe('dasha.running-lord');
          for (const n of natal) expect(n.item.direction).not.toBe(period.item.direction);
        }
        if (k.code === 'neecha-bhanga-raja-yoga') {
          expect([val(fact.dignity(k.planet!)), val(fact.neechaBhanga(k.planet!))]).toEqual(['Debilitated', true]);
          expect(items.some((a) => a.item.factor === 'Neecha Bhanga Raja Yoga' && a.item.direction === 'positive')).toBe(true);
          for (const a of items.filter((x) => x.item.direction === 'neutral')) expect(a.metadata.dependencyTypes[fact.neechaBhanga(k.planet!)]).toContain('direct');
        }
        if (k.code === 'strong-dignity-combust') {
          expect(['Exalted', 'Own sign', 'Moolatrikona']).toContain(val(fact.dignity(k.planet!)));
          expect(val(fact.combust(k.planet!))).toBe(true);
        }
        if (k.code === 'yogakaraka-negative-occupant') expect(items.every((a) => a.metadata.ruleId === 'house.occupant.malefic' && a.item.direction === 'negative')).toBe(true);
        if (k.kind === 'needs-validation' || k.kind === 'formation-vs-effectiveness' || k.kind === 'natural-vs-functional') expect(k.validationQuestion).toBeTruthy();
      }
    }
    for (const s of ['repeated-fact:shared-dependency', 'same-fact-opposing-readings:incompatible-claim', 'same-fact-opposing-readings:opposing-natal-readings',
      'natal-vs-period:natal-vs-timing', 'natural-vs-functional:natural-vs-functional', 'yoga-with-weak-participant:formation-vs-effectiveness']) expect(seen).toContain(s);
  });

  it('is deterministic, with stable ids', async () => {
    const [c, d] = await charts(2);
    const a = JSON.stringify(planetaryReasoning(c, asOf));
    planetaryReasoning(d, asOf);
    expect(JSON.stringify(planetaryReasoning(c, asOf))).toBe(a);
    const ids = planetaryReasoning(c, asOf).contradictions.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/** The seed-99 approximate sample (72 charts) used to measure PR #98–#102, rebuilt here. */
function seed99Approximate() {
  const places: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [22.5726, 88.3639], [26.9124, 75.7873], [51.5074, -0.1278], [40.7128, -74.006], [-33.8688, 151.2093], [1.3521, 103.8198]];
  const pad = (n: number) => String(n).padStart(2, '0');
  let seed = 99; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const perAsc = new Array(12).fill(0);
  const out: Array<{ date: string; latitude: number; longitude: number }> = [];
  let i = 0, kept = 0;
  while (perAsc.some((n) => n < 28)) {
    const y = 1940 + Math.floor(rnd() * 70), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
    const hh = Math.floor(rnd() * 24), mm = Math.floor(rnd() * 60);
    const [latitude, longitude] = places[i++ % places.length];
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const c = computeCanonicalChart(resolveBirthWithCoordinates({ date, time: `${pad(hh)}:${pad(mm)}`, latitude, longitude, timeAccuracy: 'exact' }), { calculatedAt: asOf });
    if (perAsc[c.ascendant.signIndex] >= 28) continue;
    perAsc[c.ascendant.signIndex]++;
    kept++;
    if (out.length < 72 && kept % 4 === 0) out.push({ date, latitude, longitude });
  }
  return out;
}

describe('approximate time: the same at every moment of the birth date', () => {
  it('72 charts × 9 times: identical fact identities, facts, evidence, findings and contradictions; nothing withheld exposed', () => {
    const times = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '23:59'];
    const sample = seed99Approximate();
    expect(sample.length).toBe(72);
    for (const input of sample) {
      const views = times.map((time) => {
        const chart = computeCanonicalChart(resolveBirthWithCoordinates({ ...input, time, timeAccuracy: 'approximate' }), { calculatedAt: asOf });
        const r = reasoningInput(chart, asOf);
        const pr = planetaryReasoningFrom(r);
        const facts = Array.from(r.facts.facts.values());
        for (const f of facts) if (!f.reliable) expect('value' in f, f.id).toBe(false);
        return JSON.stringify({
          ids: facts.map((f) => f.id), facts, evidence: r.evidence.map((e) => [e.item, e.metadata]), dependencies: Array.from(r.dependencies),
          unresolved: r.unresolved, findings: pr.findings, contradictions: pr.contradictions, stats: pr.stats,
        });
      });
      for (const v of views) expect(v, `${input.date}`).toBe(views[0]);
    }
  }, 180_000);
});

describe('shadow mode', () => {
  it('changes no chart, evidence, insight or remedy, and logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    for (const c of [...await charts(6), ...await charts(4, 'approximate')]) {
      const chart = JSON.stringify(c);
      const insights = JSON.stringify(buildInsights(c, asOf));
      planetaryReasoning(c, asOf);
      expect(JSON.stringify(c)).toBe(chart);
      expect(JSON.stringify(buildInsights(c, asOf))).toBe(insights);
    }
    for (const s of spies) { expect(s).not.toHaveBeenCalled(); s.mockRestore(); }
  });

  it('no route, agent, prompt or client code imports it', () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p); } };
    walk('server'); walk('client/src'); walk('shared');
    const users = files.filter((f) => !f.includes(join('astroEngine', 'reasoning')) && /reasoning\/(planetary|planetFindings|contradictions)/.test(readFileSync(f, 'utf8')));
    expect(users).toEqual([]);
  });
});
