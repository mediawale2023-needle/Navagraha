import { describe, expect, it } from 'vitest';
import { detectYogas } from '../../server/astroEngine/yogas';
import { computeDignities } from '../../server/astroEngine/dignity';
import { computeBhava } from '../../server/astroEngine/bhava';

describe('detectYogas', () => {
  it('detects Hamsa Yoga (Jupiter exalted in a kendra)', () => {
    // Cancer ascendant (asc 90°). Jupiter exalted in Cancer (95°) → house 1 (kendra).
    const sidereal: Record<string, number> = {
      Sun: 200, Moon: 95, Mars: 10, Mercury: 210, Jupiter: 95, Venus: 250, Saturn: 185, Rahu: 40, Ketu: 220,
    };
    const ascSidereal = 90;
    const ascSign = 3; // Cancer
    const dignities = computeDignities(sidereal, ascSign, {});
    const bhava = computeBhava(sidereal, ascSidereal);
    const moonSign = 3;
    const yogas = detectYogas(sidereal, ascSign, moonSign, dignities, bhava.houseLords);
    expect(yogas.some((y) => y.name === 'Hamsa Yoga')).toBe(true);
  });

  it('returns an array and never throws on a generic chart', () => {
    const sidereal: Record<string, number> = {
      Sun: 30, Moon: 130, Mars: 250, Mercury: 40, Jupiter: 310, Venus: 70, Saturn: 160, Rahu: 100, Ketu: 280,
    };
    const dignities = computeDignities(sidereal, 0, {});
    const bhava = computeBhava(sidereal, 5);
    const yogas = detectYogas(sidereal, 0, 4, dignities, bhava.houseLords);
    expect(Array.isArray(yogas)).toBe(true);
  });
});
