import { describe, expect, it } from 'vitest';
import { navamsaSign, SIGNS } from '../../server/astroEngine/vedic';

// Sign indices: 0=Aries, 1=Taurus, 2=Gemini, 3=Cancer, 4=Leo, 5=Virgo,
// 6=Libra, 7=Scorpio, 8=Sagittarius, 9=Capricorn, 10=Aquarius, 11=Pisces.
const NAV = 30 / 9; // 3°20'

describe('navamsaSign (D9, Parashari)', () => {
  it('starts each element from the right sign at 0°', () => {
    expect(navamsaSign(0)).toBe(0);     // Aries (fire) → Aries
    expect(navamsaSign(30)).toBe(9);    // Taurus (earth) → Capricorn
    expect(navamsaSign(60)).toBe(6);    // Gemini (air) → Libra
    expect(navamsaSign(90)).toBe(3);    // Cancer (water) → Cancer
    expect(navamsaSign(120)).toBe(0);   // Leo (fire) → Aries
  });

  it('advances one sign per 3°20 navamsa', () => {
    expect(navamsaSign(NAV + 0.1)).toBe(1);     // Aries 2nd navamsa → Taurus
    expect(navamsaSign(2 * NAV + 0.1)).toBe(2); // Aries 3rd navamsa → Gemini
  });

  it("the 9th navamsa of Pisces is Pisces", () => {
    expect(navamsaSign(360 - 0.01)).toBe(11);
  });

  it('always returns a valid sign index', () => {
    for (let lon = 0; lon < 360; lon += 1.111) {
      const idx = navamsaSign(lon);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(12);
      expect(SIGNS[idx]).toBeDefined();
    }
  });
});
