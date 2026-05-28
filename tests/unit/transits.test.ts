import { describe, expect, it } from 'vitest';
import { getTransits } from '../../server/astroEngine/index';

describe('getTransits (Gochar)', () => {
  const t = getTransits('Aries', 'Aries', undefined, new Date('2026-05-27T12:00:00Z'));

  it('returns houses in 1..12 from Moon and Lagna', () => {
    expect(t.planets.length).toBeGreaterThanOrEqual(7);
    for (const p of t.planets) {
      expect(p.houseFromMoon).toBeGreaterThanOrEqual(1);
      expect(p.houseFromMoon).toBeLessThanOrEqual(12);
      expect(p.houseFromLagna).toBeGreaterThanOrEqual(1);
      expect(p.houseFromLagna).toBeLessThanOrEqual(12);
    }
  });

  it('produces a valid Sade Sati assessment', () => {
    expect(typeof t.sadeSati.phase).toBe('string');
    expect(t.sadeSati.houseFromMoon).toBeGreaterThanOrEqual(1);
    expect(t.sadeSati.houseFromMoon).toBeLessThanOrEqual(12);
    // Active iff Saturn is in the 12th/1st/2nd from Moon.
    expect(t.sadeSati.active).toBe([12, 1, 2].includes(t.sadeSati.houseFromMoon));
  });

  it('flags favourable Jupiter transit correctly', () => {
    expect(t.jupiter.favourable).toBe([2, 5, 7, 9, 11].includes(t.jupiter.houseFromMoon));
  });
});
