import { describe, expect, it } from 'vitest';
import { signHoroscope, resolveSign, GOCHARA_FAVOURABLE } from '../../server/astroEngine/gochara';
import { getTransits } from '../../server/astroEngine';

const NOW = new Date('2026-10-09T06:00:00Z');

describe('Rashi horoscope from Gochara', () => {
  it('uses the classical favourable houses from the Moon', () => {
    expect(GOCHARA_FAVOURABLE.Jupiter).toEqual([2, 5, 7, 9, 11]);
    expect(GOCHARA_FAVOURABLE.Saturn).toEqual([3, 6, 11]);
    expect(GOCHARA_FAVOURABLE.Moon).toEqual([1, 3, 6, 7, 10, 11]);
  });

  it.each(['Aries', 'Cancer', 'Scorpio', 'Pisces'])('%s: houses and Sade Sati agree with the transit engine', (sign) => {
    const h = signHoroscope(sign, 'today', NOW);
    const t = getTransits(sign, null, undefined, NOW);
    for (const item of h.highlights) {
      const p = t.planets.find((x) => x.planet === item.planet)!;
      expect(item.sign).toBe(p.sign);
      expect(item.houseFromMoon).toBe(p.houseFromMoon);
      expect(item.favourable).toBe(GOCHARA_FAVOURABLE[item.planet].includes(item.houseFromMoon));
    }
    expect(h.sadeSati.active).toBe(t.sadeSati.active);
  });

  it('daily readings lead with the Moon; tomorrow starts a day later', () => {
    const today = signHoroscope('leo', 'today', NOW);
    const tomorrow = signHoroscope('leo', 'tomorrow', NOW);
    expect(today.highlights[0].planet).toBe('Moon');
    expect(today.headline).toMatch(/^Moon in the \d+(st|nd|rd|th): /);
    expect(today.from).toBe('2026-10-09');
    expect(tomorrow.from).toBe('2026-10-10');
  });

  it('weekly and monthly readings cover their window and the Moon is not a single position', () => {
    const week = signHoroscope('virgo', 'weekly', NOW);
    expect([week.from, week.to]).toEqual(['2026-10-09', '2026-10-15']);
    expect(week.highlights.some((i) => i.planet === 'Moon')).toBe(false);
    expect(week.prediction).toMatch(/The Moon this week — /);
    const month = signHoroscope('virgo', 'monthly', NOW);
    expect(month.to).toBe('2026-11-07');
    // The Sun changes sign roughly monthly, so a 30-day window always records it.
    expect(month.highlights.find((i) => i.planet === 'Sun')!.changesTo).toBeDefined();
  });

  it('is deterministic, discloses its basis and makes no health claims', () => {
    for (const sign of ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces']) {
      for (const period of ['today', 'weekly'] as const) {
        const a = signHoroscope(sign, period, NOW);
        expect(signHoroscope(sign, period, NOW)).toEqual(a);
        expect(a.prediction).not.toMatch(/health|illness|disease|lucky/i);
        expect(a.basis).toMatch(/Vedha is not evaluated/);
      }
    }
  });

  it('accepts English and Sanskrit sign names only', () => {
    expect(resolveSign('ARIES')).toBe('Aries');
    expect(resolveSign('meena')).toBe('Pisces');
    expect(resolveSign('ophiuchus')).toBeNull();
    expect(() => signHoroscope('ophiuchus', 'today', NOW)).toThrow(RangeError);
  });
});
