// Approximate birth time (PR #98). An approximate chart is calculated at a placeholder time, but the
// person could have been born at any moment of the local birth date. Nothing shown to the user or
// given to the AI may change with the moment chosen; exact-time charts are unaffected.
import { describe, expect, it } from 'vitest';
import { getKundli, transitsForChart, transitSummary } from '../../server/astroEngine/index';
import { birthDayStability } from '../../server/astroEngine/canonical/birthDay';
import { withApproximateTimeView, withCurrentDignityRules, withCurrentDoshaRules, withReconciledRemedies } from '../../server/astroEngine/canonical/upgrade';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { natalEvidence } from '../../server/astroEngine/evidence/engine';
import { buildEvidencePacket, deterministicAnswer, routeQuestion } from '../../server/agents/askKundli';
import { validateAnswer } from '../../server/agents/answerGuard';
import { chartSummary } from '../../server/aiAstrologerService';
import { exactTimeRequiredReason } from '../../server/reportEligibility';
import { approximateDasha } from '../../client/src/lib/dashaTimeline';
import { chartTabView } from '../../client/src/lib/approximateChart';
import { grahaCards } from '../../client/src/components/kundli/GrahaGrid';
import { planetLine } from '../../client/src/components/AIInsightSheet';
import type { CanonicalChart } from '../../shared/v3/canonical';

const asOf = new Date('2026-10-12T06:00:00Z');
const pad = (n: number) => String(n).padStart(2, '0');

/** A stored chart as the routes serve it (currentChart's read-time view). */
async function served(date: string, time: string, lat: number, lng: number, timeAccuracy: 'exact' | 'approximate') {
  const nk: any = await getKundli(date, time, lat, lng, { timeAccuracy });
  const row: any = {
    id: 'k', name: 'Test', dateOfBirth: date, timeOfBirth: time, placeOfBirth: 'Test place',
    zodiacSign: nk.zodiacSign, moonSign: nk.moonSign, ascendant: nk.ascendant,
    chartData: { ...nk.chartData, isBirthTimeApproximate: timeAccuracy === 'approximate' }, dashas: nk.dashas, doshas: nk.doshas, remedies: nk.remedies,
  };
  return withApproximateTimeView(withReconciledRemedies(withCurrentDoshaRules(withCurrentDignityRules(row)))) as any;
}
const canonicalOf = (row: any) => row.chartData.canonical as CanonicalChart;

/** Everything a user or the model sees for a chart, with the placeholder time itself normalised out. */
function surface(row: any) {
  const c = canonicalOf(row);
  const ins = buildInsights(c, asOf);
  const transits = transitSummary(transitsForChart(c, row.chartData.ashtakavarga?.sav, asOf));
  const norm = (x: string) => x.split(c.birth.localTime.slice(0, 5)).join('HH:MM').split(row.timeOfBirth).join('HH:MM');
  return {
    verdicts: JSON.stringify(ins.domains.map((d) => [d.verdict, d.confidence, d.conclusion, d.notes, ...d.supporting.map((e) => e.explanation), ...d.conflicting.map((e) => e.explanation), ...d.experimental.map((e) => e.explanation)])),
    headline: JSON.stringify(ins.headline),
    timing: JSON.stringify(ins.timing),
    periods: JSON.stringify(ins.timeline.map((p) => `${p.lord}:${p.whyItMatters}`).sort()),
    transits,
    packet: ['Will my career grow?', 'When will I marry?', 'Tell me about Venus'].map((q) => {
      const p = buildEvidencePacket(c, routeQuestion(q), asOf, transits);
      return norm(p.text) + norm(deterministicAnswer(p));
    }).join('\n'),
    aiContext: norm(chartSummary(row).replace(/Running period TODAY[^\n]*/, '')),
    remedies: JSON.stringify(row.remedies),
    stability: JSON.stringify(row.chartData.timeStability),
  };
}

// Boundary days: the Moon changes sign (1958-04-28, 1992-09-24), the Sun changes sign and becomes
// debilitated (2019-10-17), Mercury moves from exaltation into Moolatrikona (1992-09-24), Venus
// stations (1996-07-02), Mangal Dosha flips with the Lagna (1986-07-26), a debilitated Mercury's
// Neecha Bhanga depends on the Lagna (1958-04-28), and the Moon keeps one nakshatra (1990-01-16).
const DAYS: Array<[string, number, number]> = [
  ['1958-04-28', 22.5726, 88.3639], ['2019-10-17', 40.7128, -74.006], ['1992-09-24', 20.7085, 76.5647],
  ['1996-07-02', 20.7085, 76.5647], ['1986-07-26', 28.6139, 77.209], ['1990-01-16', 28.6139, 77.209],
];

describe('approximate birth time: nothing shown changes with the moment of birth', () => {
  it.each(DAYS)('%s: verdicts, evidence, AI context, Ask packet, transits and remedies are the same all day', async (date, lat, lng) => {
    const base = surface(await served(date, '06:00', lat, lng, 'approximate'));
    for (let m = 0; m <= 24 * 60; m += 45) {
      const time = m >= 24 * 60 ? '23:59' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const s = surface(await served(date, time, lat, lng, 'approximate'));
      for (const key of Object.keys(base) as Array<keyof typeof base>) expect(s[key], `${key} at ${time}`).toBe(base[key]);
    }
  }, 120_000);
});

describe('which facts hold all day', () => {
  it('finds the boundary in each case, and never calls a changing fact stable', async () => {
    const st = async (d: string, la: number, lo: number) => birthDayStability(canonicalOf(await served(d, '06:00', la, lo, 'approximate')));
    const moonDay = await st('1958-04-28', 22.5726, 88.3639);
    expect(moonDay.planets.Moon.sign).toBe(false);
    expect(moonDay.planets.Moon.signs).toEqual(['Cancer', 'Leo']);
    const sunDay = await st('2019-10-17', 40.7128, -74.006);
    expect([sunDay.planets.Sun.sign, sunDay.planets.Sun.dignity, sunDay.planets.Moon.sign]).toEqual([false, false, true]);
    expect(sunDay.planets.Sun.signs).toEqual(['Virgo', 'Libra']);
    const mercuryDay = await st('1992-09-24', 20.7085, 76.5647);
    expect([mercuryDay.planets.Mercury.sign, mercuryDay.planets.Mercury.dignity]).toEqual([true, false]);
    // A station: every fact about the planet is treated as unknown.
    const venusDay = await st('1996-07-02', 20.7085, 76.5647);
    expect(venusDay.planets.Venus).toMatchObject({ retrograde: false, sign: false, dignity: false, combust: false });
  });

  it('agrees with dense sampling: a fact called stable never changes across the day', async () => {
    for (const [date, lat, lng] of DAYS) {
      const base = canonicalOf(await served(date, '06:00', lat, lng, 'approximate'));
      const st = birthDayStability(base);
      for (let m = 0; m < 24 * 60; m += 20) {
        const c = canonicalOf(await served(date, `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, lat, lng, 'approximate'));
        for (const p of c.planets) {
          const b = base.planets.find((x) => x.name === p.name)!;
          const f = st.planets[p.name];
          if (f.sign) expect(p.sign, `${date} ${p.name} sign`).toBe(b.sign);
          if (f.nakshatra) expect(p.nakshatra.name, `${date} ${p.name} nakshatra`).toBe(b.nakshatra.name);
          if (f.retrograde) expect(p.retrograde, `${date} ${p.name} retrograde`).toBe(b.retrograde);
        }
        for (const d of c.strength.dignities) {
          const b = base.strength.dignities.find((x) => x.planet === d.planet)!;
          if (st.planets[d.planet].dignity) expect(d.dignity, `${date} ${d.planet} dignity`).toBe(b.dignity);
          if (st.planets[d.planet].combust) expect(d.combust, `${date} ${d.planet} combust`).toBe(b.combust);
        }
      }
    }
  }, 120_000);

  it('reports every fact as stable for an exact time, without calculating', async () => {
    const st = birthDayStability(canonicalOf(await served('2019-10-17', '15:40', 40.7128, -74.006, 'exact')));
    expect(Object.values(st.planets).every((f) => f.sign && f.nakshatra && f.dignity && f.combust && f.retrograde)).toBe(true);
  });
});

describe('Ashtakavarga (AT-01)', () => {
  it('states no per-sign SAV in transits for an approximate time, and the canonical SAV for an exact one', async () => {
    const approx = await served('1986-07-26', '06:00', 28.6139, 77.209, 'approximate');
    const t = transitsForChart(canonicalOf(approx), approx.chartData.ashtakavarga.sav, asOf);
    expect(t.planets.every((p) => p.sav === null)).toBe(true);
    expect(transitSummary(t)).not.toMatch(/SAV/);
    const exact = await served('1986-07-26', '06:00', 28.6139, 77.209, 'exact');
    const sav = exact.chartData.ashtakavarga.sav as number[];
    const te = transitsForChart(canonicalOf(exact), sav, asOf);
    for (const p of te.planets) expect(p.sav).toBe(sav[['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'].indexOf(p.sign)]);
  });
});

describe('evidence and AI context (AT-04 to AT-12, AT-18)', () => {
  it('a debilitated significator whose Neecha Bhanga needs the Lagna is not counted for an approximate time', async () => {
    const approx = canonicalOf(await served('1958-04-28', '06:00', 22.5726, 88.3639, 'approximate'));
    expect(approx.strength.dignities.find((d) => d.planet === 'Mercury')).toMatchObject({ dignity: 'Debilitated', neechaBhanga: true });
    const item = natalEvidence(approx, 'education').find((e) => e.factor === 'Mercury as significator')!;
    expect(item.usable).toBe(false);
    const exact = canonicalOf(await served('1958-04-28', '06:00', 22.5726, 88.3639, 'exact'));
    expect(natalEvidence(exact, 'education').find((e) => e.factor === 'Mercury as significator')!.usable).toBe(true);
  });

  it('the AI chart context states no house-based yoga, Mangal Dosha, Neecha Bhanga, degree or unstable sign', async () => {
    const row = await served('1958-04-28', '06:00', 22.5726, 88.3639, 'approximate');
    const text = chartSummary(row);
    for (const banned of [/Raja Yoga/, /Vipreeta/, /Neecha Bhanga —/, /Kemadruma/, /mangalDosha/, /°/, /House \d/, /Moon Sign \(Rashi\): Cancer/]) expect(text).not.toMatch(banned);
    expect(text).toMatch(/Moon Sign \(Rashi\): sign UNCERTAIN \(Cancer or Leo/);
    expect(text).toMatch(/Time of Birth: unknown \(06:00 was used only as a placeholder/);
    // An exact time keeps the full context.
    const exact = chartSummary(await served('1958-04-28', '06:00', 22.5726, 88.3639, 'exact'));
    expect(exact).toMatch(/Raja Yoga/);
    expect(exact).toMatch(/House \d/);
    expect(exact).toMatch(/Time of Birth: 06:00\n/);
  });

  it('the Ask packet gives no degree, pada, house or unstable sign, and dasha evidence quotes no house', async () => {
    const c = canonicalOf(await served('2019-10-17', '06:00', 40.7128, -74.006, 'approximate'));
    const p = buildEvidencePacket(c, routeQuestion('When does my career grow?'), asOf);
    expect(p.text).not.toMatch(/°|pada|\d(st|nd|rd|th) house/);
    expect(p.text).toMatch(/- Sun: sign UNCERTAIN \(Virgo or Libra/);
    expect(p.text).toMatch(/time UNKNOWN/);
  });

  it('withholds an unstable Moon or Sun sign from the insights headline', async () => {
    expect(buildInsights(canonicalOf(await served('1958-04-28', '06:00', 22.5726, 88.3639, 'approximate')), asOf).headline.moonSign).toBeNull();
    expect(buildInsights(canonicalOf(await served('2019-10-17', '06:00', 40.7128, -74.006, 'approximate')), asOf).headline.sunSign).toBeNull();
    expect(buildInsights(canonicalOf(await served('2019-10-17', '06:00', 40.7128, -74.006, 'exact')), asOf).headline.sunSign).toBe('Virgo');
  });

  it('quotes no period length for an approximate time (the birth period depends on the time)', async () => {
    const ins = buildInsights(canonicalOf(await served('1986-07-26', '06:00', 28.6139, 77.209, 'approximate')), asOf);
    for (const p of ins.timeline) expect(p.whyItMatters).not.toMatch(/\d-year/);
  });
});

describe('answer guard (AT-04, AT-07, AT-15, AT-16)', () => {
  const PROBES: Array<[string, RegExp]> = [
    ['Your Moon is in Cancer.', /sign is uncertain/],
    ['Your Moon sign is Leo.', /sign is uncertain/],
    ['You have Raja Yoga in your chart.', /cannot be stated with an approximate/],
    ['There is Neecha Bhanga for the debilitated planet.', /Neecha Bhanga is judged from the Lagna/],
    ['Your Venus Mahadasha begins in 2031.', /dasha dates depend on the exact birth time/],
    ['The Saturn dasha ends next year.', /dasha dates depend on the exact birth time/],
    ['Your 10th house has 34 bindus.', /houses and the Lagna|bindus/],
    ['Jupiter rules the seventh house.', /houses and the Lagna/],
    ['In your Navamsa, Venus is in Pisces.', /divisional-chart placements/],
    ['Mars is your Atmakaraka.', /Jaimini karakas/],
    ['Your Moon is at 12 degrees.', /degrees change/],
    ['Your birth nakshatra is Rohini, pada 2.', /pada|nakshatra/],
  ];
  it.each(PROBES)('approximate time refuses: %s', async (claim, issue) => {
    const c = canonicalOf(await served('1958-04-28', '06:00', 22.5726, 88.3639, 'approximate'));
    const issues = validateAnswer(claim, buildEvidencePacket(c, routeQuestion('career'), asOf).guard);
    expect(issues.some((i) => issue.test(i)), issues.join(' | ')).toBe(true);
  });

  it('refuses a non-Moon sign or dignity that changes during the day', async () => {
    const sun = canonicalOf(await served('2019-10-17', '06:00', 40.7128, -74.006, 'approximate'));
    expect(validateAnswer('The Sun is in Virgo.', buildEvidencePacket(sun, routeQuestion('career'), asOf).guard).join()).toMatch(/Sun's sign is uncertain/);
    const mercury = canonicalOf(await served('1992-09-24', '06:00', 20.7085, 76.5647, 'approximate'));
    expect(validateAnswer('Mercury is exalted.', buildEvidencePacket(mercury, routeQuestion('career'), asOf).guard).join()).toMatch(/Mercury's dignity state changes/);
  });

  it('accepts what an approximate time does support, and exact-time claims are judged as before', async () => {
    const c = canonicalOf(await served('1958-04-28', '06:00', 22.5726, 88.3639, 'approximate'));
    const g = buildEvidencePacket(c, routeQuestion('career'), asOf).guard;
    expect(validateAnswer('Saturn is a slow, disciplined planet that rewards patience.', g)).toEqual([]);
    expect(validateAnswer('I cannot give the dates of your next dasha.', g)).toEqual([]);
    const exact = canonicalOf(await served('1958-04-28', '06:00', 22.5726, 88.3639, 'exact'));
    const ge = buildEvidencePacket(exact, routeQuestion('career'), asOf).guard;
    for (const claim of ['You have Raja Yoga in your chart.', 'Mars is your Atmakaraka.', 'Your Moon is at 12 degrees.', 'Jupiter rules the seventh house.']) {
      expect(validateAnswer(claim, ge), claim).toEqual([]);
    }
  });
});

describe('birth-star remedies (AT-09)', () => {
  it('are withheld when the Moon changes nakshatra during the birth date, kept when it does not', async () => {
    const unstable = await served('1986-07-26', '06:00', 28.6139, 77.209, 'approximate');
    expect(canonicalOf(unstable).uncertainty.moonNakshatraStableAcrossBirthDate).toBe(false);
    expect(unstable.remedies).toEqual([]);
    const stable = await served('1990-01-16', '06:00', 28.6139, 77.209, 'approximate');
    expect(canonicalOf(stable).uncertainty.moonNakshatraStableAcrossBirthDate).toBe(true);
    expect(stable.remedies.length).toBeGreaterThan(0);
    expect(stable.remedies.some((r: any) => r.type === 'gemstone')).toBe(false);
    const exact = await served('1986-07-26', '06:00', 28.6139, 77.209, 'exact');
    expect(exact.remedies.length).toBeGreaterThan(0);
  });
});

describe('dasha display (AT-03)', () => {
  it('names the birth period only when the Moon kept one nakshatra, and gives standard lengths, never dates', async () => {
    const stable = approximateDasha(canonicalOf(await served('1990-01-16', '06:00', 28.6139, 77.209, 'approximate')))!;
    expect(stable.startKnown).toBe(true);
    expect(stable.sequence[0]).toEqual({ lord: 'Sun', years: 6, atBirth: true });
    const unstable = approximateDasha(canonicalOf(await served('1986-07-26', '06:00', 28.6139, 77.209, 'approximate')))!;
    expect(unstable.startKnown).toBe(false);
    expect(unstable.sequence.map((s) => s.lord)).toEqual(['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']);
    expect(unstable.sequence.some((s) => s.atBirth)).toBe(false);
    expect(unstable.sequence.reduce((n, s) => n + s.years, 0)).toBe(120);
    for (const d of [stable, unstable]) expect(d.explanation).not.toMatch(/\d{4}/);
    expect(approximateDasha(canonicalOf(await served('1986-07-26', '06:00', 28.6139, 77.209, 'exact')))).toBeNull();
  });
});

describe('client displays (AT-02, AT-07, AT-08, AT-15)', () => {
  it('draws no Chandra chart when any planet changes sign, and states no degree', async () => {
    const row = await served('2019-10-17', '06:00', 40.7128, -74.006, 'approximate');
    const view = chartTabView(canonicalOf(row), row.chartData.timeStability);
    expect(view.mode).toBe('table');
    if (view.mode !== 'table') return;
    expect(view.changedSign).toEqual(['Sun']);
    expect(view.rows.find((r) => r.planet === 'Sun')).toMatchObject({ signUncertain: true, signs: ['Virgo', 'Libra'] });
    expect(JSON.stringify(view)).not.toMatch(/degree/);
  });

  it('graha cards and the planet sheet state only what holds all day', async () => {
    const row = await served('1996-07-02', '06:00', 20.7085, 76.5647, 'approximate');
    const c = canonicalOf(row);
    const venus = grahaCards(c, { lagnaKnown: false, moonSignKnown: false, nakshatraKnown: false, stability: row.chartData.timeStability }).find((x) => x.planet === 'Venus')!;
    expect(venus).toMatchObject({ sign: 'Sign uncertain', dignity: null, nakshatra: null, retrograde: false });
    const line = planetLine({ kind: 'planet', planet: 'Moon', chart: c, evidence: [], stability: row.chartData.timeStability });
    expect(line).not.toMatch(/°|pada|house/);
    const exact = await served('1996-07-02', '06:00', 20.7085, 76.5647, 'exact');
    expect(planetLine({ kind: 'planet', planet: 'Moon', chart: canonicalOf(exact), evidence: [] })).toMatch(/°.*house.*pada/);
  });

  it('exact charts get no stability data at all', async () => {
    expect((await served('2019-10-17', '06:00', 40.7128, -74.006, 'exact')).chartData.timeStability).toBeUndefined();
  });
});

describe('paid reports (AT-13)', () => {
  it('refuses, with a reason, the reports whose purpose needs the houses or dasha dates', () => {
    for (const c of ['career', 'marriage', 'finance', 'year_ahead', 'life_complete']) expect(exactTimeRequiredReason(c)).toMatch(/not been charged/);
    expect(exactTimeRequiredReason('life')).toBeNull();
  });
});
