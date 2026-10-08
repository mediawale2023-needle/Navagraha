import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.doUnmock('../../server/astroEngine/canonical/compute.js'); vi.doUnmock('../../server/astroEngine/birthResolver.js'); });

describe('boot-time astronomy self-check', () => {
  it('passes with the installed Swiss Ephemeris, geo-tz/all and ICU', async () => {
    const { runAstronomySelfCheck } = await import('../../server/astroEngine/selfCheck');
    expect(runAstronomySelfCheck()).toEqual({ ok: true, failures: [] });
  });
  it('fails clearly when the ephemeris returns wrong positions (no silent fallback)', async () => {
    vi.doMock('../../server/astroEngine/canonical/compute.js', async (orig) => {
      const real = await orig<typeof import('../../server/astroEngine/canonical/compute')>();
      return { ...real, siderealPositions: (d: Date) => { const r = real.siderealPositions(d); return { ...r, bodies: { ...r.bodies, Moon: { ...r.bodies.Moon, longitude: r.bodies.Moon.longitude + 1 } } }; } };
    });
    const { runAstronomySelfCheck } = await import('../../server/astroEngine/selfCheck');
    const r = runAstronomySelfCheck();
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/Swiss Ephemeris positions: Moon/);
  });
  it('fails clearly when the native module throws', async () => {
    vi.doMock('../../server/astroEngine/canonical/compute.js', async (orig) => ({
      ...await orig<object>(), siderealPositions: () => { throw new Error('sweph binding not loaded'); },
    }));
    const { runAstronomySelfCheck } = await import('../../server/astroEngine/selfCheck');
    expect(runAstronomySelfCheck().failures.join(' ')).toMatch(/sweph binding not loaded/);
  });
  it('fails when the time-zone dataset is the merged (post-1970) one', async () => {
    vi.doMock('../../server/astroEngine/birthResolver.js', async (orig) => ({
      ...await orig<object>(), timeZoneForCoordinates: () => 'Asia/Riyadh',
    }));
    const { runAstronomySelfCheck } = await import('../../server/astroEngine/selfCheck');
    expect(runAstronomySelfCheck().failures.join(' ')).toMatch(/Nairobi resolved to Asia\/Riyadh/);
  });
});
