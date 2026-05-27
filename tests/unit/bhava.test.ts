import { describe, expect, it } from 'vitest';
import { computeBhava } from '../../server/astroEngine/bhava';

describe('computeBhava', () => {
  // Aries ascendant (asc at 5° Aries). Sun at 15° Aries (house 1), Saturn 15° Libra (house 7).
  const sidereal = {
    Sun: 15, Moon: 45, Mars: 200, Mercury: 25, Jupiter: 95, Venus: 340, Saturn: 195, Rahu: 100, Ketu: 280,
  };
  const r = computeBhava(sidereal, 5);

  it('assigns 12 house lords with valid placements', () => {
    expect(r.houseLords).toHaveLength(12);
    expect(r.houseLords[0].lord).toBe('Mars'); // Aries asc → 1st lord Mars
    for (const h of r.houseLords) {
      expect(h.lordHouse).toBeGreaterThanOrEqual(1);
      expect(h.lordHouse).toBeLessThanOrEqual(12);
    }
  });

  it('every planet aspects its 7th house', () => {
    for (const a of r.aspects) {
      const self = r.chalit.find((c) => c.planet === a.planet)!;
      const seventh = ((self.rasiHouse - 1 + 6) % 12) + 1;
      expect(a.aspectsHouses).toContain(seventh);
    }
  });

  it('gives Mars its 4th and 8th special aspects', () => {
    const mars = r.aspects.find((a) => a.planet === 'Mars')!;
    const marsHouse = r.chalit.find((c) => c.planet === 'Mars')!.rasiHouse;
    expect(mars.aspectsHouses).toContain(((marsHouse - 1 + 3) % 12) + 1);
    expect(mars.aspectsHouses).toContain(((marsHouse - 1 + 7) % 12) + 1);
  });
});
