/**
 * The answer guard checked every sign, house, Lagna and dignity claim against the D1 chart, so a correct statement
 * about a divisional chart ("in the D10 chart the Lagna is Pisces") was rejected — one reason the first production
 * Career Report said almost nothing specific about its D10. Each claim is now attributed to one chart (the chart
 * named nearest to it in its clause, else the last chart named before it, else D1) and checked against that chart
 * only: a D10 claim that is true only in D1 is rejected, and so is a D1 claim that is true only in the D10.
 *
 * Chart (13 Nov 1991, 12:30 IST, Belagavi): D1 Lagna Capricorn, D10 Lagna Pisces, D9 Lagna Cancer.
 * Venus: D1 Virgo 9th (debilitated), D10 Leo 6th, D9 Aries. Sun: D1 Libra 10th (debilitated), D10 Gemini 4th
 * (neutral), D9 Taurus. Jupiter: D1 Leo 8th (friend's sign), D10 Capricorn 11th (debilitated). Moon: Capricorn in
 * both D1 (1st) and D10 (11th).
 */
import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { validateAnswer } from '../../server/agents/answerGuard';

const ASOF = new Date('2026-10-14T06:00:00Z');
const check = async (text: string, timeAccuracy: 'exact' | 'approximate' = 'exact') => {
  const c = (await getKundli('1991-11-13', '12:30', 15.8497, 74.4977, { timeAccuracy }) as any).chartData.canonical;
  return validateAnswer(text, { chart: c, packetText: '', running: null, timing: { mahadashaReliable: true, antardashaReliable: true }, asOf: ASOF });
};

describe('answer guard: chart-specific divisional claims', () => {
  it('the fixture is what the comments say', async () => {
    const c = (await getKundli('1991-11-13', '12:30', 15.8497, 74.4977) as any).chartData.canonical;
    const v = (d: string, g: string) => c.vargas[d].placements.find((p: any) => p.planet === g);
    expect([c.ascendant.sign, c.vargas.D10.ascendantSignIndex, c.vargas.D9.ascendantSignIndex]).toEqual(['Capricorn', 11, 3]);
    expect([v('D10', 'Venus').sign, v('D10', 'Venus').house, v('D9', 'Venus').sign, v('D10', 'Sun').sign, v('D10', 'Jupiter').sign, v('D10', 'Moon').sign]).toEqual(['Leo', 6, 'Aries', 'Gemini', 'Capricorn', 'Capricorn']);
  });

  it('accepts a claim true in the chart it is about', async () => {
    for (const t of [
      'In the D10 chart the Lagna is Pisces.',
      'The D10 Lagna is Pisces.',
      'In the Dasamsa, Venus sits in Leo.',
      'Venus sits in Leo in the D10.',
      'Venus is in the 6th house of the D10 chart.',
      'In the D10, Jupiter is debilitated in Capricorn.',
      'In the Navamsa (D9), the Sun is in Taurus.',
      'In the D10 the Moon is in Capricorn, the same sign as in the D1.',
      'Venus is in Virgo.',
      'Venus is in the 9th house.',
    ]) expect(await check(t), t).toEqual([]);
  });

  it('rejects a D10 claim that is true only in D1', async () => {
    expect(await check('In the D10 chart, Venus is in Virgo.')).toEqual(['Venus is in Leo in the D10, not Virgo']);
    expect(await check('The D10 Lagna is Capricorn.')).toEqual(['the D10 Lagna is Pisces, not Capricorn']);
    expect(await check('In the D10, Venus is in the 9th house.')).toEqual(['Venus is in the 6th house in the D10, not the 9th']);
    expect(await check('In the Dasamsa, the Sun is debilitated.')).toEqual(['Sun is not debilitated in the D10']);
    expect(await check('In the D9, Venus is in Virgo.')).toEqual(['Venus is in Aries in the D9, not Virgo']);
  });

  it('rejects a D1 claim that is true only in the D10, and a D10 claim true in neither chart', async () => {
    expect(await check('Venus is in Leo in the birth chart.')).toEqual(['Venus is in Virgo, not Leo']);
    expect(await check('The Lagna is Pisces.')).toEqual(['the Lagna is Capricorn, not Pisces']);
    expect(await check('Jupiter is debilitated.')).toEqual(['Jupiter is not debilitated']);
    expect(await check('Venus is in the 6th house.')).toEqual(['Venus is in the 9th house, not the 6th']);
    expect(await check('In the D10, Jupiter is not debilitated.')).toEqual(['Jupiter is debilitated in the D10']);
    expect(await check('In the D10 chart, Venus sits in Aries.')).toEqual(['Venus is in Leo in the D10, not Aries']);
  });

  it('checks each half of a D1/D10 comparison against its own chart', async () => {
    expect(await check('Venus is in Virgo in the D1 chart but in Leo in the D10.')).toEqual([]);
    expect(await check('In the D1 chart Venus is in Virgo, while in the D10 Venus is in Leo.')).toEqual([]);
    expect(await check('The Lagna is Capricorn in the birth chart and the D10 Lagna is Pisces.')).toEqual([]);
    // Swapped: each half is true only in the other chart.
    expect(await check('In the D1 chart Venus is in Leo, while in the D10 Venus is in Virgo.')).toEqual(['Venus is in Virgo, not Leo', 'Venus is in Leo in the D10, not Virgo']);
    expect(await check('Venus is in Leo in the D1 chart but in Virgo in the D10.')).toEqual(['Venus is in Virgo, not Leo']);
    expect(await check('The Lagna is Pisces in the birth chart and the D10 Lagna is Capricorn.')).toEqual(['the Lagna is Capricorn, not Pisces', 'the D10 Lagna is Pisces, not Capricorn']);
  });

  it('with an approximate birth time a divisional placement is still refused, and D1 claims are checked as before', async () => {
    expect((await check('In the D10 chart, Venus sits in Leo.', 'approximate')).join(' ')).toMatch(/divisional-chart placements depend on the exact birth time/);
    expect((await check('In the D10 chart the Lagna is Pisces.', 'approximate')).join(' ')).toMatch(/houses and the Lagna must not be stated/);
    expect((await check('Venus is in Leo.', 'approximate')).join(' ')).toMatch(/Venus is in Virgo, not Leo|Venus's sign is uncertain/);
  });
});
