/** Planet labels for the North Indian chart, laid out to stay legible inside each house at phone width. */
export interface LabelPlanet {
  planet: string;
  sign?: string;
  degree?: number;
  isRetrograde?: boolean;
}

export interface PlacedLabel {
  planet: LabelPlanet;
  text: string;
  /** Offset from the house's label anchor, in chart (viewBox) units. */
  dx: number;
  dy: number;
  ariaLabel: string;
}

export const PLANET_FONT_SIZE = 17;
export const LINE_HEIGHT = 19;
const COLUMN_WIDTH = 38;
const ABBR: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke', Ascendant: 'Asc',
};
const RETROGRADE = '℞'; // ℞; the nodes always move backwards, so they carry no mark

export function planetLabel(p: LabelPlanet, opts: { degrees?: boolean } = {}): string {
  const abbr = ABBR[p.planet] ?? p.planet.slice(0, 2);
  const retro = p.isRetrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu' ? RETROGRADE : '';
  const deg = opts.degrees && typeof p.degree === 'number' ? ` ${Math.floor(p.degree)}°` : '';
  return `${abbr}${retro}${deg}`;
}

/** Labels per line: one per line for up to three planets, then two, then three, so a stellium stays inside its house. */
export function perLine(count: number): number {
  return count <= 3 ? 1 : count <= 6 ? 2 : 3;
}

export function layoutHouseLabels(planets: LabelPlanet[], opts: { degrees?: boolean } = {}): PlacedLabel[] {
  const cols = perLine(planets.length);
  const rows = Math.ceil(planets.length / cols);
  return planets.map((p, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, planets.length - row * cols);
    const col = i % cols;
    return {
      planet: p,
      text: planetLabel(p, opts),
      dx: (col - (inRow - 1) / 2) * COLUMN_WIDTH,
      dy: (row - (rows - 1) / 2) * LINE_HEIGHT,
      ariaLabel: `${p.planet === 'Ascendant' ? 'Ascendant' : p.planet}${p.sign ? ` in ${p.sign}` : ''}${p.isRetrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu' ? ', retrograde' : ''}`,
    };
  });
}
