import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { generateReport } from '../../server/aiAstrologerService';

afterEach(() => vi.unstubAllEnvs());

describe('paid reports for an approximate birth time', () => {
  it('withhold the Lagna, houses, Lagna-based charts and dasha dates, and say why', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const k = await getKundli('1988-02-14', '06:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' });
    const content: any = await generateReport('career', { ...k, name: 'A', dateOfBirth: new Date('1988-02-14'), timeOfBirth: '06:00', placeOfBirth: 'Bengaluru' } as any);
    expect(content.birthDetails.ascendant).toBeUndefined();
    expect(content.birthDetails.timeAccuracy).toBe('approximate');
    expect(content.planetaryPositions.length).toBe(9);
    for (const p of content.planetaryPositions) expect(p.house).toBeUndefined();
    expect(content.chartData).toEqual({});
    expect(content.dashaTimeline).toEqual([]);
    expect(content.disclosure).toMatch(/approximate/);
  });
  it('keep everything for an exact birth time', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const k = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
    const content: any = await generateReport('career', { ...k, name: 'E', dateOfBirth: new Date('1990-08-15'), timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' } as any);
    expect(content.birthDetails.ascendant).toBe(k.ascendant);
    expect(content.dashaTimeline.length).toBeGreaterThan(0);
    expect(content.disclosure).toBeUndefined();
  });
});
