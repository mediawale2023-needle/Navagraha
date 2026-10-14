/**
 * The answer guard checked every sign, house, Lagna and dignity claim against the D1 chart, so a correct statement
 * about a divisional chart ("in the D10 chart the Lagna is Pisces") was rejected and regenerated — one reason the
 * first production Career Report said almost nothing specific about its D10. A sentence that names a divisional
 * chart may now state what is true there; a claim true in neither chart is still rejected.
 */
import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { validateAnswer } from '../../server/agents/answerGuard';

const ASOF = new Date('2026-10-14T06:00:00Z');
describe('answer guard: divisional-chart claims', () => {
  const check = async (text: string, timeAccuracy: 'exact' | 'approximate' = 'exact') => {
    const c = (await getKundli('1991-11-13', '12:30', 15.8497, 74.4977, { timeAccuracy }) as any).chartData.canonical;
    return validateAnswer(text, { chart: c, packetText: '', running: null, timing: { mahadashaReliable: true, antardashaReliable: true }, asOf: ASOF });
  };
  it('accepts what is true in the divisional chart a sentence names (it used to reject it as a wrong D1 claim)', async () => {
    for (const t of [
      'In the D10 chart the Lagna is Pisces.',
      'In the Dasamsa, Venus sits in Leo.',
      'Venus is in the 6th house of the D10 chart.',
      'In the D10, Jupiter is debilitated in Capricorn.',
      'In the Navamsa (D9), the Sun is in Taurus.',
    ]) expect(await check(t), t).toEqual([]);
  });
  it('still rejects a divisional claim true in neither chart, and a D1 claim that is false', async () => {
    expect(await check('In the D10 chart, Venus sits in Aries.')).toEqual([expect.stringMatching(/Venus is in Virgo \(D10 Leo\), not Aries/)]);
    expect(await check('In the D10 chart the Lagna is Taurus.')).toEqual([expect.stringMatching(/the Lagna is Capricorn, not Taurus/)]);
    expect(await check('Venus is in Leo.')).toEqual([expect.stringMatching(/Venus is in Virgo, not Leo/)]);
    expect(await check('The Lagna is Pisces.')).toEqual([expect.stringMatching(/the Lagna is Capricorn, not Pisces/)]);
    expect(await check('Jupiter is debilitated.')).toEqual([expect.stringMatching(/Jupiter is not debilitated/)]);
    expect(await check('Venus is in the 6th house.')).toEqual([expect.stringMatching(/Venus is in the 9th house, not the 6th/)]);
  });
  it('with an approximate birth time a divisional placement is still refused', async () => {
    expect((await check('In the D10 chart, Venus sits in Leo.', 'approximate')).join(' ')).toMatch(/divisional-chart placements depend on the exact birth time/);
  });
});
