import { describe, expect, it } from 'vitest';
import { dasamsaSign, shashtiamsaSign, navamsaSign } from '../../server/astroEngine/vedic';

describe('Dasamsa (D10)', () => {
  it('odd sign starts from itself, even sign from the 9th', () => {
    expect(dasamsaSign(0)).toBe(0);   // Aries 0° (odd) → Aries
    expect(dasamsaSign(30)).toBe(9);  // Taurus 0° (even) → Capricorn (9th from Taurus)
    expect(dasamsaSign(3.1)).toBe(1); // Aries 2nd dasamsa → Taurus
  });
  it('always returns a valid sign index', () => {
    for (let lon = 0; lon < 360; lon += 2.3) {
      const s = dasamsaSign(lon);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(12);
    }
  });
});

describe('Shashtiamsa (D60)', () => {
  it('advances one sign per half-degree from the sign', () => {
    expect(shashtiamsaSign(0)).toBe(0);     // Aries 0° → Aries
    expect(shashtiamsaSign(0.6)).toBe(1);   // 0.5°+ → next sign
    expect(shashtiamsaSign(30)).toBe(1);    // Taurus 0° → Taurus
  });
  it('always returns a valid sign index', () => {
    for (let lon = 0; lon < 360; lon += 1.7) {
      const s = shashtiamsaSign(lon);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(12);
    }
  });
});

describe('vargas are distinct divisions', () => {
  it('D9, D10, D60 do not collapse to the same mapping', () => {
    const lon = 17.3;
    const set = new Set([navamsaSign(lon), dasamsaSign(lon), shashtiamsaSign(lon)]);
    expect(set.size).toBeGreaterThan(1);
  });
});
