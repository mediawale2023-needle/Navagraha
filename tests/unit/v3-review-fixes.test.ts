import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { findChartContradictions } from '../../server/agents/askKundli';
import { upgradeLegacyKundli } from '../../server/astroEngine/canonical/upgrade';
import { computePrashna, arudhaLagna } from '../../server/astroEngine/prashna';

describe('code-review follow-ups', () => {
  it('the contradiction guard is case-insensitive', async () => {
    const chart = (await getKundli('1990-08-15', '06:30', 12.9716, 77.5946)).chartData.canonical;
    const moon = chart.planets.find((p) => p.name === 'Moon')!.sign;
    const wrong = moon === 'Leo' ? 'Virgo' : 'Leo';
    expect(findChartContradictions(`your moon is in ${wrong.toLowerCase()}`, chart)).toHaveLength(1);
    expect(findChartContradictions(`MOON IN ${wrong.toUpperCase()}`, chart)).toHaveLength(1);
    expect(findChartContradictions(`your moon is in ${moon.toLowerCase()}`, chart)).toHaveLength(0);
  });

  it('re-upgrading an older canonical keeps the supplied offset that settled a DST fold', async () => {
    const nk = await getKundli('2021-11-07', '01:30', 40.7128, -74.006, { utcOffset: '-05:00' });
    const older = { ...nk.chartData, canonical: { ...nk.chartData.canonical, meta: { ...nk.chartData.canonical.meta, schemaVersion: '2.9.0' } } };
    const kundli = { id: 'k', userId: 'u', name: 'N', dateOfBirth: new Date('2021-11-07T00:00:00Z'), timeOfBirth: '01:30', placeOfBirth: 'New York',
      latitude: '40.7128', longitude: '-74.006', chartData: older } as any;
    const up = (await upgradeLegacyKundli(kundli))!;
    expect((up.chartData as any).canonical.birth.birthUTC).toBe('2021-11-07T06:30:00.000Z');
    expect((up.chartData as any).limitedReason).toBeUndefined();
  });

  it('Prashna takes the Vedic weekday from the sunrise that began the day', () => {
    // 2024-06-01 was a Saturday. 10:00 IST is after sunrise; 03:00 IST on 2024-06-02 is before Sunday's sunrise.
    expect(computePrashna(new Date('2024-06-01T04:30:00Z'), 12.9716, 77.5946, 'career').panchang.vara).toBe('Saturday (Saturn)');
    expect(computePrashna(new Date('2024-06-01T21:30:00Z'), 12.9716, 77.5946, 'career').panchang.vara).toBe('Saturday (Saturn)');
    expect(computePrashna(new Date('2024-06-02T04:30:00Z'), 12.9716, 77.5946, 'career').panchang.vara).toBe('Sunday (Sun)');
  });

  it('the first hora of the day belongs to the weekday lord', () => {
    // Shortly after Bengaluru sunrise (~00:23 UT) on Saturday 2024-06-01.
    expect(computePrashna(new Date('2024-06-01T00:40:00Z'), 12.9716, 77.5946, 'general').panchang.hora_lord).toBe('Saturn');
  });

  it('Arudha Lagna follows the counting rule and its 1st/7th exceptions', () => {
    expect(arudhaLagna(0, 3)).toBe(3); // Aries Lagna, lord in Cancer → count again → Libra, the 7th → take the 10th from Libra = Cancer
    expect(arudhaLagna(0, 1)).toBe(2); // lord in Taurus → Gemini
    expect(arudhaLagna(0, 0)).toBe(9); // lord in Lagna → AL in Lagna → 10th from it
  });
});
