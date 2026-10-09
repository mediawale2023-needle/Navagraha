import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source guards supplement route tests without introducing a DOM test dependency.
const page = (name: string) => readFileSync(new URL(`../../client/src/pages/${name}.tsx`, import.meta.url), 'utf8');
describe('P0 consumer UI source regressions', () => {
  it('removes static personalized chart claims while keeping the evidence life timeline', () => {
    const view = page('KundliView');
    for (const claim of ['Moon in 4th House', 'Mars in 10th House', 'Jupiter in 7th House']) expect(view).not.toContain(claim);
    // V3: the life timeline (its own Dasha page) is the evidence engine's, never pre-written chart claims.
    expect(view).toContain('/kundli/${kundliId}/dasha');
    const dasha = page('DashaTimeline');
    expect(dasha).toContain('timelineView(insights)');
    expect(dasha).toContain('<PeriodEvidence p={sel} />');
    expect(view).not.toMatch(/\|\| 'Aries'|\|\| 'Taurus'/);
  });
  it('the evidence sheet carries no fabricated citations or indicator counts', () => {
    const sheet = readFileSync(new URL('../../client/src/components/AIInsightSheet.tsx', import.meta.url), 'utf8');
    expect(sheet).not.toMatch(/Chapter \d+/);
    expect(sheet).not.toContain('Based on 3 strong indicators');
    expect(sheet).not.toContain('signName="Aries"');
    expect(page('KundliView')).not.toContain('baseInsight=');
  });
  it('clearly discloses approximate birth time in creation and viewing', () => {
    const creation = page('KundliNew');
    expect(creation).not.toContain('Sunrise Time Applied');
    expect(creation).not.toContain('Use sunrise');
    expect(creation).toContain('I don’t know the exact birth time');
    expect(creation).toContain('not calculated sunrise');
    expect(creation).toContain('isBirthTimeApproximate,');
    expect(creation).toContain('setIsBirthTimeApproximate(false)');
    expect(page('KundliView')).toContain('Birth time is approximate; Ascendant and house positions may be unreliable.');
  });
  it('passes the actual Prashna place and coordinates without a default city', () => {
    const prashna = page('Prashna');
    expect(prashna).not.toContain('28.6139');
    expect(prashna).not.toContain('77.2090');
    expect(prashna).toContain('place: data.place');
  });
});
