/**
 * Approximate birth time: is the running Mahadasha/Antardasha the same for every moment of the local
 * birth date? The answer must come from the real Moon across the whole day, so it is the same whichever
 * placeholder time was stored. Ground truth here is a dense Swiss Ephemeris sweep of the day.
 */
import { describe, expect, it } from 'vitest';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { birthDayBounds, computeCanonicalChart, siderealPositions } from '../../server/astroEngine/canonical/compute';
import { vimshottariDasha } from '../../server/astroEngine/dasha';
import { dashaTimingStable } from '../../server/astroEngine/evidence/engine';
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
});
