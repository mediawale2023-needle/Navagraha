// Ashtakavarga against an independently entered reference: BPHS ch. 66 as tabulated by B.V. Raman
// ("Ashtakavarga System of Prediction"). Four cells differ between classical sources; each is pinned to
// the reading the engine uses and named here, so a change to any of them is a deliberate decision:
//  - Moon from Jupiter: BPHS ch. 66 and Varahamihira give the 12th from Jupiter; Phaladeepika ch. 23 v. 4
//    gives the 2nd. The engine uses the 2nd (as does PyJHora). Undecided: needs approval to change.
//  - Moon from Moon / Moon from Mars: PyJHora moves the 9th from the Mars row to the Moon row; BPHS/Raman
//    and the engine do not.
//  - Venus from Mars: PyJHora gives 3,4,6,9,11,12; BPHS/Raman and the engine give 3,5,6,9,11,12.
// Every reading keeps the classical totals (Moon 49, Venus 52, 337 in all).
import { describe, expect, it } from 'vitest';
import { AV_CANONICAL_TOTALS, AV_PLANETS, computeAshtakavarga } from '../../server/astroEngine/ashtakavarga';
import { getKundli } from '../../server/astroEngine/index';
import type { CanonicalChart } from '../../shared/v3/canonical';

const CONTRIBUTORS = [...AV_PLANETS, 'Ascendant'] as const;

const BPHS_RAMAN: Record<string, Record<string, number[]>> = {
  Sun:     { Sun: [1, 2, 4, 7, 8, 9, 10, 11], Moon: [3, 6, 10, 11], Mars: [1, 2, 4, 7, 8, 9, 10, 11], Mercury: [3, 5, 6, 9, 10, 11, 12], Jupiter: [5, 6, 9, 11], Venus: [6, 7, 12], Saturn: [1, 2, 4, 7, 8, 9, 10, 11], Ascendant: [3, 4, 6, 10, 11, 12] },
  Moon:    { Sun: [3, 6, 7, 8, 10, 11], Moon: [1, 3, 6, 7, 10, 11], Mars: [2, 3, 5, 6, 9, 10, 11], Mercury: [1, 3, 4, 5, 7, 8, 10, 11], Jupiter: [1, 4, 7, 8, 10, 11, 12], Venus: [3, 4, 5, 7, 9, 10, 11], Saturn: [3, 5, 6, 11], Ascendant: [3, 6, 10, 11] },
  Mars:    { Sun: [3, 5, 6, 10, 11], Moon: [3, 6, 11], Mars: [1, 2, 4, 7, 8, 10, 11], Mercury: [3, 5, 6, 11], Jupiter: [6, 10, 11, 12], Venus: [6, 8, 11, 12], Saturn: [1, 4, 7, 8, 9, 10, 11], Ascendant: [1, 3, 6, 10, 11] },
  Mercury: { Sun: [5, 6, 9, 11, 12], Moon: [2, 4, 6, 8, 10, 11], Mars: [1, 2, 4, 7, 8, 9, 10, 11], Mercury: [1, 3, 5, 6, 9, 10, 11, 12], Jupiter: [6, 8, 11, 12], Venus: [1, 2, 3, 4, 5, 8, 9, 11], Saturn: [1, 2, 4, 7, 8, 9, 10, 11], Ascendant: [1, 2, 4, 6, 8, 10, 11] },
  Jupiter: { Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], Moon: [2, 5, 7, 9, 11], Mars: [1, 2, 4, 7, 8, 10, 11], Mercury: [1, 2, 4, 5, 6, 9, 10, 11], Jupiter: [1, 2, 3, 4, 7, 8, 10, 11], Venus: [2, 5, 6, 9, 10, 11], Saturn: [3, 5, 6, 12], Ascendant: [1, 2, 4, 5, 6, 7, 9, 10, 11] },
  Venus:   { Sun: [8, 11, 12], Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12], Mars: [3, 5, 6, 9, 11, 12], Mercury: [3, 5, 6, 9, 11], Jupiter: [5, 8, 9, 10, 11], Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11], Saturn: [3, 4, 5, 8, 9, 10, 11], Ascendant: [1, 2, 3, 4, 5, 8, 9, 11] },
  Saturn:  { Sun: [1, 2, 4, 7, 8, 10, 11], Moon: [3, 6, 11], Mars: [3, 5, 6, 10, 11, 12], Mercury: [6, 8, 9, 10, 11, 12], Jupiter: [5, 6, 11, 12], Venus: [6, 11, 12], Saturn: [3, 5, 6, 11], Ascendant: [1, 3, 4, 6, 10, 11] },
};

/** The reading the engine uses where classical sources differ. */
const ENGINE_READING: Record<string, number[]> = {
  'Moon from Jupiter': [1, 2, 4, 7, 8, 10, 11], // Phaladeepika ch. 23 v. 4; BPHS ch. 66 gives [1, 4, 7, 8, 10, 11, 12]
};
const expectedRow = (planet: string, contributor: string) =>
  ENGINE_READING[`${planet} from ${contributor}`] ?? BPHS_RAMAN[planet][contributor];

/** The planet's Bhinnashtakavarga with a single contributor placed in `sign`. */
const alone = (planet: string, contributor: string, sign: number) => computeAshtakavarga({ [contributor]: sign }).bav[planet];

describe('every Bhinnashtakavarga row, from every sign', () => {
  it('matches the reference for all 56 rows × 12 contributor signs', () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const planet of AV_PLANETS) for (const contributor of CONTRIBUTORS) for (let sign = 0; sign < 12; sign++) {
      checked++;
      const want = new Array(12).fill(0);
      for (const h of expectedRow(planet, contributor)) want[(sign + h - 1) % 12] = 1;
      const got = alone(planet, contributor, sign);
      if (got.join() !== want.join()) mismatches.push(`${planet} from ${contributor} in sign ${sign}: ${got.join('')} ≠ ${want.join('')}`);
    }
    expect(checked).toBe(56 * 12);
    expect(mismatches).toEqual([]);
  });

  it('agrees with BPHS/Raman on every row except the one disputed cell', () => {
    const differing = AV_PLANETS.flatMap((planet) => CONTRIBUTORS
      .filter((c) => alone(planet, c, 0).flatMap((v, s) => (v ? [s + 1] : [])).join() !== BPHS_RAMAN[planet][c].join())
      .map((c) => `${planet} from ${c}`));
    expect(differing).toEqual(['Moon from Jupiter']);
  });

  it('the disputed cell differs only between the 2nd and the 12th from Jupiter, keeping the Moon at 49', () => {
    const engine = alone('Moon', 'Jupiter', 0).flatMap((v, s) => (v ? [s + 1] : []));
    const bphs = BPHS_RAMAN.Moon.Jupiter;
    expect(engine.filter((h) => !bphs.includes(h))).toEqual([2]);
    expect(bphs.filter((h) => !engine.includes(h))).toEqual([12]);
    expect(engine).toHaveLength(bphs.length);
  });

  it('each row gives the reference number of bindus, and the eight rows give the classical total', () => {
    for (const planet of AV_PLANETS) {
      let total = 0;
      for (const contributor of CONTRIBUTORS) {
        const n = alone(planet, contributor, 5).reduce((a, b) => a + b, 0);
        expect(n, `${planet} from ${contributor}`).toBe(BPHS_RAMAN[planet][contributor].length);
        total += n;
      }
      expect(total, planet).toBe(AV_CANONICAL_TOTALS[planet]);
    }
  });
});

describe('whole charts', () => {
  // A deterministic spread of placements: every contributor in every sign, in shifting combinations.
  const placements = Array.from({ length: 2000 }, (_, i) =>
    Object.fromEntries(CONTRIBUTORS.map((c, k) => [c, (i * (k + 3) + Math.floor(i / 12) * (2 * k + 1) + k * 5) % 12])));

  it('totals, SAV and per-sign bounds hold for every placement', () => {
    for (const p of placements) {
      const av = computeAshtakavarga(p);
      for (const planet of AV_PLANETS) {
        expect(av.totals[planet]).toBe(AV_CANONICAL_TOTALS[planet]);
        expect(av.bav[planet].every((v) => v >= 0 && v <= 8)).toBe(true);
      }
      expect(av.sav).toEqual(av.sav.map((_, s) => AV_PLANETS.reduce((n, planet) => n + av.bav[planet][s], 0)));
      expect(av.savTotal).toBe(337);
      expect(av.sav.every((v) => v >= 0 && v <= 56)).toBe(true);
    }
  });

  it('moving every contributor on by k signs moves every row on by k signs', () => {
    for (const p of placements.slice(0, 200)) for (const k of [1, 5, 11]) {
      const shifted = Object.fromEntries(Object.entries(p).map(([c, s]) => [c, (s + k) % 12]));
      const a = computeAshtakavarga(p), b = computeAshtakavarga(shifted);
      const rot = (arr: number[]) => arr.map((_, s) => arr[(s - k + 12) % 12]);
      expect(b.sav).toEqual(rot(a.sav));
      for (const planet of AV_PLANETS) expect(b.bav[planet]).toEqual(rot(a.bav[planet]));
    }
  });

  it('the canonical chart stores SAV by house counted from the Lagna', async () => {
    const chart = (await getKundli('1995-11-02', '08:15', 20.7085, 76.5647, { timeAccuracy: 'exact' })).chartData.canonical as CanonicalChart;
    const { sav, savByHouse } = chart.strength.ashtakavarga;
    expect(savByHouse).toEqual(sav.map((_, h) => sav[(chart.ascendant.signIndex + h) % 12]));
    const signs = Object.fromEntries(chart.planets.filter((p) => (AV_PLANETS as readonly string[]).includes(p.name)).map((p) => [p.name, p.signIndex]));
    expect(computeAshtakavarga({ ...signs, Ascendant: chart.ascendant.signIndex }).sav).toEqual(sav);
  });
});
