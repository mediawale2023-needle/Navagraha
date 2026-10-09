import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listedChart } from '../../server/astroEngine/canonical/upgrade';
import { getKundli } from '../../server/astroEngine';
import { prefillFromSearch, recreateHref } from '../../client/src/lib/recreateChart';

const page = (name: string) => readFileSync(new URL(`../../client/src/pages/${name}.tsx`, import.meta.url), 'utf8');

describe('listedChart', () => {
  it('keeps an exact V3 chart as is', async () => {
    const k = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
    const listed = listedChart(k as any);
    expect(listed).toMatchObject({ zodiacSign: 'Cancer', moonSign: 'Taurus', ascendant: 'Leo', timeAccuracy: 'exact', listStatus: 'v3' });
  });
  it('drops only the Ascendant when the birth time is approximate', async () => {
    const k = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
    const listed = listedChart({ ...k, chartData: { ...(k.chartData as any), isBirthTimeApproximate: true } } as any);
    expect(listed).toMatchObject({ zodiacSign: 'Cancer', moonSign: 'Taurus', ascendant: null, timeAccuracy: 'approximate' });
  });
  it('also withholds the Moon sign when the Moon changed sign during an approximate birth date', async () => {
    for (let d = 1; d <= 31; d++) {
      const k = await getKundli(`1990-01-${String(d).padStart(2, '0')}`, '12:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' });
      const stable = (k.chartData as any).canonical.uncertainty.moonSignStableAcrossBirthDate;
      const listed = listedChart(k as any);
      expect(listed.moonSign).toBe(stable ? k.moonSign : null);
      if (!stable) return;
    }
    throw new Error('no unstable-Moon date in January 1990');
  });
  it('hides every placement of a chart the V3 engine has not recalculated', () => {
    const listed = listedChart({ zodiacSign: 'Pisces', moonSign: 'Leo', ascendant: 'Gemini', chartData: { planetaryPositions: [] } } as any);
    expect(listed).toMatchObject({ zodiacSign: null, moonSign: null, ascendant: null, listStatus: 'limited' });
  });
  it('does not mutate its input', () => {
    const input = { zodiacSign: 'Pisces', moonSign: 'Leo', ascendant: 'Gemini', chartData: {} } as any;
    listedChart(input);
    expect(input.ascendant).toBe('Gemini');
  });
});

describe('recreate path for limited charts', () => {
  it('carries name, gender, date and time but never the place', () => {
    const href = recreateHref({ name: 'Old chart', gender: 'female', dateOfBirth: '1985-03-10T00:00:00.000Z', timeOfBirth: '09:00:00' });
    expect(href).toBe('/kundli/new?name=Old+chart&gender=female&dob=1985-03-10&tob=09%3A00');
    expect(href).not.toMatch(/place|Pune/);
  });
  it('ignores malformed values', () => {
    expect(recreateHref({ name: '', gender: 'x', dateOfBirth: 'garbage', timeOfBirth: '25:00' })).toBe('/kundli/new');
    expect(prefillFromSearch('?name=%20&gender=robot&dob=1985-13-40&tob=9am&place=Pune')).toEqual({});
  });
  it('round-trips through the form prefill', () => {
    const href = recreateHref({ name: 'Old chart', gender: 'other', dateOfBirth: '1985-03-10', timeOfBirth: '09:00' });
    expect(prefillFromSearch(href.slice(href.indexOf('?')))).toEqual({ name: 'Old chart', gender: 'other', dateOfBirth: '1985-03-10', timeOfBirth: '09:00' });
  });
});

describe('chart pages never state unverified placements', () => {
  it('My Charts badges approximate and limited charts', () => {
    const src = page('MyCharts');
    expect(src).toContain("k.listStatus === 'limited'");
    expect(src).toContain('Lagna unknown · approx. time');
  });
  it('the Overview takes the Ascendant from the V3 chart and withholds it for approximate time', () => {
    const src = page('KundliView');
    expect(src).not.toContain("{kundli.ascendant || '—'}");
    expect(src).toContain('Unknown — birth time approximate');
  });
  it('a limited chart shows a recreate action and none of its stored placements', () => {
    const src = page('KundliView');
    expect(src).toContain('href={recreateHref(kundli as any)}');
    // The page actions (PDF, "calculated" badge) are withheld for a limited chart.
    expect(src).toMatch(/\{!limited && \(\s*<div[^>]*>\s*<Button[\s\S]*?<TrustBadge variant="calculated" \/>/);
    expect(src).toContain('{!limited && (<>');
    expect(page('KundliNew')).toContain('prefillFromSearch(');
    expect(page('KundliNew')).toMatch(/prefillFromSearch\([^)]*\),\n\s*placeOfBirth: ''/);
  });
});

describe('review follow-ups', () => {
  it('pads a stored H:MM birth time instead of dropping it from the prefill', () => {
    expect(recreateHref({ name: 'A', timeOfBirth: '9:30' })).toBe('/kundli/new?name=A&tob=09%3A30');
    expect(recreateHref({ name: 'A', timeOfBirth: '09:30:00' })).toBe('/kundli/new?name=A&tob=09%3A30');
  });
  it('only a 409 tells the user to recreate the chart; other failures say the period could not load', () => {
    for (const p of ['components/v3/RunningPeriodCard.tsx', 'components/v3/ActiveInfluences.tsx']) {
      const src = readFileSync(new URL(`../../client/src/${p}`, import.meta.url), 'utf8');
      expect(src).toContain('isApiError(error) && error.status === 409');
      expect(src).toMatch(/could not be loaded right now/);
    }
  });
  it('astrologer login treats an unserved route (404) as the server being unavailable', () => {
    expect(page('AstrologerLogin')).toContain('status === 404 || status === 502 || status === 503');
  });
});
