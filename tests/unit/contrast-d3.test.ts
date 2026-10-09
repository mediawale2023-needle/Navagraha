// Direction 3 Stage 9: every text/background pairing the design uses meets WCAG AA
// (4.5:1 for body text, 3:1 for large text and non-text marks).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('client/src/index.css', 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const token = (name: string) => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(token(a)), lum(token(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const LIGHT = ['ground', 'surface', 'sunken', 'highlight'];
const BODY: Array<[string, string[]]> = [
  ['ink', [...LIGHT, 'amber']],
  ['ink-muted', LIGHT],
  ['amber-text', LIGHT],
  ['positive', LIGHT],
  ['negative', LIGHT],
  ['on-navy', ['ink']],
  ['on-navy-2', ['ink']],
  ['on-navy-3', ['ink']],
  ['amber', ['ink']],
];

describe('Direction 3 contrast', () => {
  it.each(BODY.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg] as const)))('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('the chart frame and today marker are at least 3:1 against the page', () => {
    expect(ratio('ink', 'highlight')).toBeGreaterThanOrEqual(3);
    expect(ratio('frame', 'ground')).toBeGreaterThanOrEqual(3);
  });
  it('amber is never used as text on a light ground in the consumer pages', () => {
    for (const f of ['Horoscope', 'Panchang', 'Reports', 'KundliNew', 'MyCharts', 'Profile', 'DashaTimeline', 'AIAstrologer', 'KundliView', 'Matchmaking', 'Home']) {
      const src = readFileSync(`client/src/pages/${f}.tsx`, 'utf8');
      expect(src, f).not.toMatch(/\btext-amber(?!-text)\b/);
    }
  });
});
