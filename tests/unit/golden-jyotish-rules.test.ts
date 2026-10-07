/**
 * V3 golden suite — JYOTISH RULE TESTS (separate from astronomical truth).
 *
 * Synthetic longitudes with expectations derived by hand from each rule's
 * textual definition (and, for D9/D10/Vimshottari, from the independently
 * written rules in scripts/golden/reference.ts). No astronomy is involved.
 */
import { describe, expect, it } from 'vitest';
import {
  navamsaSign, dasamsaSign, drekkanaSign, chaturthamsaSign, saptamsaSign, dwadasamsaSign, shashtiamsaSign,
} from '../../server/astroEngine/vedic';
import { vimshottariDasha, calculateDashas, yoginiDasha } from '../../server/astroEngine/dasha';
import { uchchaBala, digBala, NAISARGIKA } from '../../server/astroEngine/canonical/shadbala';
import { computeDignities } from '../../server/astroEngine/dignity';
import { computeBhava } from '../../server/astroEngine/bhava';
import { detectYogas } from '../../server/astroEngine/yogas';
import { hasMangalDosha, hasKaalSarpDosha } from '../../server/astroEngine/doshas';
import { d9 as refD9, d10 as refD10, vimshottariBoundaries } from '../../scripts/golden/reference';

const S = { Aries: 0, Taurus: 1, Gemini: 2, Cancer: 3, Leo: 4, Virgo: 5, Libra: 6, Scorpio: 7, Sagittarius: 8, Capricorn: 9, Aquarius: 10, Pisces: 11 };
const at = (sign: keyof typeof S, deg: number) => S[sign] * 30 + deg;
const YEAR = 365.25 * 86_400_000;

describe('divisional chart rules', () => {
  it.each([
    ['Aries 1°', at('Aries', 1), S.Aries], ['Taurus 0.5°', at('Taurus', 0.5), S.Capricorn], ['Gemini 0.5°', at('Gemini', 0.5), S.Libra],
    ['Cancer 29°', at('Cancer', 29), S.Pisces], ['Leo 15°', at('Leo', 15), S.Leo], ['Scorpio 29.9°', at('Scorpio', 29.9), S.Pisces],
  ])('D9 %s', (_l, lon, expected) => {
    expect(navamsaSign(lon)).toBe(expected);
    expect(refD9(lon)).toBe(expected);
  });
  it('D9 agrees with the independently written rule across the zodiac', () => {
    for (let lon = 0.01; lon < 360; lon += 0.37) expect(navamsaSign(lon)).toBe(refD9(lon));
  });
  it.each([
    ['Aries 29.9°', at('Aries', 29.9), S.Capricorn], ['Taurus 0.5°', at('Taurus', 0.5), S.Capricorn], ['Gemini 4°', at('Gemini', 4), S.Cancer],
  ])('D10 %s', (_l, lon, expected) => {
    expect(dasamsaSign(lon)).toBe(expected);
    expect(refD10(lon)).toBe(expected);
  });
  it('D10 agrees with the independently written rule across the zodiac', () => {
    for (let lon = 0.01; lon < 360; lon += 0.37) expect(dasamsaSign(lon)).toBe(refD10(lon));
  });
  it.each([
    ['D3 Leo 15° → 5th from Leo', drekkanaSign, at('Leo', 15), S.Sagittarius],
    ['D3 Aries 25° → 9th from Aries', drekkanaSign, at('Aries', 25), S.Sagittarius],
    ['D4 Cancer 8° → 4th from Cancer', chaturthamsaSign, at('Cancer', 8), S.Libra],
    ['D4 Aries 29° → 10th from Aries', chaturthamsaSign, at('Aries', 29), S.Capricorn],
    ['D7 Taurus 0.5° (even) → from the 7th', saptamsaSign, at('Taurus', 0.5), S.Scorpio],
    ['D7 Aries 29° (odd) → 7th part from Aries', saptamsaSign, at('Aries', 29), S.Libra],
    ['D12 Gemini 29° → 12th from Gemini', dwadasamsaSign, at('Gemini', 29), S.Taurus],
    ['D60 Aries 0.7° → 2nd part', shashtiamsaSign, at('Aries', 0.7), S.Taurus],
  ])('%s', (_l, fn, lon, expected) => {
    expect((fn as (l: number) => number)(lon)).toBe(expected);
  });
});

describe('Vimshottari', () => {
  const birth = new Date('2000-01-01T00:00:00Z');
  it('starts Ketu with a full balance at 0° Aries', () => {
    const v = vimshottariDasha(0, birth);
    expect(v.birthLord).toBe('Ketu');
    expect(v.balanceAtBirthYears).toBeCloseTo(7, 9);
    expect(v.mahadashas.map((m) => m.lord)).toEqual(['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']);
  });
  it('places the birth Mahadasha at its true start and its Antardashas on their correct dates', () => {
    // Moon at the middle of Bharani (Venus): 10 of 20 Venus years elapsed.
    const moon = 13 + 1 / 3 + 20 / 3;
    const v = vimshottariDasha(moon, birth);
    expect(v.birthLord).toBe('Venus');
    expect(Date.parse(v.mahadashas[0].start)).toBeCloseTo(birth.getTime() - 10 * YEAR, -3);
    // Venus 3⅓ + Sun 1 + Moon 1⅔ + Mars 1⅙ = 7⅙ y; Rahu (3 y) spans the birth instant.
    const running = v.mahadashas[0].antardashas.find((a) => Date.parse(a.start) <= birth.getTime() && Date.parse(a.end) > birth.getTime())!;
    expect(running.lord).toBe('Rahu');
    expect(Date.parse(running.start)).toBeCloseTo(birth.getTime() - (10 - 7 - 1 / 6) * YEAR, -3);
  });
  it('legacy display view clips at birth without shifting Antardasha dates', () => {
    const moon = 13 + 1 / 3 + 20 / 3;
    const first = calculateDashas(moon, birth)[0];
    expect(first.startDate).toBe('2000-01-01');
    expect(first.antardashas[0].planet).toBe('Rahu');
    expect(first.antardashas[0].startDate).toBe('2000-01-01');
    expect(first.antardashas.map((a) => a.planet)).toEqual(['Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu']);
  });
  it('agrees with the independently written Mahadasha rule', () => {
    for (const moon of [0.5, 77.7, 133.3, 201.9, 299.99, 359.5]) {
      const ref = vimshottariBoundaries(moon, birth.getTime());
      const v = vimshottariDasha(moon, birth).mahadashas;
      ref.forEach((r, i) => {
        expect(v[i].lord).toBe(r.lord);
        expect(Math.abs(Date.parse(v[i].start) - r.startMs)).toBeLessThan(2);
      });
    }
  });
  it('Antardashas sum to their Mahadasha', () => {
    for (const m of vimshottariDasha(150, birth).mahadashas) {
      expect(m.antardashas[0].start).toBe(m.start);
      expect(m.antardashas[8].end).toBe(m.end);
    }
  });
});

describe('Yogini', () => {
  it('starts from (nakshatra number + 3) mod 8', () => {
    expect(yoginiDasha(1, new Date()).birthYogini).toBe('Bhramari');           // Ashwini (1) → 4
    expect(yoginiDasha(13.5, new Date()).birthYogini).toBe('Bhadrika');        // Bharani (2) → 5
    expect(yoginiDasha(5 * 360 / 27 + 1, new Date()).birthYogini).toBe('Mangala'); // Ardra (6) → 9 mod 8 = 1
  });
});

describe('partial Shadbala components', () => {
  it('Uchcha bala is 60 at deep exaltation and 0 at deep debilitation', () => {
    expect(uchchaBala('Sun', at('Aries', 10))).toBeCloseTo(60, 9);
    expect(uchchaBala('Sun', at('Libra', 10))).toBeCloseTo(0, 9);
    expect(uchchaBala('Saturn', at('Libra', 20))).toBeCloseTo(60, 9);
    expect(uchchaBala('Moon', at('Taurus', 3) + 90)).toBeCloseTo(30, 9);
  });
  it('Dig bala peaks at the strength point and vanishes opposite', () => {
    expect(digBala('Jupiter', 100, 100, 10)).toBeCloseTo(60, 9);
    expect(digBala('Jupiter', 280, 100, 10)).toBeCloseTo(0, 9);
    expect(digBala('Sun', 10, 100, 10)).toBeCloseTo(60, 9);
    expect(digBala('Saturn', 280, 100, 10)).toBeCloseTo(60, 9);
    expect(digBala('Moon', 190, 100, 10)).toBeCloseTo(60, 9);
  });
  it('Naisargika bala follows the fixed 60×k/7 order', () => {
    expect(NAISARGIKA.Sun).toBe(60);
    expect(NAISARGIKA.Saturn).toBeCloseTo(8.57, 2);
    expect(NAISARGIKA.Moon > NAISARGIKA.Venus && NAISARGIKA.Venus > NAISARGIKA.Jupiter && NAISARGIKA.Jupiter > NAISARGIKA.Mercury && NAISARGIKA.Mercury > NAISARGIKA.Mars).toBe(true);
  });
});

describe('selected yogas and doshas', () => {
  const chart = (lons: Record<string, number>, asc: number) => {
    const ascSign = Math.floor(asc / 30);
    const dign = computeDignities(lons, ascSign);
    const bhava = computeBhava(lons, asc);
    return detectYogas(lons, ascSign, Math.floor(lons.Moon / 30), dign, bhava.houseLords).map((y) => ({ name: y.name, cancelled: y.cancelled }));
  };
  const base = { Sun: at('Leo', 5), Moon: at('Aries', 10), Mars: at('Gemini', 5), Mercury: at('Leo', 20), Jupiter: at('Cancer', 5), Venus: at('Virgo', 5), Saturn: at('Pisces', 5), Rahu: at('Taurus', 5), Ketu: at('Scorpio', 5) };

  it('Hamsa (Jupiter exalted in a kendra), Gajakesari and Budha-Aditya', () => {
    const names = chart(base, at('Cancer', 1)).map((y) => y.name);
    expect(names).toContain('Hamsa Yoga');
    expect(names).toContain('Gajakesari Yoga');   // Jupiter 4th from the Moon
    expect(names).toContain('Budha-Aditya Yoga'); // Sun with Mercury
  });
  it('no Hamsa when Jupiter is exalted outside a kendra', () => {
    expect(chart(base, at('Gemini', 1)).map((y) => y.name)).not.toContain('Hamsa Yoga');
  });
  it('Kemadruma forms for an isolated Moon and is not cancelled by unrelated Lagna kendras', () => {
    // Moon in Aries; nothing in Taurus/Pisces or with the Moon; nothing in Cancer/Libra/Capricorn.
    const lons = { Sun: at('Leo', 5), Moon: at('Aries', 10), Mars: at('Gemini', 5), Mercury: at('Leo', 20), Jupiter: at('Sagittarius', 5), Venus: at('Virgo', 5), Saturn: at('Aquarius', 5), Rahu: at('Taurus', 5), Ketu: at('Scorpio', 5) };
    const k = chart(lons, at('Gemini', 1)).find((y) => y.name === 'Kemadruma Yoga');
    expect(k).toEqual({ name: 'Kemadruma Yoga', cancelled: false });
  });
  it('Kemadruma is cancelled by a planet in a kendra from the Moon', () => {
    const lons = { Sun: at('Leo', 5), Moon: at('Aries', 10), Mars: at('Gemini', 5), Mercury: at('Leo', 20), Jupiter: at('Capricorn', 5), Venus: at('Virgo', 5), Saturn: at('Aquarius', 5), Rahu: at('Taurus', 5), Ketu: at('Scorpio', 5) };
    expect(chart(lons, at('Gemini', 1)).find((y) => y.name === 'Kemadruma Yoga')?.cancelled).toBe(true);
  });
  it('Mangal dosha house rule and Kaal Sarp hemming', () => {
    expect([1, 2, 4, 7, 8, 12].every(hasMangalDosha)).toBe(true);
    expect([3, 5, 6, 9, 10, 11].some(hasMangalDosha)).toBe(false);
    expect(hasKaalSarpDosha({ Rahu: 10, Sun: 20, Moon: 40, Mars: 60, Mercury: 80, Jupiter: 100, Venus: 120, Saturn: 150 })).toBe(true);
    expect(hasKaalSarpDosha({ Rahu: 10, Sun: 20, Moon: 40, Mars: 260, Mercury: 80, Jupiter: 100, Venus: 120, Saturn: 150 })).toBe(false);
  });
});
