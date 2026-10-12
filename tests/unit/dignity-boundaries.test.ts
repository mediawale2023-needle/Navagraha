// Dignity against an independently entered reference table, and the read-time correction for
// charts saved under the old rule. Reference: BPHS ch. 3 (Graha Guna Svarupa), R. Santhanam's
// translation — exaltation and debilitation signs, Moolatrikona ranges, own signs — and BPHS
// ch. 3 natural relationships. An exaltation range includes its peak (the Moon at exactly 3°00′
// Taurus and Mercury at exactly 15°00′ Virgo are exalted); every other range is half-open, so a
// boundary degree belongs to the range that starts there (Mercury at exactly 20°00′ Virgo is own sign).
import { describe, expect, it } from 'vitest';
import { computeDignities, dignityAt } from '../../server/astroEngine/dignity';
import { getKundli } from '../../server/astroEngine/index';
import { withCurrentDignityRules } from '../../server/astroEngine/canonical/upgrade';
import type { CanonicalChart } from '../../shared/v3/canonical';

const SIGN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] as const;
type Sign = typeof SIGN[number];
type Range = [from: number, to: number];

const REFERENCE: Record<string, {
  exalted: [Sign, Range]; debilitated: Sign; moolatrikona: [Sign, Range]; own: Sign[];
  friends: string[]; enemies: string[];
}> = {
  Sun:     { exalted: ['Aries', [0, 30]],     debilitated: 'Libra',     moolatrikona: ['Leo', [0, 20]],         own: ['Leo'],                    friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon:    { exalted: ['Taurus', [0, 3]],     debilitated: 'Scorpio',   moolatrikona: ['Taurus', [3, 30]],      own: ['Cancer'],                 friends: ['Sun', 'Mercury'],          enemies: [] },
  Mars:    { exalted: ['Capricorn', [0, 30]], debilitated: 'Cancer',    moolatrikona: ['Aries', [0, 12]],       own: ['Aries', 'Scorpio'],       friends: ['Sun', 'Moon', 'Jupiter'],  enemies: ['Mercury'] },
  Mercury: { exalted: ['Virgo', [0, 15]],     debilitated: 'Pisces',    moolatrikona: ['Virgo', [15, 20]],      own: ['Gemini', 'Virgo'],        friends: ['Sun', 'Venus'],            enemies: ['Moon'] },
  Jupiter: { exalted: ['Cancer', [0, 30]],    debilitated: 'Capricorn', moolatrikona: ['Sagittarius', [0, 10]], own: ['Sagittarius', 'Pisces'],  friends: ['Sun', 'Moon', 'Mars'],     enemies: ['Mercury', 'Venus'] },
  Venus:   { exalted: ['Pisces', [0, 30]],    debilitated: 'Virgo',     moolatrikona: ['Libra', [0, 15]],       own: ['Taurus', 'Libra'],        friends: ['Mercury', 'Saturn'],       enemies: ['Sun', 'Moon'] },
  Saturn:  { exalted: ['Libra', [0, 30]],     debilitated: 'Aries',     moolatrikona: ['Aquarius', [0, 20]],    own: ['Capricorn', 'Aquarius'],  friends: ['Mercury', 'Venus'],        enemies: ['Sun', 'Moon', 'Mars'] },
};
const LORD: Record<Sign, string> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon', Leo: 'Sun', Virgo: 'Mercury',
  Libra: 'Venus', Scorpio: 'Mars', Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
};
const within = ([from, to]: Range, deg: number) => deg >= from && deg < to;
const withinPeak = ([from, peak]: Range, deg: number) => deg >= from && deg <= peak;

function expected(planet: string, sign: Sign, deg: number): string {
  const r = REFERENCE[planet];
  if (r.exalted[0] === sign && withinPeak(r.exalted[1], deg)) return 'Exalted';
  if (r.debilitated === sign) return 'Debilitated';
  if (r.moolatrikona[0] === sign && within(r.moolatrikona[1], deg)) return 'Moolatrikona';
  if (r.own.includes(sign)) return 'Own sign';
  if (r.friends.includes(LORD[sign])) return "Friend's sign";
  if (r.enemies.includes(LORD[sign])) return "Enemy's sign";
  return 'Neutral sign';
}

const PLANETS = Object.keys(REFERENCE);
/** Every 0.25° plus a point just either side of every range edge in the table. */
function degreesToCheck(): number[] {
  const edges = new Set<number>([0, 30]);
  for (const r of Object.values(REFERENCE)) for (const [a, b] of [r.exalted[1], r.moolatrikona[1]]) { edges.add(a); edges.add(b); }
  const out = new Set<number>();
  for (let d = 0; d < 30; d += 0.25) out.add(d);
  for (const e of Array.from(edges)) for (const x of [e - 1e-9, e, e + 1e-9]) if (x >= 0 && x < 30) out.add(x);
  return Array.from(out).sort((a, b) => a - b);
}

describe('dignity matches the BPHS reference table for every planet, sign and degree', () => {
  const degrees = degreesToCheck();

  it('dignityAt: 7 planets × 12 signs × every 0.25° and every range edge', () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const planet of PLANETS) for (let s = 0; s < 12; s++) for (const deg of degrees) {
      checked++;
      const got = dignityAt(planet, s, deg);
      const want = expected(planet, SIGN[s], deg);
      if (got !== want) mismatches.push(`${planet} ${SIGN[s]} ${deg}: got ${got}, want ${want}`);
    }
    expect(checked).toBeGreaterThan(7 * 12 * 120);
    expect(mismatches).toEqual([]);
  });

  it('computeDignities agrees with the table from absolute longitudes', () => {
    const mismatches: string[] = [];
    for (const planet of PLANETS) for (let s = 0; s < 12; s++) for (const deg of degrees) {
      const lon = s * 30 + deg;
      const sidereal = Object.fromEntries(PLANETS.map((p) => [p, p === planet ? lon : 0]));
      const row = computeDignities(sidereal, 0, {}).find((r) => r.planet === planet)!;
      // Degrees within float rounding of a sign edge are judged by the sign the longitude falls in.
      const s2 = Math.floor((((lon % 360) + 360) % 360) / 30) % 12;
      const d2 = (((lon % 360) + 360) % 360) % 30;
      const want = expected(planet, SIGN[s2], d2);
      if (row.dignity !== want) mismatches.push(`${planet} ${lon}: got ${row.dignity}, want ${want}`);
    }
    expect(mismatches).toEqual([]);
  });

  it.each([
    ['Moon', 1, 2.999, 'Exalted'], ['Moon', 1, 3, 'Exalted'], ['Moon', 1, 3.0001, 'Moolatrikona'], ['Moon', 1, 20, 'Moolatrikona'], ['Moon', 1, 29.99, 'Moolatrikona'],
    ['Moon', 3, 10, 'Own sign'], ['Moon', 7, 10, 'Debilitated'],
    ['Mercury', 5, 0, 'Exalted'], ['Mercury', 5, 14.999, 'Exalted'], ['Mercury', 5, 15, 'Exalted'], ['Mercury', 5, 15.0001, 'Moolatrikona'], ['Mercury', 5, 19.999, 'Moolatrikona'],
    ['Mercury', 5, 20, 'Own sign'], ['Mercury', 5, 29.99, 'Own sign'], ['Mercury', 2, 10, 'Own sign'], ['Mercury', 11, 10, 'Debilitated'],
  ] as const)('%s in %s at %s° is %s', (planet, sign, deg, want) => {
    expect(dignityAt(planet, sign, deg)).toBe(want);
  });
});

describe('charts saved under the old rule are served with the current dignity', () => {
  // Real charts: Mercury at Virgo 29.44° in the 1st house (Bhadra Yoga), and the Moon at Taurus 23.76°.
  const chartFor = async (date: string, time: string) =>
    (await getKundli(date, time, 28.6139, 77.209, { timeAccuracy: 'exact' })) as unknown as { chartData: Record<string, any> };

  /** What a chart saved before this fix holds: Mercury in Virgo and the Moon in Taurus stored as "Exalted". */
  function savedUnderOldRule(kundli: { chartData: Record<string, any> }) {
    const chart = kundli.chartData.canonical as CanonicalChart;
    const old = (d: CanonicalChart['strength']['dignities'][number]) =>
      (d.planet === 'Mercury' && d.sign === 'Virgo') || (d.planet === 'Moon' && d.sign === 'Taurus') ? { ...d, dignity: 'Exalted' as const } : d;
    const dignities = chart.strength.dignities.map(old);
    const yogas = chart.yogas.map((y) => (y.name === 'Bhadra Yoga' ? { ...y, description: y.description.replace(/is \w[\w ]* in a kendra/, 'is Exalted in a kendra') } : y));
    const canonical = { ...chart, strength: { ...chart.strength, dignities }, yogas };
    return { ...kundli, chartData: { ...kundli.chartData, canonical, dignities, yogas } };
  }

  it('Mercury late in Virgo: stored "Exalted" is served as "Own sign", and the Bhadra Yoga text follows', async () => {
    const fresh = await chartFor('1990-10-19', '06:00');
    const freshChart = fresh.chartData.canonical as CanonicalChart;
    const mercury = freshChart.planets.find((p) => p.name === 'Mercury')!;
    expect([mercury.sign, mercury.house, +(mercury.longitude % 30).toFixed(2)]).toEqual(['Virgo', 1, 29.44]);
    expect(freshChart.strength.dignities.find((d) => d.planet === 'Mercury')!.dignity).toBe('Own sign');

    const saved = savedUnderOldRule(fresh);
    expect(saved.chartData.canonical.strength.dignities.find((d: any) => d.planet === 'Mercury').dignity).toBe('Exalted');
    const served = withCurrentDignityRules(saved as any) as any;
    expect(served.chartData.canonical.strength.dignities).toEqual(freshChart.strength.dignities);
    expect(served.chartData.dignities).toEqual(freshChart.strength.dignities);
    // The yoga set is unchanged; only the dignity named in its description.
    expect(served.chartData.canonical.yogas).toEqual(freshChart.yogas);
    expect(served.chartData.yogas).toEqual(freshChart.yogas);
    expect(served.chartData.canonical.yogas.find((y: any) => y.name === 'Bhadra Yoga').description).toMatch(/^Mercury is Own sign in a kendra \(house 1\)/);
  });

  it('the Moon in Taurus past 3°: stored "Exalted" is served as "Moolatrikona"', async () => {
    const fresh = await chartFor('1991-06-12', '12:00');
    const chart = fresh.chartData.canonical as CanonicalChart;
    const moon = chart.planets.find((p) => p.name === 'Moon')!;
    expect(moon.sign).toBe('Taurus');
    expect(moon.longitude % 30).toBeGreaterThan(3);
    const served = withCurrentDignityRules(savedUnderOldRule(fresh) as any) as any;
    expect(served.chartData.canonical.strength.dignities.find((d: any) => d.planet === 'Moon').dignity).toBe('Moolatrikona');
  });

  it('is idempotent and returns a current chart unchanged (same object)', async () => {
    const fresh = await chartFor('1990-10-19', '06:00');
    expect(withCurrentDignityRules(fresh as any)).toBe(fresh);
    const once = withCurrentDignityRules(savedUnderOldRule(fresh) as any);
    expect(withCurrentDignityRules(once)).toBe(once);
  });

  it('leaves non-V3 rows alone', () => {
    const legacy = { chartData: { planetaryPositions: [] } };
    expect(withCurrentDignityRules(legacy as any)).toBe(legacy);
  });
});
