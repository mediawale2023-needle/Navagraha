import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source guards supplement route tests without introducing a DOM test dependency.
const page = (name: string) => readFileSync(new URL(`../../client/src/pages/${name}.tsx`, import.meta.url), 'utf8');
describe('P0 consumer UI source regressions', () => {
  it('removes static personalized chart claims while preserving the insights tab', () => {
    const view = page('KundliView');
    for (const claim of ['Moon in 4th House', 'Mars in 10th House', 'Jupiter in 7th House']) expect(view).not.toContain(claim);
    expect(view).toContain('<TabsContent value="insights">');
    expect(view).toContain('Personalized insights are unavailable.');
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
