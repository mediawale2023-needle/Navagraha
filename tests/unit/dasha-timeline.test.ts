// Direction 3 Stage 6: the Dasha timeline page draws the engine's Vimshottari periods and marks
// "now" only where the birth time can vouch for it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { periodLength, shownStatus, timelineView } from '../../client/src/lib/dashaTimeline';
import { activeNav } from '../../client/src/components/shell/navigation';
import type { CanonicalChart } from '../../shared/v3/canonical';

const AS_OF = new Date('2026-10-09T00:00:00Z');
const insightsFor = async (date: string, time: string, timeAccuracy: 'exact' | 'approximate') =>
  buildInsights(((await getKundli(date, time, 12.9716, 77.5946, { timeAccuracy })).chartData as any).canonical as CanonicalChart, AS_OF);

describe('Dasha timeline', () => {
  it('opens on the running Jupiter Mahadasha for the sample chart, with Mercury Antardasha running', async () => {
    const view = timelineView(await insightsFor('1990-08-15', '06:30', 'exact'));
    expect(view.periods.map((p) => p.lord)).toEqual(['Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus', 'Sun']);
    expect(view.current).toBe(3);
    expect(view.initial).toBe(3);
    expect(view.antarKnown).toBe(true);
    const jupiter = view.periods[3];
    expect(periodLength(jupiter)).toBe('16 yrs');
    expect(shownStatus(jupiter, true)).toBe('now');
    expect(jupiter.antardashas!.find((a) => a.status === 'current')!.lord).toBe('Mercury');
    expect(jupiter.antardashas).toHaveLength(9);
  });

  it('marks nothing as running when an approximate birth time could change the period', async () => {
    // 14 Feb 1988, "about 06:00": both the Mahadasha and Antardasha could differ.
    const view = timelineView(await insightsFor('1988-02-14', '06:00', 'approximate'));
    expect(view.current).toBeNull();
    expect(view.initial).toBe(0);
    expect(view.antarKnown).toBe(false);
    expect(view.periods.every((p) => shownStatus(p, view.current !== null) === null)).toBe(true);
    // The sample chart at an approximate time keeps its Mahadasha but not its Antardasha.
    const sample = timelineView(await insightsFor('1990-08-15', '06:30', 'approximate'));
    expect(sample.current).toBe(3);
    expect(sample.antarKnown).toBe(false);
  });

  it('names no house in any period for an approximate birth time', async () => {
    for (const [date, time] of [['1988-02-14', '06:00'], ['1990-08-15', '06:30']]) {
      const insights = await insightsFor(date, time, 'approximate');
      for (const p of insights.timeline.flatMap((m) => [m, ...(m.antardashas ?? [])])) {
        const text = [p.whyItMatters, ...p.domains.flatMap((d) => d.reasons), ...p.supporting, ...p.conflicting].join(' ');
        expect(text).not.toMatch(/\b(1st|2nd|3rd|\d+th) house|dusthana|kendra|trikona/);
      }
    }
  });

  it('writes short periods in months', () => {
    expect(periodLength({ start: '2026-01-01T00:00:00Z', end: '2026-05-01T00:00:00Z' })).toBe('4 mo');
    expect(periodLength({ start: '2020-01-01T00:00:00Z', end: '2026-10-01T00:00:00Z' })).toBe('6.7 yrs');
  });

  it('is the Dasha tab, and the Kundli page links to it instead of repeating it', () => {
    expect(activeNav('/kundli/abc/dasha', '')).toBe('dasha');
    const view = readFileSync(new URL('../../client/src/pages/KundliView.tsx', import.meta.url), 'utf8');
    expect(view).not.toContain('<TabsTrigger value="dashas">');
    expect(view).toContain("tab === 'dashas' || tab === 'insights'");
  });
});
