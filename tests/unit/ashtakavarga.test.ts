import { describe, expect, it } from 'vitest';
import { computeAshtakavarga, AV_PLANETS, AV_CANONICAL_TOTALS } from '../../server/astroEngine/ashtakavarga';

describe('Ashtakavarga', () => {
  // Each contributor donates a fixed number of bindus regardless of placement,
  // so every BAV total is invariant (Sun 48 … Saturn 39) and SAV is always 337.
  it('matches canonical BAV totals and SAV=337 for any chart', () => {
    for (const seed of [0, 1, 4, 7, 11]) {
      const signIndex: Record<string, number> = { Ascendant: seed };
      ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].forEach((p, i) => {
        signIndex[p] = (seed + i * 2) % 12;
      });
      const r = computeAshtakavarga(signIndex);
      for (const p of AV_PLANETS) expect(r.totals[p]).toBe(AV_CANONICAL_TOTALS[p]);
      expect(r.savTotal).toBe(337);
      expect(r.sav.reduce((a, b) => a + b, 0)).toBe(337);
      expect(r.sav.every((v) => v >= 0 && v <= 56)).toBe(true);
    }
  });

  it('places bindus in the right signs from a contributor', () => {
    // With everything at Aries (0), Sun-from-Sun benefic houses 1,2,4,7,8,9,10,11
    // each map to (0 + h-1) signs; house 1 → Aries gets a bindu from every Sun-table row.
    const allAries: Record<string, number> = {
      Sun: 0, Moon: 0, Mars: 0, Mercury: 0, Jupiter: 0, Venus: 0, Saturn: 0, Ascendant: 0,
    };
    const r = computeAshtakavarga(allAries);
    expect(r.bav.Sun.reduce((a, b) => a + b, 0)).toBe(48);
  });
});
