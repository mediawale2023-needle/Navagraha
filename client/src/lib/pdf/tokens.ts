/**
 * PDF design tokens: the Direction 3 tokens of client/src/index.css (values from docs/design/direction-3/SPEC.md),
 * adapted for A4 print. Colours are the frontend's, value for value (tests/unit/pdf-tokens.test.ts keeps them in
 * step); sizes are the frontend's type roles in points for paper. Reusable by other premium reports.
 */
export const PDF_COLOURS = {
  ground: '#fbf1dc', surface: '#fffaf0', sunken: '#f3eada', highlight: '#f6ead0', line: '#e5d29a', hairline: '#efe2bf',
  frame: '#b6791e', ink: '#1a1a2e', inkMuted: '#6b5a33', amber: '#e9a84d', amberText: '#8a5a12',
  onNavy: '#fbf1dc', onNavy2: '#e8dcc0', onNavy3: '#c9bd9f', navyLine: '#3a3a52', positive: '#0b7848', negative: '#8b1a1a',
} as const;
export type PdfColour = keyof typeof PDF_COLOURS;

/** The frontend's families: Eczar for headings and values, DM Sans for everything else. */
export const PDF_FONTS = { display: 'Eczar', body: 'DMSans' } as const;

/**
 * Print sizes (pt) for the frontend's roles. On screen the body is 16px at arm's length; on A4 a 10pt body reads at
 * the same comfort, so every role keeps its ratio to the body. The smallest text, 7.5pt, maps the 12px micro role.
 */
export const PDF_TYPE = {
  hero: 26, title: 19, heading: 14, cardTitle: 11.5, value: 13, lead: 10.5, body: 9.8, small: 8.6, caption: 7.8, micro: 7.2,
} as const;
/** Line height of the frontend (1.55), as a multiple of the font size. */
export const PDF_LINE_HEIGHT = 1.5;

/** A4 page geometry in millimetres. */
export const PDF_PAGE = { width: 210, height: 297, margin: 18, top: 24, bottom: 20 } as const;
/** The frontend's radii, scaled to print (12px card ≈ 2.6mm). */
export const PDF_RADIUS = { chip: 1.3, card: 2.6, answer: 3 } as const;

export const rgb = (c: PdfColour): [number, number, number] => {
  const h = PDF_COLOURS[c].slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
