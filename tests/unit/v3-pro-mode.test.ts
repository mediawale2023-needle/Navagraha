import { afterEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({ default: class { chat = { completions: { create } }; } }));
import { computeJyotishChart } from '../../server/astroEngine/jyotishEngine';
import { getKundli } from '../../server/astroEngine';
import { answerSessionQuery, streamTraditionReading } from '../../server/jyotishAiService';

afterEach(() => { vi.unstubAllEnvs(); create.mockReset(); });

describe('professional Jyotish consumes the canonical chart', () => {
  it('uses the same astronomy and birth instant as the consumer Kundli', async () => {
    const pro = computeJyotishChart('1990-07-04', '12:00', 40.7128, -74.006);
    const consumer = (await getKundli('1990-07-04', '12:00', 40.7128, -74.006)).chartData.canonical;
    expect(pro.chartData.canonical.birth.birthUTC).toBe('1990-07-04T16:00:00.000Z');
    expect(pro.chartData.canonical.planets.map((p) => p.longitude)).toEqual(consumer.planets.map((p) => p.longitude));
    expect(pro.chartData.ascendant.siderealLon).toBe(consumer.ascendant.longitude);
    for (const p of pro.chartData.planets) {
      const c = consumer.planets.find((x) => x.name === p.planet)!;
      expect([p.sign, p.house, p.nakshatra, p.pada]).toEqual([c.sign, c.house, c.nakshatra.name, c.nakshatra.pada]);
    }
  });

  it.each(['parashar', 'kn_rao', 'kamakhya'] as const)('%s receives the shared evidence graph and the no-citation rule', async (tradition) => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    create.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })());
    const chart = computeJyotishChart('1990-08-15', '06:30', 12.9716, 77.5946);
    const profile = { name: 'Client', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' };
    await streamTraditionReading(tradition, profile, chart.chartData, () => {});
    const { messages } = create.mock.calls[0][0];
    expect(messages[1].content).toContain('Deterministic evidence graph');
    expect(messages[1].content).toContain('Swiss Ephemeris');
    expect(messages[0].content).toMatch(/never quote or number chapters\/verses|Never cite chapter\/verse numbers/);
    expect(messages[0].content).not.toContain('citing BPHS');
  });

  it('discloses an approximate birth time to the professional prompt', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    create.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })());
    const chart = computeJyotishChart('1988-02-14', '06:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' });
    await answerSessionQuery('parashar', { name: 'C', dateOfBirth: '1988-02-14', timeOfBirth: '06:00', placeOfBirth: 'Bengaluru' }, chart.chartData, 'career?', () => {});
    expect(create.mock.calls[0][0].messages[1].content).toContain('birth time APPROXIMATE');
  });
});
