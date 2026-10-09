// Direction 3 Stage 4: the Kundli page renders the mockup's chart, graha cards, yoga line and
// to-scale Vimshottari from the engine, for the mockup's own sample chart (Ananya, 15 Aug 1990
// 06:30, Bengaluru), and withholds what an approximate birth time cannot fix.
import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { NORTH_SIGN_NUMBER, bySign, houseOf, labelOffsets, signOfHouse } from '../../client/src/lib/rashiChart';
import { grahaCards } from '../../client/src/components/kundli/GrahaGrid';
import { summariseYogasAndDoshas } from '../../client/src/lib/kundliSummary';
import { vimshottariScale } from '../../client/src/lib/vimshottari';

const canonicalOf = async (date: string, time: string, timeAccuracy: 'exact' | 'approximate') =>
  ((await getKundli(date, time, 12.9716, 77.5946, { timeAccuracy })).chartData as any).canonical as CanonicalChart;
const text = (segs: Array<{ text: string }>) => segs.map((s) => s.text).join('');

describe('Rashi chart geometry', () => {
  it('puts the sign numbers where the mockup does', () => {
    // Leo Lagna (index 4): house 1 shows 5, house 12 shows 4, house 5 shows 9.
    expect(NORTH_SIGN_NUMBER[1]).toEqual([150, 137]);
    expect(signOfHouse(1, 4) + 1).toBe(5);
    expect(signOfHouse(12, 4) + 1).toBe(4);
    expect(signOfHouse(5, 4) + 1).toBe(9);
    expect(houseOf(3, 4)).toBe(12);
  });
  it('sets four planets in one house as two lines of two (the mockup’s 12th house)', () => {
    const offs = labelOffsets(4, 'hi');
    expect(new Set(offs.map((o) => o[1])).size).toBe(2);
    expect(offs[0][0]).toBeLessThan(0);
    expect(offs[1][0]).toBeGreaterThan(0);
  });
});

describe('the mockup’s sample chart, from the engine', () => {
  it('places the grahas in the mockup’s houses', async () => {
    const c = await canonicalOf('1990-08-15', '06:30', 'exact');
    expect(c.ascendant.sign).toBe('Leo');
    const groups = bySign(c.planets.map((p) => ({ planet: p.name, signIndex: p.signIndex, retrograde: p.retrograde })));
    const inHouse = (h: number) => (groups.get(signOfHouse(h, c.ascendant.signIndex)) ?? []).map((p) => p.planet);
    expect(inHouse(1)).toEqual(['Mercury']);
    expect(inHouse(12)).toEqual(['Sun', 'Jupiter', 'Venus', 'Ketu']);
    expect(inHouse(5)).toEqual(['Saturn']);
    expect(inHouse(6)).toEqual(['Rahu']);
    expect(inHouse(9)).toEqual(['Mars']);
    expect(inHouse(10)).toEqual(['Moon']);
    expect(c.planets.find((p) => p.name === 'Saturn')!.retrograde).toBe(true);
  });

  it('writes the mockup’s graha cards', async () => {
    const c = await canonicalOf('1990-08-15', '06:30', 'exact');
    const cards = grahaCards(c, { lagnaKnown: true, moonSignKnown: true, nakshatraKnown: true, maha: 'Jupiter', antar: 'Mercury' });
    const by = (n: string) => cards.find((x) => x.planet === n)!;
    expect(by('Jupiter')).toMatchObject({ sign: 'Cancer', house: 12, nakshatra: 'Pushya', dignity: 'Exalted', role: 'Mahadasha lord' });
    expect(by('Moon')).toMatchObject({ sign: 'Taurus', house: 10, nakshatra: 'Rohini', dignity: 'Exalted' });
    expect(by('Mars')).toMatchObject({ sign: 'Aries', house: 9, dignity: 'Own sign' });
    expect(by('Mercury')).toMatchObject({ sign: 'Leo', house: 1, dignity: "Friend's sign", role: 'Antardasha lord' });
    expect(by('Venus').dignity).toBe("Enemy's sign");
    expect(by('Saturn')).toMatchObject({ sign: 'Sagittarius', house: 5, retrograde: true, dignity: 'Neutral sign' });
    expect(by('Rahu')).toMatchObject({ sign: 'Capricorn', house: 6, nakshatra: 'Shravana', dignity: null, retrograde: false });
  });

  it('writes the mockup’s yoga and dosha line', async () => {
    const c = await canonicalOf('1990-08-15', '06:30', 'exact');
    expect(text(summariseYogasAndDoshas(c))).toBe('Yogas: Raja Yoga ×3, Sarala Vipreeta Raja Yoga. No Mangal, Kaal Sarp or Pitru Dosha.');
  });

  it('draws Vimshottari to scale from birth, today inside the Jupiter Mahadasha', async () => {
    const c = await canonicalOf('1990-08-15', '06:30', 'exact');
    const periods = c.dashas.vimshottari.mahadashas.map((m) => ({ lord: m.lord, start: m.start, end: m.end }));
    const scale = vimshottariScale(periods, new Date(c.birth.birthUTC), new Date('2026-10-09T00:00:00Z'))!;
    expect(scale.start.toISOString()).toBe(new Date(c.birth.birthUTC).toISOString());
    expect(scale.segments.map((s) => s.lord)).toEqual(['Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus', 'Sun']);
    expect(scale.segments.find((s) => s.current)!.lord).toBe('Jupiter');
    expect(scale.today).toBeGreaterThan(0.3);
    expect(scale.today).toBeLessThan(0.33);
    // Without a reliable running period nothing is marked current.
    expect(vimshottariScale(periods, new Date(c.birth.birthUTC), new Date('2026-10-09T00:00:00Z'), false)!.segments.some((s) => s.current)).toBe(false);
  });
});

describe('approximate birth time', () => {
  it('states no house, Moon sign or Lagna-based yoga it cannot fix', async () => {
    const c = await canonicalOf('1988-02-14', '06:00', 'approximate');
    const cards = grahaCards(c, { lagnaKnown: false, moonSignKnown: false, nakshatraKnown: false });
    expect(cards.every((x) => x.house === null)).toBe(true);
    expect(cards.find((x) => x.planet === 'Moon')).toMatchObject({ sign: 'Sign uncertain', dignity: null, nakshatra: null });
    const line = text(summariseYogasAndDoshas(c));
    expect(line).toMatch(/^Yogas and Mangal Dosha depend on the Lagna/);
    expect(line).not.toMatch(/Mangal Dosha present|No Mangal/);
  });
});
