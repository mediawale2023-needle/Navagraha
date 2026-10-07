import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { callAstroEngine, RUST_CHART_UNAVAILABLE_REASON } from '../../server/astroEngineClient';
import { getKundli } from '../../server/astroEngine';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('never posts a chart to Rust /calculate, whose Varga frames are inconsistent', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const chart = (await getKundli('1990-08-15', '06:30', 12.9716, 77.5946)).chartData.canonical;
  const request = {
    planets: chart.planets.map((p) => ({ name: p.name, longitude: p.longitude, house: p.house, is_retrograde: p.retrograde, sign: p.signIndex + 1, nakshatra_pada: p.nakshatra.pada })),
    ascendant_longitude: chart.ascendant.longitude, latitude: chart.birth.latitude, julian_day: chart.meta.julianDayUT,
  };
  expect(await callAstroEngine(request)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('[AstroEngine]', RUST_CHART_UNAVAILABLE_REASON);
});

it('the council no longer has any path to the Rust calculation engine', () => {
  const src = readFileSync('server/agents/orchestrator.ts', 'utf8');
  expect(src).not.toMatch(/callAstroEngine|astroEngineClient|rustChart/);
});
