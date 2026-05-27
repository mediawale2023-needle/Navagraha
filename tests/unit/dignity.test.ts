import { describe, expect, it } from 'vitest';
import { computeDignities } from '../../server/astroEngine/dignity';

// Longitudes: Aries 0–30, Taurus 30–60, … Libra 180–210, Pisces 330–360.
function find(rows: ReturnType<typeof computeDignities>, planet: string) {
  return rows.find((r) => r.planet === planet)!;
}

describe('computeDignities', () => {
  it('detects exaltation, debilitation and own sign', () => {
    const sidereal = {
      Sun: 10,    // Aries → exalted
      Moon: 210,  // Scorpio → debilitated
      Mars: 0,    // Aries → own/moolatrikona
      Mercury: 165, // Virgo → exalted
      Jupiter: 95,  // Cancer → exalted
      Venus: 340,   // Pisces → exalted
      Saturn: 185,  // Libra → exalted
    };
    const rows = computeDignities(sidereal, 0, {});
    expect(find(rows, 'Sun').dignity).toBe('Exalted');
    expect(find(rows, 'Moon').dignity).toBe('Debilitated');
    expect(find(rows, 'Saturn').dignity).toBe('Exalted');
    expect(find(rows, 'Jupiter').dignity).toBe('Exalted');
  });

  it('flags combustion near the Sun and not far away', () => {
    const near = computeDignities({ Sun: 100, Mars: 105, Moon: 0, Mercury: 0, Jupiter: 0, Venus: 0, Saturn: 0 }, 0, {});
    expect(find(near, 'Mars').combust).toBe(true);
    const far = computeDignities({ Sun: 100, Mars: 250, Moon: 0, Mercury: 0, Jupiter: 0, Venus: 0, Saturn: 0 }, 0, {});
    expect(find(far, 'Mars').combust).toBe(false);
  });

  it('always returns a dignity for every classical planet', () => {
    const rows = computeDignities({ Sun: 45, Moon: 75, Mars: 200, Mercury: 300, Jupiter: 20, Venus: 130, Saturn: 260 }, 3, {});
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r.dignity.length).toBeGreaterThan(0);
  });
});
