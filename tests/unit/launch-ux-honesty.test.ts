import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { reconcileBirthStarRemedies } from '../../server/astroEngine/remedies';
import { withReconciledRemedies } from '../../server/astroEngine/canonical/upgrade';
import { getRemedies } from '../../server/astroEngine/vedic';
import { selectRunningPeriods } from '../../client/src/lib/runningPeriods';

const read = (p: string) => readFileSync(new URL(`../../client/src/${p}`, import.meta.url), 'utf8');
const leoLords = [
  { house: 1, lord: 'Sun' }, { house: 2, lord: 'Mercury' }, { house: 3, lord: 'Venus' }, { house: 4, lord: 'Mars' },
  { house: 5, lord: 'Jupiter' }, { house: 6, lord: 'Saturn' }, { house: 7, lord: 'Saturn' }, { house: 8, lord: 'Jupiter' },
  { house: 9, lord: 'Mars' }, { house: 10, lord: 'Venus' }, { house: 11, lord: 'Mercury' }, { house: 12, lord: 'Moon' },
];

describe('birth-star gemstone follows the functional rules', () => {
  it('drops the gemstone of a planet that rules only a dusthana (Moon = 12th lord for Leo)', () => {
    const out = reconcileBirthStarRemedies(getRemedies('Moon'), 'Moon', leoLords, false);
    expect(out.some((r) => r.type === 'gemstone')).toBe(false);
    expect(out.map((r) => r.type)).toEqual(['mantra', 'charity', 'fasting']);
  });
  it('keeps a trikona lord\'s gemstone (Jupiter owns 5 and 8 for Leo) with a caution, once', () => {
    const once = reconcileBirthStarRemedies(getRemedies('Jupiter'), 'Jupiter', leoLords, false);
    const gem = once.find((r) => r.type === 'gemstone')!;
    expect(gem.description).toMatch(/^Yellow Sapphire — birth-star gemstone for Jupiter\. Consult an astrologer before wearing any gemstone\.$/);
    expect(reconcileBirthStarRemedies(once, 'Jupiter', leoLords, false)).toEqual(once);
  });
  it('never recommends a gemstone for an approximate birth time', () => {
    expect(reconcileBirthStarRemedies(getRemedies('Jupiter'), 'Jupiter', leoLords, true).some((r) => r.type === 'gemstone')).toBe(false);
  });
  it('the audit chart (Leo Lagna, Rohini Moon) no longer gets Pearl, new or already saved', async () => {
    const k: any = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
    expect(k.chartData.canonical.planets.find((p: any) => p.name === 'Moon').nakshatra.name).toBe('Rohini');
    expect(JSON.stringify(k.remedies)).not.toContain('Pearl');
    const savedBefore = { ...k, remedies: getRemedies('Moon') };
    expect(JSON.stringify(savedBefore.remedies)).toContain('Pearl');
    const served = withReconciledRemedies(savedBefore);
    expect(JSON.stringify(served.remedies)).not.toContain('Pearl');
    expect(withReconciledRemedies(served)).toEqual(served);
    expect(savedBefore.remedies).toEqual(getRemedies('Moon'));
  });
});

describe('running periods under an approximate birth time (F40)', () => {
  it('the engine withholds the period the projection would have dated', async () => {
    const k: any = await getKundli('1988-02-14', '06:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' });
    const insights = buildInsights(k.chartData.canonical, new Date('2026-10-08T00:00:00Z'));
    expect(insights.timing?.mahadashaReliable).toBe(false);
    expect(k.dashas.find((d: any) => d.status === 'current')?.period).toBeTruthy();
    expect(selectRunningPeriods(insights).maha).toBeUndefined();
  });
  it('Ask reads periods through the shared selector, not the dated projection', () => {
    const ask = read('pages/AIAstrologer.tsx');
    expect(ask).toContain('selectRunningPeriods(chartInsights)');
    expect(ask).not.toContain('fullKundli?.dashas?.find((d) => d.status === "current")');
    expect(ask).not.toContain('uppercase tracking-wider">Antardasha · Pratidasha<');
    expect(ask).toContain('data-testid="ask-periods-withheld"');
  });
});

describe('labels say only what is true', () => {
  it('the evidence sheet renders the experimental indicators its note mentions', () => {
    const sheet = read('components/AIInsightSheet.tsx');
    expect(sheet).toContain('subject.resolution.experimental.map((e) => <EvidenceRow');
  });
  it('Ask labels each answer by its real source and drops the blanket "Powered by AI"', () => {
    const ask = read('pages/AIAstrologer.tsx');
    expect(ask).not.toContain('Powered by AI');
    expect(ask).toContain('answerSource: data.answerSource');
    expect(ask).toContain(`"From your chart's evidence"`);
    expect(ask).toContain('"AI explanation · checked against your chart"');
  });
});
