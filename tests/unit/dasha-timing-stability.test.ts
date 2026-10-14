/**
 * Approximate birth time: is the running Mahadasha/Antardasha the same for every moment of the local
 * birth date? The answer must come from the real Moon across the whole day, so it is the same whichever
 * placeholder time was stored. Ground truth here is a dense Swiss Ephemeris sweep of the day.
 */
import { describe, expect, it } from 'vitest';
import { offsetSecondsAt, resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { birthDayBounds, computeCanonicalChart, siderealPositions } from '../../server/astroEngine/canonical/compute';
import { vimshottariDasha } from '../../server/astroEngine/dasha';
import { dashaTimingStable, localBirthDate } from '../../server/astroEngine/evidence/engine';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { buildFactIndex } from '../../server/astroEngine/reasoning/factIndex';
import { fact } from '../../server/astroEngine/reasoning/facts';

const asOf = new Date('2026-10-13T06:00:00Z');
const MUMBAI = { latitude: 19.076, longitude: 72.8777 };
const TIMES = ['00:00', '00:05', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '23:55', '23:59'];

const chartAt = (date: string, time: string, timeAccuracy: 'exact' | 'approximate' = 'approximate', place = MUMBAI) =>
  computeCanonicalChart(resolveBirthWithCoordinates({ date, time, ...place, timeAccuracy }), { calculatedAt: asOf });

const lordsAt = (ms: number) => {
  const t = asOf.getTime();
  const v = vimshottariDasha(siderealPositions(new Date(ms)).bodies.Moon.longitude, new Date(ms));
  const maha = v.mahadashas.find((m) => Date.parse(m.start) <= t && t < Date.parse(m.end));
  const antar = maha?.antardashas.find((a) => Date.parse(a.start) <= t && t < Date.parse(a.end));
  return { maha: maha?.lord ?? null, antar: antar?.lord ?? null };
};

/** Every `stepMin` minutes across the local birth date, plus its last second. */
function sweep(date: string, stepMin: number, place = MUMBAI) {
  const { dayStart, dayEnd } = birthDayBounds(chartAt(date, '12:00', 'approximate', place).birth);
  const instants: number[] = [];
  for (let ms = dayStart; ms < dayEnd; ms += stepMin * 60_000) instants.push(ms);
  instants.push(dayEnd);
  const seen = instants.map(lordsAt);
  return {
    truth: {
      mahadasha: new Set(seen.map((s) => s.maha)).size === 1,
      antardasha: new Set(seen.map((s) => `${s.maha}/${s.antar}`)).size === 1,
    },
    instants,
  };
}

describe('approximate-time dasha timing stability', () => {
  it('1988-02-24 Mumbai: the Mahadasha changes near 01:00 local, so it is withheld from every placeholder', () => {
    // Rahu runs for a birth just after midnight, Jupiter from about 00:55 onwards.
    const { dayStart, dayEnd } = birthDayBounds(chartAt('1988-02-24', '12:00').birth);
    expect(lordsAt(dayStart).maha).toBe('Rahu');
    expect(lordsAt(dayEnd).maha).toBe('Jupiter');
    for (const time of TIMES) {
      const chart = chartAt('1988-02-24', time);
      expect(dashaTimingStable(chart, asOf), time).toEqual({ mahadasha: false, antardasha: false });
      const timing = buildInsights(chart, asOf).timing!;
      expect(timing.mahadashaReliable, time).toBe(false);
      expect(timing.antardashaReliable, time).toBe(false);
      const facts = buildFactIndex(chart, asOf);
      for (const level of ['mahadasha', 'antardasha'] as const) {
        const f = facts.get(fact.running(level, asOf))!;
        expect(f.withheld, `${time} ${level}`).toBe(true);
        expect('value' in f, `${time} ${level}`).toBe(false);
      }
    }
  });

  // Found by bisection with the real Moon (local Asia/Kolkata times of the Mahadasha change).
  const boundaries: Array<[string, string]> = [
    ['1993-02-26', '00:14:39'], ['1989-04-15', '00:10:34'], // minutes after the day starts
    ['1975-05-10', '23:51:16'], ['1958-01-14', '23:46:22'], // minutes before it ends
  ];
  it.each(boundaries)('%s: a Mahadasha change at %s local is caught from every placeholder', (date) => {
    const { truth } = sweep(date, 1);
    expect(truth.mahadasha).toBe(false);
    for (const time of TIMES) expect(dashaTimingStable(chartAt(date, time), asOf), time).toEqual({ mahadasha: false, antardasha: false });
  });

  it('1961-07-27: a Mahadasha that holds all day is kept; the Antardasha is withheld', () => {
    const { truth } = sweep('1961-07-27', 1);
    expect(truth).toEqual({ mahadasha: true, antardasha: false });
    for (const time of TIMES) expect(dashaTimingStable(chartAt('1961-07-27', time), asOf), time).toEqual(truth);
  });

  it('matches a minute-by-minute ephemeris sweep of the day, from every placeholder', () => {
    const cases: Array<[string, { latitude: number; longitude: number }]> = [
      ['1988-02-24', MUMBAI], ['1961-07-27', MUMBAI], ['1975-05-10', MUMBAI],
      ['2001-09-11', { latitude: 51.5074, longitude: -0.1278 }], ['1950-12-03', { latitude: -33.8688, longitude: 151.2093 }],
      ['1999-06-30', { latitude: 40.7128, longitude: -74.006 }],
    ];
    for (const [date, place] of cases) {
      const { truth } = sweep(date, 1, place);
      for (const time of ['00:00', '06:00', '12:00', '18:00', '23:59']) {
        expect(dashaTimingStable(chartAt(date, time, 'approximate', place), asOf), `${date} ${time}`).toEqual(truth);
      }
    }
  });

  it('the running period only moves forward through the day, so the two ends decide it', () => {
    // Position of `asOf` in the 120-year cycle, as a function of the birth instant.
    const ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
    const YEARS: Record<string, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };
    const CYCLE = 120 * 365.25 * 86_400_000;
    const position = (ms: number) => {
      const v = vimshottariDasha(siderealPositions(new Date(ms)).bodies.Moon.longitude, new Date(ms));
      const before = ORDER.slice(0, ORDER.indexOf(v.birthLord)).reduce((s, l) => s + YEARS[l], 0) * 365.25 * 86_400_000;
      return asOf.getTime() - (Date.parse(v.mahadashas[0].start) - before);
    };
    for (const date of ['1988-02-24', '1989-04-15', '1958-01-14', '1961-07-27']) {
      const { instants } = sweep(date, 10);
      const p = instants.map(position);
      const steps = p.slice(1).map((x, i) => (((x - p[i]) % CYCLE) + CYCLE) % CYCLE);
      expect(steps.every((d) => d > 0 && d < CYCLE / 4), date).toBe(true);
      // A day spans far less than the 120-year cycle, so no period can recur within it.
      expect(steps.reduce((a, b) => a + b, 0)).toBeLessThan(CYCLE / 4);
    }
  });

  it('a daylight-saving change day (London 2007-10-28, 25 hours long) is checked over the whole local date', () => {
    const LONDON = { latitude: 51.5074, longitude: -0.1278 };
    // 00:00 BST (UTC+1) to 23:59:59 GMT.
    const start = Date.parse('2007-10-27T23:00:00Z'), end = Date.parse('2007-10-28T23:59:59Z');
    const seen = new Set<string>(), seenMaha = new Set<string | null>();
    for (let ms = start; ms <= end; ms += 60_000) { const l = lordsAt(ms); seen.add(`${l.maha}/${l.antar}`); seenMaha.add(l.maha); }
    const truth = { mahadasha: seenMaha.size === 1, antardasha: seen.size === 1 };
    for (const time of ['00:00', '00:30', '02:30', '12:00', '23:59']) {
      expect(dashaTimingStable(chartAt('2007-10-28', time, 'approximate', LONDON), asOf), time).toEqual(truth);
    }
  });

  it('exact-time charts are unchanged: their running periods are always used', () => {
    for (const time of ['00:05', '12:00', '23:55']) {
      expect(dashaTimingStable(chartAt('1988-02-24', time, 'exact'), asOf)).toEqual({ mahadasha: true, antardasha: true });
    }
  });

  describe('the local birth date is every instant the wall clock read that date', () => {
    // Independent of localBirthDate: offsets probed every 6 hours over four days, then the first and last
    // wall reading of the date that the clock actually showed.
    const wallInstants = (tz: string, wallMs: number) => {
      const offsets = new Set<number>();
      for (let h = -48; h <= 48; h += 6) offsets.add(offsetSecondsAt(tz, wallMs + h * 3_600_000));
      return Array.from(offsets).filter((o) => offsetSecondsAt(tz, wallMs - o * 1000) === o).map((o) => wallMs - o * 1000);
    };
    function trueDate(tz: string, date: string) {
      const midnight = Date.parse(`${date}T00:00:00Z`);
      let first = NaN, last = NaN;
      for (let s = 0; s < 86_400 && Number.isNaN(first); s += 60) { const xs = wallInstants(tz, midnight + s * 1000); if (xs.length) first = Math.min(...xs); }
      for (let s = 86_399; s >= 0 && Number.isNaN(last); s -= 60) { const xs = wallInstants(tz, midnight + s * 1000); if (xs.length) last = Math.max(...xs); }
      return { first, last };
    }
    /** Mahadasha/Antardasha over every minute of the true date: established only if one period runs throughout. */
    function truthOver(first: number, last: number) {
      const seen: Array<{ maha: string | null; antar: string | null }> = [];
      for (let ms = first; ms < last; ms += 60_000) seen.push(lordsAt(ms));
      seen.push(lordsAt(last));
      const maha = new Set(seen.map((x) => x.maha));
      const pairs = new Set(seen.map((x) => `${x.maha}/${x.antar}`));
      const mahadasha = maha.size === 1 && !maha.has(null);
      return { mahadasha, antardasha: mahadasha && pairs.size === 1 && !seen.some((x) => x.antar === null) };
    }
    const PLACEHOLDERS = ['00:00', '00:30', '01:30', '02:30', '03:30', '07:29', '12:00', '18:00', '22:30', '23:30', '23:59'];

    const cases: Array<[string, string, { latitude: number; longitude: number }, string, string, { mahadasha: boolean; antardasha: boolean }]> = [
      // Clocks went back at 01:00 the next morning: the date ran to 01:59:59 UTC, an hour past a fixed-offset end. Venus, then Sun.
      ['Azores', '1917-10-14', { latitude: 37.7412, longitude: -25.6756 }, '1917-10-14T01:00:00Z', '1917-10-15T01:59:59Z', { mahadasha: false, antardasha: false }],
      // Clocks went back at midnight at the end of the date: 23:00-23:59 local happened twice.
      ['Sao Paulo', '1932-03-31', { latitude: -23.5505, longitude: -46.6333 }, '1932-03-31T02:00:00Z', '1932-04-01T02:59:59Z', { mahadasha: true, antardasha: false }],
      // Alaska moved across the date line: 18 October 1867 was lived twice, a 48-hour date. Outside the listed cycle today.
      ['Anchorage', '1867-10-18', { latitude: 61.2181, longitude: -149.9003 }, '1867-10-17T09:59:36Z', '1867-10-19T09:59:35Z', { mahadasha: false, antardasha: false }],
      // Clocks went forward at midnight: the date began at 01:00 local. Rahu, then Saturn.
      ['Beirut', '2018-03-25', { latitude: 33.8938, longitude: 35.5018 }, '2018-03-24T22:00:00Z', '2018-03-25T20:59:59Z', { mahadasha: false, antardasha: false }],
      // About 115 years before asOf: asOf lies outside the listed cycle for part of the date (none, Sun, none).
      ['Kolkata', '1911-04-22', { latitude: 22.5726, longitude: 88.3639 }, '1911-04-21T18:30:00Z', '1911-04-22T18:29:59Z', { mahadasha: false, antardasha: false }],
    ];

    it.each(cases)('%s %s: the interval covers the whole date and the period is judged over it', (_name, date, place, first, last, expected) => {
      let resolved = 0;
      for (const time of PLACEHOLDERS) {
        let chart: ReturnType<typeof chartAt>;
        try { chart = chartAt(date, time, 'approximate', place); } catch { continue; } // a skipped or repeated time
        resolved++;
        const truth = trueDate(chart.birth.timezone, date);
        expect(new Date(truth.first).toISOString().replace('.000', ''), 'first instant').toBe(first);
        expect(new Date(truth.last).toISOString().replace('.000', ''), 'last instant').toBe(last);
        const day = localBirthDate(chart)!;
        expect(day.dayStart, `${time}: covers the first instant`).toBeLessThanOrEqual(truth.first);
        expect(day.dayEnd, `${time}: covers the last instant`).toBeGreaterThanOrEqual(truth.last);
        expect(dashaTimingStable(chart, asOf), time).toEqual(expected);
        expect(truthOver(truth.first, truth.last), 'sweep of the true date').toEqual(expected);
      }
      expect(resolved).toBeGreaterThan(0);
    });

    it('Kolkata 1911-04-22 from a placeholder outside the listed cycle: no period is vouched for', () => {
      const chart = chartAt('1911-04-22', '02:41', 'approximate', { latitude: 22.5726, longitude: 88.3639 });
      expect(buildInsights(chart, asOf).timing).toMatchObject({ mahadashaReliable: false, antardashaReliable: false });
    });

    it('a zone that cannot be read withholds both periods', () => {
      const chart = chartAt('1988-02-24', '12:00');
      const broken = { ...chart, birth: { ...chart.birth, timezone: 'Not/AZone' } };
      expect(localBirthDate(broken)).toBeNull();
      expect(dashaTimingStable(broken, asOf)).toEqual({ mahadasha: false, antardasha: false });
    });
  });
});
