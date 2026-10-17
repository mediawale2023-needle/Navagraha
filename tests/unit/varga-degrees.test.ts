/**
 * D10 in the first production Career Report showed 0° for every placement. The engine computes D10 (and D60) signs
 * and houses only; the legacy projection filled the missing degree with a literal 0, and the PDF printed it. These
 * tests pin the D10 data against the independent reference pipeline and keep placeholders, missing degrees and a
 * genuinely calculated 0° apart.
 */
import { describe, expect, it } from 'vitest';
import * as ref from '../../scripts/golden/reference';
import { getKundli } from '../../server/astroEngine/index';
import { dasamsaSign, navamsaDegree, navamsaSign } from '../../server/astroEngine/vedic';
import { chartPlacementLabel } from '../../client/src/lib/reportPdf';
import { withoutVargaDegreePlaceholders } from '../../server/astroEngine/canonical/upgrade';

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
// An invented chart (24 Aug 1993, 08:05 IST, Pune city centre); the reference is computed for it at run time.
const BIRTH = { date: '1993-08-24', time: '08:05', lat: 18.5204, lng: 73.8567, utc: new Date('1993-08-24T02:35:00Z') };
const kundli = async (date = BIRTH.date, time = BIRTH.time, lat = BIRTH.lat, lng = BIRTH.lng) =>
  (await getKundli(date, time, lat, lng, { timeAccuracy: 'exact' })) as any;

describe('D10 for a Career Report chart, against the independent reference', () => {
  it('Lagna, D10 Lagna, and every planet\'s D1, D9 and D10 sign and house agree with scripts/golden/reference.ts', async () => {
    const k = await kundli();
    const c = k.chartData.canonical;
    const refLon: Record<string, number> = Object.fromEntries(ref.REF_BODIES.map((b) => [b, ref.referenceSidereal(b, BIRTH.utc)]));
    refLon.Rahu = ref.referenceMeanNode(BIRTH.utc);
    refLon.Ketu = (refLon.Rahu + 180) % 360;
    const refAsc = ref.referenceAngles(BIRTH.utc, BIRTH.lat, BIRTH.lng).ascendant;
    expect(c.birth.birthUTC).toBe(BIRTH.utc.toISOString());
    expect(c.ascendant.sign).toBe(SIGNS[ref.signOf(refAsc)]);
    expect(c.ascendant.sign).toBe('Virgo');
    const d10Asc = ref.d10(refAsc), d9Asc = ref.d9(refAsc);
    expect(c.vargas.D10.ascendantSignIndex).toBe(d10Asc);
    expect(SIGNS[d10Asc]).toBe('Taurus');
    expect(c.vargas.D9.ascendantSignIndex).toBe(d9Asc);
    for (const p of c.planets) {
      const r = refLon[p.name];
      // Every body is well clear of a D10 division edge (3°), so the discrete facts are not tolerance-sensitive.
      expect(ref.marginToDivision(r, 3)).toBeGreaterThan(0.03);
      expect(Math.abs(p.longitude - r) * 3600).toBeLessThan(30);
      expect(p.sign).toBe(SIGNS[ref.signOf(r)]);
      const d10 = c.vargas.D10.placements.find((x: any) => x.planet === p.name);
      expect(d10.sign).toBe(SIGNS[ref.d10(r)]);
      expect(d10.house).toBe(((ref.d10(r) - d10Asc + 12) % 12) + 1);
      const d9 = c.vargas.D9.placements.find((x: any) => x.planet === p.name);
      expect(d9.sign).toBe(SIGNS[ref.d9(r)]);
      expect(d9.house).toBe(((ref.d9(r) - d9Asc + 12) % 12) + 1);
    }
  });

  it('the D10 placements printed in the PDF are the independent reference ones', async () => {
    const k = await kundli();
    const at = (p: string) => k.chartData.dasamsa.planetaryPositions.find((x: any) => x.planet === p);
    const refLon: Record<string, number> = Object.fromEntries(ref.REF_BODIES.map((b) => [b, ref.referenceSidereal(b, BIRTH.utc)]));
    refLon.Rahu = ref.referenceMeanNode(BIRTH.utc);
    refLon.Ketu = (refLon.Rahu + 180) % 360;
    const d10Asc = ref.d10(ref.referenceAngles(BIRTH.utc, BIRTH.lat, BIRTH.lng).ascendant);
    expect([at('Ascendant').sign, at('Ascendant').house]).toEqual([SIGNS[d10Asc], 1]);
    for (const [planet, lon] of Object.entries(refLon)) expect([planet, at(planet).sign, at(planet).house]).toEqual([planet, SIGNS[ref.d10(lon)], ((ref.d10(lon) - d10Asc + 12) % 12) + 1]);
  });
});

describe('varga degrees: calculated, missing and placeholder are different things', () => {
  it('D10 and D60 carry no degree at all (the engine calculates their signs and houses only); D9 carries calculated degrees', async () => {
    for (const [date, time, lat, lng] of [[BIRTH.date, BIRTH.time, BIRTH.lat, BIRTH.lng], ['1975-03-21', '14:20', 19.076, 72.8777], ['2003-11-02', '23:45', 28.6139, 77.209], ['1962-01-26', '04:10', 13.0827, 80.2707]] as const) {
      const k = await kundli(date, time, lat, lng);
      for (const v of ['dasamsa', 'shashtiamsa']) {
        for (const p of k.chartData[v].planetaryPositions) expect(p, `${v} ${p.planet}`).not.toHaveProperty('degree');
        expect(JSON.stringify(k.chartData[v])).not.toMatch(/"degree"/);
      }
      const c = k.chartData.canonical;
      const lon: Record<string, number> = { Ascendant: c.ascendant.longitude, ...Object.fromEntries(c.planets.map((p: any) => [p.name, p.longitude])) };
      for (const p of k.chartData.navamsa.planetaryPositions) {
        expect(typeof p.degree).toBe('number');
        expect(p.degree).toBeGreaterThanOrEqual(0);
        expect(p.degree).toBeLessThan(30);
        expect(p.degree).toBeCloseTo(navamsaDegree(lon[p.planet]), 2);
      }
    }
  });

  it('D1/D9/D10 are consistent: each varga sign follows from the D1 longitude and each house from the varga Lagna', async () => {
    const k = await kundli();
    const c = k.chartData.canonical;
    for (const [view, d, signOf] of [['navamsa', 'D9', navamsaSign], ['dasamsa', 'D10', dasamsaSign]] as const) {
      const v = c.vargas[d];
      expect(v.ascendantSignIndex).toBe(signOf(c.ascendant.longitude));
      for (const p of c.planets) {
        const placement = v.placements.find((x: any) => x.planet === p.name);
        expect(placement.signIndex).toBe(signOf(p.longitude));
        expect(placement.house).toBe(((placement.signIndex - v.ascendantSignIndex + 12) % 12) + 1);
        const legacy = k.chartData[view].planetaryPositions.find((x: any) => x.planet === p.name);
        expect([legacy.sign, legacy.house]).toEqual([placement.sign, placement.house]);
        expect(k.chartData[view].houses[placement.house - 1].planets).toContain(p.name);
      }
    }
    // D1 positions keep their calculated degrees.
    for (const p of c.planets) expect(k.chartData.planetaryPositions.find((x: any) => x.planet === p.name).degree).toBeCloseTo(p.degreeInSign, 2);
  });
});

describe('stored charts saved with the placeholder', () => {
  it('a V3 row read back loses only the D10/D60 0° placeholders; signs, houses and D9 degrees are untouched; idempotent', async () => {
    const k = await kundli();
    // As every V3 row saved before this fix stores it.
    const stored = { ...k, chartData: { ...k.chartData,
      dasamsa: { ...k.chartData.dasamsa, planetaryPositions: k.chartData.dasamsa.planetaryPositions.map((p: any) => ({ ...p, degree: 0 })) },
      shashtiamsa: { ...k.chartData.shashtiamsa, planetaryPositions: k.chartData.shashtiamsa.planetaryPositions.map((p: any) => ({ ...p, degree: 0 })) } } };
    const read = withoutVargaDegreePlaceholders(stored);
    for (const v of ['dasamsa', 'shashtiamsa']) {
      expect(read.chartData[v].planetaryPositions.map((p: any) => [p.planet, p.sign, p.house])).toEqual(k.chartData[v].planetaryPositions.map((p: any) => [p.planet, p.sign, p.house]));
      for (const p of read.chartData[v].planetaryPositions) expect(p).not.toHaveProperty('degree');
      expect(read.chartData[v].houses).toEqual(k.chartData[v].houses);
    }
    expect(read.chartData.navamsa).toBe(stored.chartData.navamsa);
    expect(read.chartData.planetaryPositions).toBe(stored.chartData.planetaryPositions);
    expect(withoutVargaDegreePlaceholders(read)).toBe(read);
    expect(withoutVargaDegreePlaceholders(k)).toBe(k);
    const legacyRow = { chartData: { dasamsa: { planetaryPositions: [{ planet: 'Sun', sign: 'Leo', house: 5, degree: 0 }] } } } as any;
    expect(withoutVargaDegreePlaceholders(legacyRow)).toBe(legacyRow);
  });
});

describe('PDF chart labels', () => {
  const sun = { planet: 'Sun', sign: 'Libra', house: 10 };
  it('a calculated 0° is printed as 0°; it is not treated as missing', () => {
    expect(navamsaDegree(0)).toBe(0); // a placement exactly at a navamsa boundary has a real D9 degree of 0
    expect(chartPlacementLabel({ ...sun, degree: 0 }, { degrees: true })).toBe("Su-0°00'");
  });
  it('a missing, null or non-numeric degree is left out, never printed as "—°" or 0°', () => {
    for (const degree of [undefined, null, Number.NaN, '12' as unknown]) {
      const label = chartPlacementLabel({ ...sun, degree: degree as any }, { degrees: true });
      expect(label).toBe('Su');
      expect(label).not.toMatch(/°|—/);
    }
  });
  it('a chart drawn without degrees (D10) prints none, even for a stored report that carries 0° placeholders', () => {
    for (const p of ['Ascendant', 'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']) {
      const label = chartPlacementLabel({ planet: p, degree: 0, isRetrograde: p === 'Rahu' || p === 'Ketu' }, { degrees: false });
      expect(label).not.toMatch(/°|\d/);
    }
    expect(chartPlacementLabel({ planet: 'Rahu', degree: 0, isRetrograde: true }, { degrees: false })).toBe('RaR');
  });
  it('D1 and D9 labels use conventional degree-and-minute display precision', () => {
    expect(chartPlacementLabel({ planet: 'Ascendant', degree: 20.34 }, { degrees: true })).toBe("Asc-20°20'");
    expect(chartPlacementLabel({ planet: 'Rahu', degree: 18.64, isRetrograde: true }, { degrees: true })).toBe("Ra-18°38'R");
    expect(chartPlacementLabel({ planet: 'Mercury', degree: 12.93 }, { degrees: true })).toBe("Me-12°56'");
  });
});
