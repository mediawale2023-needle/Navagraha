import { describe, expect, it } from 'vitest';
import { computeRemedies } from '../../server/astroEngine/remedies';
import { computeDignities } from '../../server/astroEngine/dignity';
import { computeBhava } from '../../server/astroEngine/bhava';

describe('computeRemedies (functional)', () => {
  it('treats Saturn as the Yogakaraka for a Taurus ascendant', () => {
    const sidereal: Record<string, number> = {
      Sun: 40, Moon: 130, Mars: 250, Mercury: 50, Jupiter: 310, Venus: 70, Saturn: 280, Rahu: 100, Ketu: 280,
    };
    const ascSidereal = 30; // Taurus 0°
    const dignities = computeDignities(sidereal, 1, {});
    const bhava = computeBhava(sidereal, ascSidereal);
    const remedies = computeRemedies(dignities, bhava.houseLords);
    // Taurus: Saturn lords 9th (trikona) + 10th (kendra) → yogakaraka, strengthened.
    expect(remedies.some((r) => r.focus === 'Saturn' && r.action === 'Strengthen')).toBe(true);
    // Venus is the Ascendant lord → strengthened.
    expect(remedies.some((r) => r.focus === 'Venus' && r.action === 'Strengthen')).toBe(true);
    expect(remedies.length).toBeGreaterThan(0);
    expect(remedies.length).toBeLessThanOrEqual(6);
  });

  it('every remedy has a mantra, day and deity', () => {
    const sidereal: Record<string, number> = {
      Sun: 10, Moon: 200, Mars: 95, Mercury: 25, Jupiter: 160, Venus: 300, Saturn: 60, Rahu: 100, Ketu: 280,
    };
    const dignities = computeDignities(sidereal, 0, {});
    const bhava = computeBhava(sidereal, 0);
    for (const r of computeRemedies(dignities, bhava.houseLords)) {
      expect(r.mantra.length).toBeGreaterThan(0);
      expect(r.day.length).toBeGreaterThan(0);
      expect(r.deity.length).toBeGreaterThan(0);
    }
  });
});
