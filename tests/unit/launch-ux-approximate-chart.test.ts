import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { chartTabView } from '../../client/src/lib/approximateChart';
import { SIGN_NAMES, type CanonicalChart } from '../../shared/v3/canonical';

const canonicalOf = async (date: string, time: string, timeAccuracy: 'exact' | 'approximate') =>
  ((await getKundli(date, time, 12.9716, 77.5946, { timeAccuracy })).chartData as any).canonical as CanonicalChart;

describe('chartTabView (approximate birth time)', () => {
  it('leaves an exact-time chart unchanged', async () => {
    expect(chartTabView(await canonicalOf('1990-08-15', '06:30', 'exact'))).toEqual({ mode: 'exact' });
  });

  it('counts houses from the Moon when its sign is stable across the birth date', async () => {
    const chart = await canonicalOf('1988-02-14', '06:00', 'approximate');
    expect(chart.uncertainty.moonSignStableAcrossBirthDate).toBe(true);
    const view = chartTabView(chart);
    expect(view.mode).toBe('chandra');
    if (view.mode !== 'chandra') return;
    const moon = chart.planets.find((p) => p.name === 'Moon')!;
    expect(view.moonSign).toBe(moon.sign);
    expect(view.chartData.planetaryPositions.find((p) => p.planet === 'Moon')!.house).toBe(1);
    expect(view.chartData.planetaryPositions.some((p) => p.planet === 'Ascendant')).toBe(false);
    for (const p of view.chartData.planetaryPositions) {
      const offset = (SIGN_NAMES.indexOf(p.sign as any) - moon.signIndex + 12) % 12;
      expect(p.house).toBe(offset + 1);
    }
    expect(view.chartData.houses[0]).toEqual({ house: 1, sign: moon.sign });
    expect(view.chartData.houses).toHaveLength(12);
  });

  it('falls back to a sign-only table, flagging the Moon, when the Moon changed sign that day', async () => {
    let chart: CanonicalChart | undefined;
    for (let d = 1; d <= 31 && !chart; d++) {
      const c = await canonicalOf(`1990-01-${String(d).padStart(2, '0')}`, '12:00', 'approximate');
      if (!c.uncertainty.moonSignStableAcrossBirthDate) chart = c;
    }
    expect(chart, 'a January 1990 date with a Moon sign change').toBeDefined();
    const view = chartTabView(chart!);
    expect(view.mode).toBe('table');
    if (view.mode !== 'table') return;
    expect(view.rows).toHaveLength(9);
    expect(view.rows.find((r) => r.planet === 'Moon')!.signUncertain).toBe(true);
    expect(view.rows.filter((r) => r.signUncertain)).toHaveLength(1);
    expect(JSON.stringify(view)).not.toMatch(/house|Ascendant/i);
  });

  it('does not mutate the canonical chart', async () => {
    const chart = await canonicalOf('1988-02-14', '06:00', 'approximate');
    const before = JSON.stringify(chart);
    chartTabView(chart);
    expect(JSON.stringify(chart)).toBe(before);
  });
});

describe('Chart tab source guards', () => {
  const view = readFileSync(new URL('../../client/src/pages/KundliView.tsx', import.meta.url), 'utf8');
  it('draws Lagna-based charts, vargas, yogas and house bindus only for an exact time', () => {
    for (const gate of [
      "chartView.mode === 'exact' && chartData?.navamsa?.planetaryPositions",
      "chartView.mode === 'exact' && chartData?.dasamsa?.planetaryPositions",
      "chartView.mode === 'exact' && chartData?.shashtiamsa?.planetaryPositions",
      "chartView.mode === 'exact' && chartData?.yogas?.length > 0",
      "chartView.mode === 'exact' && chartData?.ashtakavarga?.savByHouse",
    ]) expect(view).toContain(gate);
    // With an approximate time the Rashi chart counts houses from the Moon (Chandra Lagna).
    expect(view).toContain("const firstHouseSign = chartView.mode === 'chandra' ? moonPlanet!.signIndex : canonical?.ascendant.signIndex");
    expect(view).toContain("lagnaKnown: chartView.mode === 'exact'");
  });
  it('qualifies an uncertain Moon sign wherever it is stated', () => {
    expect(view).toContain("'Moon sign uncertain'");
    // The Moon's graha card states no sign, dignity or nakshatra the birth time cannot fix.
    expect(view).toContain('moonSignKnown: !moonSignUncertain');
    expect(readFileSync(new URL('../../client/src/components/kundli/GrahaGrid.tsx', import.meta.url), 'utf8')).toContain("sign: signUnknown ? 'Sign uncertain' : p.sign");
    expect(view).toContain('Uncertain — the Moon changed sign on this birth date');
  });
});
