// Direction 3 design-system guard: one palette, one type scale, no text under 12px.
// The values themselves live in docs/design/direction-3/SPEC.md and client/src/index.css.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const css = readFileSync('client/src/index.css', 'utf8');
const sources = files('client/src').map((p) => [p, readFileSync(p, 'utf8')] as const);
const offenders = (pattern: RegExp) => sources.filter(([, src]) => pattern.test(src)).map(([p]) => p);

const TOKENS: Record<string, string> = {
  ground: '#fbf1dc', surface: '#fffaf0', sunken: '#f3eada', highlight: '#f6ead0',
  line: '#e5d29a', hairline: '#efe2bf', frame: '#b6791e', ink: '#1a1a2e', 'ink-muted': '#6b5a33',
  amber: '#e9a84d', 'amber-text': '#8a5a12', 'on-navy': '#fbf1dc', 'on-navy-2': '#e8dcc0',
  'on-navy-3': '#c9bd9f', 'navy-line': '#3a3a52', 'navy-control': '#4a4a66',
  positive: '#0b7848', negative: '#8b1a1a',
};

describe('Direction 3 tokens', () => {
  it.each(Object.entries(TOKENS))('--%s is %s and has a Tailwind colour', (name, value) => {
    expect(css).toMatch(new RegExp(`\\n  --${name}: ${value};`));
    expect(css).toContain(`--color-${name}: var(--${name});`);
  });

  it('loads exactly the Direction 3 faces', () => {
    expect(css).toContain("family=Eczar:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap");
    expect(css).not.toMatch(/family=Inter|Noto\+Serif/);
  });

  it('has no gradients or drop shadows (the print reset aside)', () => {
    expect(css).not.toMatch(/linear-gradient|radial-gradient/);
    expect(css.match(/box-shadow:/g) ?? []).toHaveLength(1);
  });
});

describe('client styles use the Direction 3 vocabulary', () => {
  it('no pre-Direction-3 colour aliases', () => {
    expect(offenders(/nava-[a-z]/)).toEqual([]);
    expect(css).not.toMatch(/--nava-/);
  });

  it('no text smaller than 12px', () => {
    expect(offenders(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]|text-\[0?\.[0-6]\d*rem\]/)).toEqual([]);
  });

  it('no raw hex colours outside the tokens', () => {
    // jsPDF cannot read CSS variables; the chart SVGs are redrawn from tokens in Stage 4.
    const exempt = ['lib/reportPdf.ts', 'NorthIndianChart.tsx', 'NorthIndianChartEnhanced.tsx'];
    expect(offenders(/#[0-9a-fA-F]{6}\b/).filter((p) => !exempt.some((c) => p.endsWith(c)))).toEqual([]);
  });

  it('no Tailwind amber shades competing with the amber tokens in shared components', () => {
    expect(offenders(/text-amber-[0-9]/).filter((p) => p.includes('components/ui') || p.includes('components/v3'))).toEqual([]);
  });
});
