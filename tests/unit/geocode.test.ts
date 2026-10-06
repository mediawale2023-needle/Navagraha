import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBirthCoords } from '../../server/geocode';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Validated birth coordinates', () => {
  it.each([[0, 0], ['12.9716', '77.5946'], [-90, -180]])('accepts supplied coordinates %s, %s without geocoding', async (lat, lng) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await resolveBirthCoords(lat, lng)).toEqual({ lat: Number(lat), lng: Number(lng) });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('resolves the supplied place when coordinates are unavailable', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test');
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ geometry: { location: { lat: 12.97, lng: 77.59 } } }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await resolveBirthCoords(undefined, undefined, 'Bengaluru')).toEqual({ lat: 12.97, lng: 77.59 });
    expect(fetch.mock.calls[0][0]).toContain('address=Bengaluru');
  });
  it.each([[91, 20], [20, 181], ['12junk', '77'], ['', ''], [true, false], [Infinity, NaN]])('rejects invalid %s, %s without a resolvable place', async (lat, lng) => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    expect(await resolveBirthCoords(lat, lng)).toBeNull();
  });
  it.each(['empty', 'badCoordinates', 'http', 'network'])('returns unavailable on %s geocoding failure', async failure => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test');
    vi.stubGlobal('fetch', failure === 'network' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({
      ok: failure !== 'http', json: async () => ({ results: failure === 'empty' ? [] : [{ geometry: { location: { lat: 200, lng: 77 } } }] }),
    }));
    expect(await resolveBirthCoords(undefined, undefined, 'Unknown')).toBeNull();
  });
});
