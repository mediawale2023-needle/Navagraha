/**
 * The answer guard checked every sign, house, Lagna and dignity claim against the D1 chart, so a correct statement
 * about a divisional chart ("in the D10 chart the Lagna is Pisces") was rejected — one reason the first production
 * Career Report said almost nothing specific about its D10. Each claim is now attributed to one chart (the chart
 * named nearest to it in its clause, else the last chart named before it, else D1) and checked against that chart
 * only: a D10 claim that is true only in D1 is rejected, and so is a D1 claim that is true only in the D10.
 *
 * Invented chart (24 Aug 1993, 08:05 IST, Pune city centre), chosen for its structure; the expected values are read
 * from the engine: Jupiter is in a different sign in D1, D9 and D10 (and a different house in D1 and D10); the Sun
 * is debilitated only in the D10; the Moon only in D1; Mercury is in the same sign in D1 and D10; the D1 and D10
 * Lagnas differ.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { validateAnswer } from '../../server/agents/answerGuard';
import { signDignity } from '../../server/astroEngine/dignity';

const BIRTH = ['1993-08-24', '08:05', 18.5204, 73.8567] as const;
const ASOF = new Date('2026-10-14T06:00:00Z');
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const chartOf = async (timeAccuracy: 'exact' | 'approximate' = 'exact') => (await getKundli(...BIRTH, { timeAccuracy }) as any).chartData.canonical;
const check = async (text: string, timeAccuracy: 'exact' | 'approximate' = 'exact') =>
  validateAnswer(text, { chart: await chartOf(timeAccuracy), packetText: '', running: null, timing: { mahadashaReliable: true, antardashaReliable: true }, asOf: ASOF });

let X: { d1: string; d10: string; d9: string; h1: string; h10: string }, lagna: string, d10Lagna: string, sunD10: string, mercury: string, elsewhere: string;
beforeAll(async () => {
  const c = await chartOf();
  const v = (d: string, g: string) => c.vargas[d].placements.find((p: any) => p.planet === g);
  const jupiter = c.planets.find((p: any) => p.name === 'Jupiter');
  X = { d1: jupiter.sign, d10: v('D10', 'Jupiter').sign, d9: v('D9', 'Jupiter').sign, h1: ord(jupiter.house), h10: ord(v('D10', 'Jupiter').house) };
  lagna = c.ascendant.sign; d10Lagna = SIGNS[c.vargas.D10.ascendantSignIndex];
  sunD10 = v('D10', 'Sun').sign; mercury = v('D10', 'Mercury').sign;
  elsewhere = SIGNS.find((s) => ![X.d1, X.d10, X.d9].includes(s))!;
});

describe('answer guard: chart-specific divisional claims', () => {
  it('the invented chart has the structure these tests need', async () => {
    const c = await chartOf();
    const v = (d: string, g: string) => c.vargas[d].placements.find((p: any) => p.planet === g);
    const dig = (g: string) => c.strength.dignities.find((d: any) => d.planet === g)?.dignity;
    expect(new Set([X.d1, X.d10, X.d9]).size).toBe(3); expect(X.h1).not.toBe(X.h10);
    expect([dig('Sun'), signDignity('Sun', v('D10', 'Sun').signIndex)]).toEqual([expect.not.stringMatching(/Debilitated/), 'Debilitated']);
    expect([dig('Moon'), signDignity('Moon', v('D10', 'Moon').signIndex)]).toEqual(['Debilitated', expect.not.stringMatching(/Debilitated/)]);
    expect(c.planets.find((p: any) => p.name === 'Mercury').sign).toBe(mercury);
    expect(lagna).not.toBe(d10Lagna);
  });

  it('accepts a claim true in the chart it is about', async () => {
    for (const t of [
      `In the D10 chart the Lagna is ${d10Lagna}.`,
      `The D10 Lagna is ${d10Lagna}.`,
      `In the Dasamsa, Jupiter sits in ${X.d10}.`,
      `Jupiter sits in ${X.d10} in the D10.`,
      `Jupiter is in the ${X.h10} house of the D10 chart.`,
      `In the D10, the Sun is debilitated in ${sunD10}.`,
      `In the Navamsa (D9), Jupiter is in ${X.d9}.`,
      `In the D10 Mercury is in ${mercury}, the same sign as in the D1.`,
      `Jupiter is in ${X.d1}.`,
      `Jupiter is in the ${X.h1} house.`,
    ]) expect(await check(t), t).toEqual([]);
  });

  it('rejects a D10 claim that is true only in D1', async () => {
    expect(await check(`In the D10 chart, Jupiter is in ${X.d1}.`)).toEqual([`Jupiter is in ${X.d10} in the D10, not ${X.d1}`]);
    expect(await check(`The D10 Lagna is ${lagna}.`)).toEqual([`the D10 Lagna is ${d10Lagna}, not ${lagna}`]);
    expect(await check(`In the D10, Jupiter is in the ${X.h1} house.`)).toEqual([`Jupiter is in the ${X.h10} house in the D10, not the ${X.h1}`]);
    expect(await check('In the Dasamsa, the Moon is debilitated.')).toEqual(['Moon is not debilitated in the D10']);
    expect(await check(`In the D9, Jupiter is in ${X.d1}.`)).toEqual([`Jupiter is in ${X.d9} in the D9, not ${X.d1}`]);
  });

  it('rejects a D1 claim that is true only in the D10, and a D10 claim true in neither chart', async () => {
    expect(await check(`Jupiter is in ${X.d10} in the birth chart.`)).toEqual([`Jupiter is in ${X.d1}, not ${X.d10}`]);
    expect(await check(`The Lagna is ${d10Lagna}.`)).toEqual([`the Lagna is ${lagna}, not ${d10Lagna}`]);
    expect(await check('The Sun is debilitated.')).toEqual(['Sun is not debilitated']);
    expect(await check(`Jupiter is in the ${X.h10} house.`)).toEqual([`Jupiter is in the ${X.h1} house, not the ${X.h10}`]);
    expect(await check('In the D10, the Sun is not debilitated.')).toEqual(['Sun is debilitated in the D10']);
    expect(await check(`In the D10 chart, Jupiter sits in ${elsewhere}.`)).toEqual([`Jupiter is in ${X.d10} in the D10, not ${elsewhere}`]);
  });

  it('checks each half of a D1/D10 comparison against its own chart', async () => {
    expect(await check(`Jupiter is in ${X.d1} in the D1 chart but in ${X.d10} in the D10.`)).toEqual([]);
    expect(await check(`In the D1 chart Jupiter is in ${X.d1}, while in the D10 Jupiter is in ${X.d10}.`)).toEqual([]);
    expect(await check(`The Lagna is ${lagna} in the birth chart and the D10 Lagna is ${d10Lagna}.`)).toEqual([]);
    // Swapped: each half is true only in the other chart.
    expect(await check(`In the D1 chart Jupiter is in ${X.d10}, while in the D10 Jupiter is in ${X.d1}.`)).toEqual([`Jupiter is in ${X.d1}, not ${X.d10}`, `Jupiter is in ${X.d10} in the D10, not ${X.d1}`]);
    expect(await check(`Jupiter is in ${X.d10} in the D1 chart but in ${X.d1} in the D10.`)).toEqual([`Jupiter is in ${X.d1}, not ${X.d10}`]);
    expect(await check(`The Lagna is ${d10Lagna} in the birth chart and the D10 Lagna is ${lagna}.`)).toEqual([`the Lagna is ${lagna}, not ${d10Lagna}`, `the D10 Lagna is ${d10Lagna}, not ${lagna}`]);
  });

  it('with an approximate birth time a divisional placement is still refused, and D1 claims are checked as before', async () => {
    expect((await check(`In the D10 chart, Jupiter sits in ${X.d10}.`, 'approximate')).join(' ')).toMatch(/divisional-chart placements depend on the exact birth time/);
    expect((await check(`In the D10 chart the Lagna is ${d10Lagna}.`, 'approximate')).join(' ')).toMatch(/houses and the Lagna must not be stated/);
    expect((await check(`Jupiter is in ${X.d10}.`, 'approximate')).join(' ')).toMatch(new RegExp(`Jupiter is in ${X.d1}, not ${X.d10}|Jupiter's sign is uncertain`));
  });
});
