// Geometry for the Direction 3 Rashi chart in a 300-unit viewBox. The North Indian positions are
// the approved mockup's; the South Indian layout is the standard fixed-sign 4×4 grid.
import { GRAHA_ABBR, GRAHA_HI_ABBR } from './jyotishNames';

export type ChartLabels = 'hi' | 'en';
export type ChartStyle = 'north' | 'south';

export interface Placement { planet: string; signIndex: number; retrograde: boolean }

/** Sign-number position for each North Indian house (house 1 is the top diamond). */
export const NORTH_SIGN_NUMBER: Record<number, [number, number]> = {
  1: [150, 137], 2: [75, 63], 3: [62, 79], 4: [134, 154], 5: [62, 229], 6: [75, 244],
  7: [150, 172], 8: [225, 244], 9: [238, 229], 10: [166, 154], 11: [238, 79], 12: [225, 63],
};

/**
 * Baseline of the planet labels in each North Indian house (the mockup's positions). Labels grow
 * downward from house 1's (it sits under the Lagna label), upward from houses 6 and 8 (at the
 * bottom edge), and are centred on the rest.
 */
export const NORTH_PLANETS: Record<number, [number, number]> = {
  1: [150, 88], 2: [75, 31], 3: [28, 79], 4: [75, 155], 5: [30, 229], 6: [75, 284],
  7: [150, 212], 8: [225, 284], 9: [272, 229], 10: [225, 155], 11: [272, 79], 12: [225, 31],
};
export const NORTH_GROWTH: Record<number, 'down' | 'up' | 'centre'> = { 1: 'down', 6: 'up', 8: 'up' };
export const NORTH_LAGNA_LABEL: [number, number] = [150, 66];

/** The house-1 diamond, drawn in the highlight colour. */
export const LAGNA_DIAMOND = 'M150 1 L225 75 L150 150 L75 75 Z';
export const NORTH_LINES = 'M150 1 L299 150 L150 299 L1 150 Z M1 1 L299 299 M299 1 L1 299';

/** South Indian: [column, row] of each sign (0 = Aries) in the 4×4 grid; the centre four are empty. */
export const SOUTH_CELL: Record<number, [number, number]> = {
  11: [0, 0], 0: [1, 0], 1: [2, 0], 2: [3, 0],
  10: [0, 1], 3: [3, 1],
  9: [0, 2], 4: [3, 2],
  8: [0, 3], 7: [1, 3], 6: [2, 3], 5: [3, 3],
};
export const SOUTH_SIZE = 74.5;

export const LINE = 19;
const COLUMN = { hi: 17, en: 21 } as const;

export const houseOf = (signIndex: number, lagnaSignIndex: number) => ((signIndex - lagnaSignIndex + 12) % 12) + 1;
export const signOfHouse = (house: number, lagnaSignIndex: number) => (lagnaSignIndex + house - 1) % 12;

export const planetAbbr = (planet: string, labels: ChartLabels) => (labels === 'hi' ? GRAHA_HI_ABBR : GRAHA_ABBR)[planet] ?? planet.slice(0, 2);

/** Labels per line: one or two planets share a line, up to four make two lines of two, more make lines of three. */
export const perLine = (n: number) => (n <= 2 ? n : n <= 4 ? 2 : 3);

/** Offsets of each planet label around its house centre. */
export function labelOffsets(count: number, labels: ChartLabels): Array<[number, number]> {
  const cols = Math.max(1, perLine(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, count - row * cols);
    const col = i % cols;
    return [(col - (inRow - 1) / 2) * COLUMN[labels], (row - (rows - 1) / 2) * LINE];
  });
}

/** Planets grouped by the sign they occupy, in a stable graha order. */
export function bySign(placements: Placement[]): Map<number, Placement[]> {
  const order = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const m = new Map<number, Placement[]>();
  for (const p of [...placements].sort((a, b) => order.indexOf(a.planet) - order.indexOf(b.planet))) {
    m.set(p.signIndex, [...(m.get(p.signIndex) ?? []), p]);
  }
  return m;
}

/** Rahu and Ketu always move backwards, so only the true planets carry ℞. */
export const showsRetrograde = (p: Placement) => p.retrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu';
