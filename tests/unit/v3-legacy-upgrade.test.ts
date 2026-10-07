import { describe, expect, it } from 'vitest';
import { upgradeLegacyKundli, chartVersionStatus } from '../../server/astroEngine/canonical/upgrade';
import { getKundli } from '../../server/astroEngine';
import { isCurrentCanonicalChart } from '../../shared/v3/canonical';

const legacyChartData = {
  houses: [], planetaryPositions: [{ planet: 'Sun', sign: 'Leo', degree: 1, house: 1, isRetrograde: false }],
  calculationInputs: { julianDay: 1, latitude: 1, longitude: 1 },
};
const legacy = (over: Record<string, unknown> = {}) => ({
  id: 'k1', userId: 'u1', name: 'Legacy', dateOfBirth: new Date('1990-07-04T00:00:00Z'), timeOfBirth: '12:00',
  placeOfBirth: 'New York', latitude: '40.7128000', longitude: '-74.0060000', gender: null,
  zodiacSign: 'Leo', moonSign: 'Aries', ascendant: 'Virgo', chartData: legacyChartData, dashas: [], doshas: {}, remedies: [], createdAt: null,
  ...over,
}) as any;

describe('legacy chart upgrade', () => {
  it('recalculates in the birthplace time zone, keeps a reversible snapshot and records why', async () => {
    const up = (await upgradeLegacyKundli(legacy()))!;
    const cd = up.chartData as any;
    expect(isCurrentCanonicalChart(cd.canonical)).toBe(true);
    expect(cd.canonical.birth).toMatchObject({ timezone: 'America/New_York', utcOffset: '-04:00', birthUTC: '1990-07-04T16:00:00.000Z' });
    expect(cd.legacySnapshot).toEqual(legacyChartData);
    expect(cd.migration.notes.join(' ')).toMatch(/America\/New_York.*assumed Indian Standard Time/);
    expect(up.moonSign).toBe(cd.canonical.planets.find((p: any) => p.name === 'Moon').sign);
    expect(chartVersionStatus({ chartData: cd }).version).toBe('v3-recalculated-from-legacy');
  });
  it('preserves the approximate-time flag and the original snapshot across a second upgrade', async () => {
    const first = (await upgradeLegacyKundli(legacy({ chartData: { ...legacyChartData, isBirthTimeApproximate: true } })))!;
    expect((first.chartData as any).canonical.birth.timeAccuracy).toBe('approximate');
    expect(await upgradeLegacyKundli(legacy({ chartData: first.chartData }))).toBeNull();
  });
  it('does not guess missing coordinates', async () => {
    const up = (await upgradeLegacyKundli(legacy({ latitude: null, longitude: null })))!;
    expect((up.chartData as any).canonical).toBeUndefined();
    expect((up.chartData as any).limitedReason).toMatch(/no stored birth coordinates/);
    expect(chartVersionStatus({ chartData: up.chartData }).version).toBe('limited');
  });
  it('marks an unparseable stored time as limited rather than inventing one', async () => {
    const up = (await upgradeLegacyKundli(legacy({ timeOfBirth: 'morning' })))!;
    expect((up.chartData as any).limitedReason).toMatch(/could not be recalculated/);
  });
  it('leaves current V3 charts untouched', async () => {
    const nk = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
    expect(await upgradeLegacyKundli(legacy({ chartData: nk.chartData }))).toBeNull();
    expect(chartVersionStatus({ chartData: nk.chartData }).version).toBe('v3');
  });
});
