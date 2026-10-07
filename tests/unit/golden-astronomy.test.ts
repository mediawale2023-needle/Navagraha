/**
 * V3 golden-chart suite — ASTRONOMICAL TRUTH.
 *
 * Expected values in tests/golden/fixtures.json come from an independent
 * pipeline (scripts/golden/reference.ts: astronomy-engine + independent
 * spherical astronomy + independently written rules), never from the engine
 * under test. See tests/golden/README.md for provenance.
 */
import { describe, expect, it } from 'vitest';
import fixtures from '../golden/fixtures.json';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { GRAHAS } from '../../shared/v3/canonical';

const LON_TOL_DEG = 30 / 3600;      // 30": ~2.4× the worst observed engine/reference gap
const DISCRETE_MARGIN_DEG = 0.03;   // assert sign/nakshatra/pada/varga only beyond this distance from an edge
const sep = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

type Fixture = typeof fixtures.cases[number];
const cases = fixtures.cases as Fixture[];
const chartFor = (f: Fixture) => computeCanonicalChart(resolveBirthWithCoordinates({
  date: f.input.date, time: f.input.time, place: f.input.place,
  latitude: f.input.latitude, longitude: f.input.longitude, timeAccuracy: f.input.timeAccuracy as 'exact' | 'approximate',
}));

it('covers the required breadth of reference charts', () => {
  expect(cases.length).toBeGreaterThanOrEqual(40);
  const ascSigns = new Set(cases.map((c) => c.expected.ascendant.sign));
  expect(ascSigns.size).toBeGreaterThanOrEqual(10);
  const decades = new Set(cases.map((c) => c.input.date.slice(0, 3)));
  expect(decades.size).toBeGreaterThanOrEqual(8);
  expect(new Set(cases.map((c) => c.input.expectedTimezone)).size).toBeGreaterThanOrEqual(20);
});

describe.each(cases.map((c) => [c.input.id, c] as const))('%s', (_id, f) => {
  const chart = chartFor(f);
  const exp = f.expected;

  it('resolves the birth instant from the tz database', () => {
    expect(chart.birth.timezone).toBe(f.input.expectedTimezone);
    expect(chart.birth.utcOffset).toBe(f.input.expectedOffset);
    expect(chart.birth.birthUTC).toBe(exp.birthUTC);
    expect(chart.birth.timeAccuracy).toBe(f.input.timeAccuracy);
  });

  it('matches reference longitudes for all nine grahas, Ascendant and MC', () => {
    for (const g of GRAHAS) {
      const p = chart.planets.find((x) => x.name === g)!;
      expect(sep(p.longitude, exp.planets[g].longitude), g).toBeLessThan(LON_TOL_DEG);
    }
    expect(sep(chart.ascendant.longitude, exp.ascendant.longitude)).toBeLessThan(LON_TOL_DEG);
    expect(sep(chart.midheaven.longitude, exp.midheaven.longitude)).toBeLessThan(LON_TOL_DEG);
  });

  it('matches sign, house, nakshatra, pada, retrograde and D9/D10 away from edges', () => {
    if (exp.ascendant.margin > DISCRETE_MARGIN_DEG) {
      expect(chart.ascendant.signIndex).toBe(exp.ascendant.sign);
      expect(chart.vargas.D9.ascendantSignIndex).toBe(exp.ascendant.d9);
      expect(chart.vargas.D10.ascendantSignIndex).toBe(exp.ascendant.d10);
    }
    for (const g of GRAHAS) {
      const p = chart.planets.find((x) => x.name === g)!;
      const e = exp.planets[g];
      if (e.margins.sign > DISCRETE_MARGIN_DEG) {
        expect(p.signIndex, `${g} sign`).toBe(e.sign);
        if (exp.ascendant.margin > DISCRETE_MARGIN_DEG) expect(p.house, `${g} house`).toBe(e.house);
      }
      if (e.margins.nakshatra > DISCRETE_MARGIN_DEG) expect(p.nakshatra.index, `${g} nakshatra`).toBe(e.nakshatra);
      if (e.margins.pada > DISCRETE_MARGIN_DEG) expect(p.nakshatra.pada, `${g} pada`).toBe(e.pada);
      if (e.margins.d9 > DISCRETE_MARGIN_DEG) expect(chart.vargas.D9.placements.find((x) => x.planet === g)!.signIndex, `${g} D9`).toBe(e.d9);
      if (e.margins.d10 > DISCRETE_MARGIN_DEG) expect(chart.vargas.D10.placements.find((x) => x.planet === g)!.signIndex, `${g} D10`).toBe(e.d10);
      if (e.retrograde !== null) expect(p.retrograde, `${g} retrograde`).toBe(e.retrograde);
    }
  });

  it('matches the Vimshottari sequence and Mahadasha boundaries', () => {
    const vim = chart.dashas.vimshottari;
    const moon = exp.planets.Moon;
    if (moon.margins.nakshatra <= DISCRETE_MARGIN_DEG) return;
    expect(vim.mahadashas.map((m) => m.lord)).toEqual(exp.vimshottari.map((m) => m.lord));
    exp.vimshottari.forEach((ref, i) => {
      const m = vim.mahadashas[i];
      // Moon tolerance → nakshatra-fraction error → date error, plus one hour.
      const tolMs = (LON_TOL_DEG / (360 / 27)) * 20 * 365.25 * 86_400_000 + 3_600_000;
      expect(Math.abs(Date.parse(m.start) - Date.parse(ref.start)), `${m.lord} start`).toBeLessThan(tolMs);
      expect(Math.abs(Date.parse(m.end) - Date.parse(ref.end)), `${m.lord} end`).toBeLessThan(tolMs);
    });
  });
});

describe('boundary cases straddle their edge as the reference predicts', () => {
  const byId = Object.fromEntries(cases.map((c) => [c.input.id, chartFor(c)]));
  const moon = (id: string) => byId[id].planets.find((p) => p.name === 'Moon')!;
  it('Moon nakshatra changes across the crossing', () => {
    expect(moon('b-moon-nak-after').nakshatra.index).toBe((moon('b-moon-nak-before').nakshatra.index + 1) % 27);
  });
  it('Moon sign changes across the crossing', () => {
    expect(moon('b-moon-sign-after').signIndex).toBe((moon('b-moon-sign-before').signIndex + 1) % 12);
  });
  it('Moon pada changes across the crossing', () => {
    expect(moon('b-moon-pada-after').nakshatra.pada).toBe((moon('b-moon-pada-before').nakshatra.pada % 4) + 1);
  });
  it('Ascendant sign changes across the crossing', () => {
    expect(byId['b-asc-after'].ascendant.signIndex).toBe((byId['b-asc-before'].ascendant.signIndex + 1) % 12);
  });
  it.each([['r-saturn-2016', 'Saturn'], ['r-jupiter-2017', 'Jupiter'], ['r-mercury-2019', 'Mercury'], ['r-mars-2020', 'Mars']])('%s has %s retrograde', (id, g) => {
    expect(byId[id].planets.find((p) => p.name === g)!.retrograde).toBe(true);
  });
});

describe('approximate birth time propagates uncertainty', () => {
  const approx = chartFor(cases.find((c) => c.input.id === 'in-blr-approx')!);
  it('never labels an approximate chart as exact', () => {
    expect(approx.birth.timeAccuracy).toBe('approximate');
    expect(approx.uncertainty.ascendantReliable).toBe(false);
    expect(approx.uncertainty.notes.join(' ')).toMatch(/approximate/i);
  });
});

describe('provenance of the reference ayanamsa constant', () => {
  it('Lahiri K places Spica (Chitra) at ~180° sidereal, the Chitrapaksha definition', async () => {
    const { LAHIRI_J2000_DEG } = await import('../../scripts/golden/reference');
    // Spica, ICRS J2000: RA 13h25m11.579s, Dec −11°09′40.75″; J2000 obliquity 23.4392911°.
    const ra = (13 + 25 / 60 + 11.579 / 3600) * 15 * Math.PI / 180;
    const dec = -(11 + 9 / 60 + 40.75 / 3600) * Math.PI / 180;
    const eps = 23.4392911 * Math.PI / 180;
    const lambda = (Math.atan2(Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps), Math.cos(ra)) * 180 / Math.PI + 360) % 360;
    expect(Math.abs(lambda - LAHIRI_J2000_DEG - 180)).toBeLessThan(0.05);
  });
});
