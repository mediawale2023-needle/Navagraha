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

describe('professional mode matches the consumer chart exactly', () => {
  const CASES = [
    ['1990-08-15', '06:30', 12.9716, 77.5946], ['1969-01-20', '05:00', 40.7128, -74.006],
    ['1985-07-01', '09:15', 51.5074, -0.1278], ['2003-11-02', '23:45', 28.6139, 77.209], ['1995-01-01', '05:45', 27.7172, 85.324],
  ] as const;
  it.each(CASES)('%s %s (%s, %s): longitude, sign, house, nakshatra, pada, Ascendant, D9, D10 and Vimshottari', async (date, time, lat, lng) => {
    const pro = computeJyotishChart(date, time, lat, lng).chartData;
    const c = (await getKundli(date, time, lat, lng)).chartData.canonical;
    expect(pro.canonical.planets.map((p) => p.longitude)).toEqual(c.planets.map((p) => p.longitude));
    for (const p of pro.planets) {
      const x = c.planets.find((q) => q.name === p.planet)!;
      expect([p.sign, p.house, p.nakshatra, p.pada, p.isRetrograde]).toEqual([x.sign, x.house, x.nakshatra.name, x.nakshatra.pada, x.retrograde]);
      expect(Math.abs(p.degree - x.degreeInSign)).toBeLessThan(1e-3);
    }
    expect([pro.ascendant.sign, pro.ascendant.nakshatra, pro.ascendant.pada, pro.ascendant.siderealLon]).toEqual([c.ascendant.sign, c.ascendant.nakshatra.name, c.ascendant.nakshatra.pada, c.ascendant.longitude]);
    const signsIn = (v: { houses: Array<{ sign: string; planets: string[] }> }) => Object.fromEntries(v.houses.flatMap((h) => h.planets.map((g) => [g, h.sign])));
    expect(signsIn(pro.navamsa)).toEqual(Object.fromEntries(c.vargas.D9.placements.map((p) => [p.planet, p.sign])));
    expect(signsIn(pro.dasamsa)).toEqual(Object.fromEntries(c.vargas.D10.placements.map((p) => [p.planet, p.sign])));
    const md = c.dashas.vimshottari.mahadashas;
    expect(pro.vimshottariDasha.map((d: any) => d.planet)).toEqual(md.slice(0, pro.vimshottariDasha.length).map((m) => m.lord));
    pro.vimshottariDasha.forEach((d: any, i: number) => expect(d.endDate).toBe(md[i].end.slice(0, 10)));
  });
});

describe('Chara Dasha is withheld from professional AI evidence unless enabled', () => {
  const profile = { name: 'C', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' };
  const prompt = async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    create.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })());
    await streamTraditionReading('kn_rao', profile, computeJyotishChart('1990-08-15', '06:30', 12.9716, 77.5946).chartData, () => {});
    return create.mock.calls[0][0].messages as Array<{ content: string }>;
  };
  it('default: no Chara periods reach the model and the K.N. Rao method uses two systems', async () => {
    const [system, user] = await prompt();
    expect(user.content).toContain('Jaimini Chara Dasha: WITHHELD');
    expect(user.content).not.toMatch(/Current Chara Mahadasha/);
    expect(system.content).toContain('Vimshottari and Yogini');
    expect(system.content).not.toMatch(/three timing systems/);
  });
  it('FEATURE_CHARA_DASHA=true restores the three-system method', async () => {
    vi.stubEnv('FEATURE_CHARA_DASHA', 'true');
    const [system, user] = await prompt();
    expect(user.content).toMatch(/Chara Mahadasha/);
    expect(system.content).toMatch(/three timing systems/);
  });
});
