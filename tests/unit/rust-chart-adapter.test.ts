import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { allPlanetPositions, ascendant } from '../../server/astroEngine/planets';
import { julianDay } from '../../server/astroEngine/core';
import { buildRustChartRequest } from '../../server/rustChartAdapter';

vi.mock('../../server/astroEngineClient', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/astroEngineClient')>(),
  callAstroEngine: vi.fn().mockResolvedValue(null), formatShadbalaSummary: vi.fn(),
}));
vi.mock('openai', () => ({ default: class {
  chat = { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Reading' } }] }) } };
} }));
import { callAstroEngine } from '../../server/astroEngineClient';
import { runCouncil } from '../../server/agents/orchestrator';

const chart = () => getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
const context = { birthDetails: { date: '1990-08-15', time: '06:30', place: 'Bengaluru' }, currentQuery: 'Career' };
beforeEach(() => vi.clearAllMocks());

describe('Consumer Kundli → Rust adapter', () => {
  it('maps real exact inputs, excluding the Ascendant pseudo-planet, with Rust field names', async () => {
    const kundli = await chart();
    const result = buildRustChartRequest(kundli);
    expect(result.available).toBe(true);
    if (!result.available) throw new Error(result.reason);
    const jd = julianDay(new Date('1990-08-15T01:00:00Z'));
    const tropical = allPlanetPositions(jd);
    expect(result.request.julian_day).toBe(jd);
    expect(result.request.latitude).toBe(12.9716);
    expect(result.request.ascendant_longitude).toBe(ascendant(jd, 12.9716, 77.5946));
    expect(result.request.planets).toHaveLength(9);
    for (const planet of result.request.planets) {
      expect(planet.longitude).toBe(tropical[planet.name].lon);
      expect(planet.house).toBe(kundli.chartData.bhava!.chalit.find(p => p.planet === planet.name)!.chalitHouse);
      const sidereal = ((planet.longitude - kundli.chartData.calculationInputs!.ayanamsa) % 360 + 360) % 360;
      expect(planet.sign).toBe(Math.floor(sidereal / 30) + 1);
      expect(planet.nakshatra_pada).toBe(Math.floor(sidereal / (360 / 108)) + 1);
      expect(planet.is_retrograde).toBe(tropical[planet.name].isRetrograde);
    }
    await runCouncil({ ...context, rustChartInput: result });
    expect(callAstroEngine).not.toHaveBeenCalled();
  });

  it.each(['julianDay', 'latitude', 'ascendantLongitude', 'tropicalLongitudes', 'ayanamsa'])(
    'skips Rust if %s is missing; council still responds', async key => {
      const kundli = await chart();
      const inputs = kundli.chartData.calculationInputs!;
      Reflect.deleteProperty(inputs, key);
      const input = buildRustChartRequest(kundli);
      expect(input.available).toBe(false);
      expect(await runCouncil({ ...context, rustChartInput: input })).toBe('Reading');
      expect(callAstroEngine).not.toHaveBeenCalled();
    },
  );

  it('skips legacy charts and unadapted chart context without introducing J2000/zero defaults', async () => {
    const kundli = await chart();
    delete kundli.chartData.calculationInputs;
    expect(buildRustChartRequest(kundli).available).toBe(false);
    await runCouncil({ ...context, chartData: { planets: kundli.chartData } });
    expect(callAstroEngine).not.toHaveBeenCalled();
  });

  it.each(['duplicate', 'missing', 'invalidSign', 'invalidLongitude', 'invalidLatitude', 'inconsistentDegree', 'inconsistentHouse', 'inconsistentChalit'])('rejects %s inputs', async corruption => {
    const kundli = await chart();
    const p = kundli.chartData.planetaryPositions.find(p => p.planet === 'Sun')!;
    if (corruption === 'duplicate') kundli.chartData.planetaryPositions.push(p);
    if (corruption === 'missing') kundli.chartData.planetaryPositions = kundli.chartData.planetaryPositions.filter(p => p.planet !== 'Sun');
    if (corruption === 'invalidSign') p.sign = 'Unknown';
    if (corruption === 'invalidLongitude') kundli.chartData.calculationInputs!.tropicalLongitudes.Sun = NaN;
    if (corruption === 'inconsistentDegree') p.degree = (p.degree + 10) % 30;
    if (corruption === 'inconsistentHouse') p.house = p.house % 12 + 1;
    if (corruption === 'inconsistentChalit') {
      const h = kundli.chartData.bhava!.chalit.find(p => p.planet === 'Sun')!;
      h.chalitHouse = h.chalitHouse % 12 + 1;
    }
    if (corruption === 'invalidLatitude') kundli.chartData.calculationInputs!.latitude = 91;
    const input = buildRustChartRequest(kundli);
    expect(input.available).toBe(false);
    await runCouncil({ ...context, rustChartInput: input });
    expect(callAstroEngine).not.toHaveBeenCalled();
  });

  it('accepts actual zero latitude and an actual J2000 birth instant', async () => {
    const kundli = await getKundli('2000-01-01', '17:30', 0, 0);
    const result = buildRustChartRequest(kundli);
    expect(result.available).toBe(true);
    if (!result.available) throw new Error(result.reason);
    expect(result.request.latitude).toBe(0);
    expect(result.request.julian_day).toBe(2451545);
  });
});
