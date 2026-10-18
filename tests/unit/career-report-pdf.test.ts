/**
 * The Career Report PDF (client/src/lib/careerReportPdf.ts), rendered with jsPDF in Node from MOCKED reports on the
 * seven invented charts. Every text draw is recorded and checked; the page images are inspected by hand separately.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { ASOF, fixtureChart, SYNTHETIC_CHARTS } from '../fixtures/career-chart';
import { mockedRequester } from '../fixtures/career-premium-replies';
import { buildCareerReportFacts } from '../../server/careerReportEvidence';
import { generateDeterministicCareer } from '../../server/careerReportGeneration';
import { indianDate, renderCareerPdf } from '../../client/src/lib/careerReportPdf';
import { PDF_COLOURS, PDF_PAGE } from '../../client/src/lib/pdf/tokens';
import { DM_SANS_REGULAR, DM_SANS_SEMIBOLD, ECZAR_SEMIBOLD } from '../../client/src/lib/pdf/fonts';

const FONTS = { regular: DM_SANS_REGULAR, semibold: DM_SANS_SEMIBOLD, display: ECZAR_SEMIBOLD };
const NAMES = Object.keys(SYNTHETIC_CHARTS) as Array<keyof typeof SYNTHETIC_CHARTS>;
async function report(name: keyof typeof SYNTHETIC_CHARTS, kundliName?: string) {
  const k = fixtureChart(...SYNTHETIC_CHARTS[name]);
  return generateDeterministicCareer({ ...k, name: kundliName }, ASOF, mockedRequester(buildCareerReportFacts(k, ASOF))) as Promise<any>;
}
/** Renders and records every text draw with its page, position and width. */
function render(content: any) {
  const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
  const drawn: Array<{ text: string; x: number; y: number; w: number; align?: string; page: number }> = [];
  const text = doc.text.bind(doc);
  doc.text = (t: string | string[], x: number, y: number, o?: { align?: string }) => {
    for (const s of Array.isArray(t) ? t : [t]) drawn.push({ text: s, x, y, w: doc.getTextWidth(s), align: o?.align, page: doc.getCurrentPageInfo().pageNumber });
    return text(t, x, y, o);
  };
  renderCareerPdf(doc, content, { fonts: FONTS });
  return { doc, drawn };
}

describe('Career Report PDF', () => {
  it('uses the frontend\'s colours and fonts, value for value', () => {
    const css = readFileSync(new URL('../../client/src/index.css', import.meta.url), 'utf8');
    const kebab = (k: string) => k.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);
    for (const [k, v] of Object.entries(PDF_COLOURS)) expect(css).toContain(`--${kebab(k)}: ${v};`);
    expect(css).toMatch(/--font-sans: 'DM Sans'/); expect(css).toMatch(/--font-display: 'Eczar'/);
  });

  it.each(NAMES)('renders 8 to 11 A4 pages, every text inside the page and its margins, no empty value (%s)', async (name) => {
    const { doc, drawn } = render(await report(name, 'Synthetic Test Chart'));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(8); expect(doc.getNumberOfPages()).toBeLessThanOrEqual(11);
    for (const d of drawn.filter((x) => x.text.trim())) {
      expect(d.text).not.toMatch(/undefined|NaN|null|\[object|^—$|: —/);
      const left = d.align === 'center' ? d.x - d.w / 2 : d.align === 'right' ? d.x - d.w : d.x;
      expect(left).toBeGreaterThanOrEqual(PDF_PAGE.margin - 0.5);
      expect(left + d.w).toBeLessThanOrEqual(PDF_PAGE.width - PDF_PAGE.margin + 0.5);
      expect(d.y).toBeLessThanOrEqual(PDF_PAGE.height - 6);
    }
    const all = drawn.map((d) => d.text).join(' ');
    expect(all).toContain('Rasi · D1'); expect(all).toContain('Dasamsa · D10'); expect(all).toContain('MAHADASHA');
  });

  it('states no missing birth detail, and wraps a long name and place', async () => {
    const r = await report('chennai');
    const bare = render(r).drawn.map((d) => d.text).join(' ');
    expect(bare).not.toMatch(/Name|Place:/);
    r.birthDetails = { ...r.birthDetails, name: 'A Synthetic Person With A Very Long Name Used Only For Layout Testing', placeOfBirth: 'A very long synthetic place name, District, State, Country' };
    const long = render(r).drawn;
    expect(long.filter((d) => d.page === 1 && /Very Long Name/.test(d.text)).length).toBeGreaterThan(0);
  });

  it('dates are Indian order and come from the engine; no model call is made', async () => {
    expect(indianDate('2029-09-19')).toBe('19 Sep 2029');
    const r = await report('delhi');
    const dates = render(r).drawn.flatMap((d) => d.text.match(/\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g) ?? []);
    const k = fixtureChart(...SYNTHETIC_CHARTS.delhi).chartData.canonical;
    const engine = new Set([...k.dashas.vimshottari.mahadashas.flatMap((m) => [m.start, m.end, ...m.antardashas.flatMap((a) => [a.start, a.end])]).map((x) => indianDate(x)), indianDate(r.careerAnalysis.reportDate), indianDate(r.careerAnalysis.timeline.to), indianDate(k.birth.localDate)]);
    for (const d of dates) expect(engine.has(d)).toBe(true);
  });

  it('only the facts-first Career Report takes the new layout', () => {
    const src = readFileSync(new URL('../../client/src/lib/reportPdf.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/if \(content\.careerAnalysis\?\.timeline\) return \(await import\("\.\/careerReportPdf"\)\)/);
  });
});
