import { afterEach, expect, it, vi } from 'vitest';
import { callAstroEngine, RUST_CHART_UNAVAILABLE_REASON } from '../../server/astroEngineClient';
import { getKundli } from '../../server/astroEngine';
import { buildRustChartRequest } from '../../server/rustChartAdapter';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('never posts a validated consumer chart to Rust while its coordinate-frame contract is inconsistent', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const input = buildRustChartRequest(await getKundli('1990-08-15', '06:30', 12.9716, 77.5946));
  if (!input.available) throw new Error(input.reason);
  expect(await callAstroEngine(input.request)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('[AstroEngine]', RUST_CHART_UNAVAILABLE_REASON);
});
