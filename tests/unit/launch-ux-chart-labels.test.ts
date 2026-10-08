import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LINE_HEIGHT, PLANET_FONT_SIZE, layoutHouseLabels, perLine, planetLabel } from '../../client/src/lib/chartLabels';

const nine = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'].map((planet) => ({ planet, sign: 'Cancer', degree: 12.76, isRetrograde: true }));

describe('planet labels', () => {
  it('uses ℞ for retrograde, never ®, and no degrees by default', () => {
    expect(planetLabel({ planet: 'Saturn', degree: 26.16, isRetrograde: true })).toBe('Sa℞');
    expect(planetLabel({ planet: 'Jupiter', degree: 5.57, isRetrograde: false })).toBe('Ju');
    expect(planetLabel({ planet: 'Ascendant', degree: 2.79 })).toBe('Asc');
    for (const p of nine) expect(planetLabel(p)).not.toMatch(/®|°/);
  });
  it('marks no retrograde on the nodes, which always move backwards', () => {
    expect(planetLabel({ planet: 'Rahu', isRetrograde: true })).toBe('Ra');
    expect(planetLabel({ planet: 'Ketu', isRetrograde: true })).toBe('Ke');
  });
  it('can still show whole degrees when asked', () => {
    expect(planetLabel({ planet: 'Moon', degree: 16.55 }, { degrees: true })).toBe('Mo 16°');
  });
  it('gives each planet an accessible name', () => {
    const [sat] = layoutHouseLabels([{ planet: 'Saturn', sign: 'Sagittarius', isRetrograde: true }]);
    expect(sat.ariaLabel).toBe('Saturn in Sagittarius, retrograde');
  });
});

describe('layout keeps a stellium inside its house', () => {
  it('packs more labels per line as a house fills', () => {
    expect([1, 3, 4, 6, 7, 9].map(perLine)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('nine planets fit within three lines, centred on the anchor', () => {
    const placed = layoutHouseLabels(nine);
    const dys = [...new Set(placed.map((p) => p.dy))];
    expect(dys).toHaveLength(3);
    expect(Math.max(...dys) - Math.min(...dys) + PLANET_FONT_SIZE).toBeLessThanOrEqual(3 * LINE_HEIGHT);
    expect(placed.reduce((a, p) => a + p.dx, 0)).toBeCloseTo(0);
    expect(placed.reduce((a, p) => a + p.dy, 0)).toBeCloseTo(0);
  });
  it('labels are legible: at least 17 chart units, up from 9.5', () => {
    expect(PLANET_FONT_SIZE).toBeGreaterThanOrEqual(17);
  });
});

describe('chart component', () => {
  const src = readFileSync(new URL('../../client/src/components/NorthIndianChartEnhanced.tsx', import.meta.url), 'utf8');
  it('renders through the layout helper and is keyboard operable', () => {
    expect(src).not.toContain("'®'");
    expect(src).toContain('layoutHouseLabels(planets)');
    expect(src).toContain("role={onPlanetClick ? 'button' : undefined}");
    expect(src).toContain("e.key === 'Enter' || e.key === ' '");
  });
});
