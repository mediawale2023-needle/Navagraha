import { beforeAll, describe, expect, it } from 'vitest';
import { getKundli, getTransits, transitsForChart, transitSummary } from '../../server/astroEngine';
import { mangalCancellations, mangalDosha } from '../../server/astroEngine/doshas';
import { withCurrentDoshaRules } from '../../server/astroEngine/canonical/upgrade';
import { buildEvidencePacket, routeQuestion } from '../../server/agents/askKundli';
import { validateAnswer } from '../../server/agents/answerGuard';
import type { CanonicalChart } from '../../shared/v3/canonical';

const AS_OF = new Date('2026-10-07T00:00:00Z');
// Sign indices: 0 Aries … 11 Pisces.
const [ARIES, TAURUS, GEMINI, CANCER, LEO, , , SCORPIO, , CAPRICORN, AQUARIUS] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('Mangal Dosha cancellations', () => {
  it('flags nothing outside houses 1, 2, 4, 7, 8, 12', () => {
    expect(mangalCancellations(3, LEO, TAURUS)).toEqual([]);
    expect(mangalDosha(3, LEO, TAURUS)).toMatchObject({ present: false, cancelledBy: [] });
  });

  it('cancels for own sign, exaltation and the listed sign exceptions', () => {
    expect(mangalCancellations(1, ARIES, TAURUS)).toEqual(['Mars is in its own sign (Aries)']);
    expect(mangalCancellations(4, SCORPIO, GEMINI)).toEqual(['Mars is in its own sign (Scorpio)']);
    expect(mangalCancellations(7, CAPRICORN, AQUARIUS)).toEqual(['Mars is exalted (Capricorn)']);
    expect(mangalCancellations(2, GEMINI, TAURUS)).toEqual(['Mars in Gemini in house 2 is a listed exception']);
    expect(mangalCancellations(7, CANCER, TAURUS)).toEqual(['Mars in Cancer in house 7 is a listed exception']);
    expect(mangalCancellations(12, TAURUS, CANCER)).toEqual(['Mars in Taurus in house 12 is a listed exception']);
  });

  it("cancels for Jupiter's conjunction or 5th/7th/9th aspect only", () => {
    expect(mangalCancellations(8, LEO, LEO)).toEqual(['Jupiter is conjunct Mars']);
    expect(mangalCancellations(8, LEO, AQUARIUS)).toEqual(['Jupiter aspects Mars (7th-sign aspect)']);
    expect(mangalCancellations(8, LEO, ARIES)).toEqual(['Jupiter aspects Mars (5th-sign aspect)']);
    expect(mangalCancellations(8, LEO, GEMINI)).toEqual([]);
    const d = mangalDosha(8, LEO, GEMINI);
    expect(d.present).toBe(true);
    expect(d.rule).toMatch(/none of the evaluated cancellations/);
  });

  it('a cancelled dosha is not present and says why', () => {
    const d = mangalDosha(7, CAPRICORN, AQUARIUS);
    expect(d.present).toBe(false);
    expect(d.rule).toMatch(/cancelled: Mars is exalted/);
  });
});

describe('charts saved before cancellations were evaluated', () => {
  let chart: CanonicalChart;
  beforeAll(async () => { chart = (await getKundli('1990-08-15', '06:30', 12.9716, 77.5946)).chartData.canonical; });

  it('get the current rule on read, without changing an already current chart', () => {
    const mars = chart.planets.find((p) => p.name === 'Mars')!;
    const jup = chart.planets.find((p) => p.name === 'Jupiter')!;
    const expected = mangalDosha(mars.house, mars.signIndex, jup.signIndex);
    const old = { ...chart, doshas: chart.doshas.map((d) => (d.id === 'mangal' ? { id: d.id, name: d.name, present: !expected.present, rule: 'old rule' } : d)) };
    const kundli = { chartData: { canonical: old }, doshas: { mangalDosha: !expected.present, kaalSarpDosha: false } };
    const view = withCurrentDoshaRules(kundli as any);
    const mangal = (view.chartData as any).canonical.doshas.find((d: any) => d.id === 'mangal');
    expect(mangal).toEqual(expected);
    expect((view.doshas as any).mangalDosha).toBe(expected.present);
    expect((view.doshas as any).kaalSarpDosha).toBe(false);
    expect(kundli.chartData.canonical.doshas.find((d) => d.id === 'mangal')!.rule).toBe('old rule');
    const current = { chartData: { canonical: chart }, doshas: {} };
    expect(withCurrentDoshaRules(current as any)).toBe(current);
  });
});

async function approximateChart(moonStable: boolean): Promise<CanonicalChart> {
  for (let day = 1; day <= 28; day++) {
    const date = `1992-03-${String(day).padStart(2, '0')}`;
    const c = (await getKundli(date, '12:00', 19.076, 72.8777, { timeAccuracy: 'approximate' })).chartData.canonical as CanonicalChart;
    if (c.uncertainty.moonSignStableAcrossBirthDate === moonStable) return c;
  }
  throw new Error('no suitable date');
}

describe('Sade Sati needs a certain Moon sign', () => {
  it('is undetermined, never "not active", when the Moon sign could differ', async () => {
    const chart = await approximateChart(false);
    const t = transitsForChart(chart, undefined, AS_OF);
    expect(t.moonSignCertain).toBe(false);
    expect(t.sadeSati).toMatchObject({ active: false, determined: false });
    const summary = transitSummary(t);
    expect(summary).toMatch(/Sade Sati undetermined/);
    expect(summary).not.toMatch(/th from Moon/);
    expect(summary).not.toMatch(/natal Moon (Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)/);

    const packet = buildEvidencePacket(chart, routeQuestion('Am I in Sade Sati?'), AS_OF, summary);
    expect(validateAnswer('You are not in Sade Sati right now.', packet.guard)).toContain('Sade Sati cannot be determined: the natal Moon sign is uncertain');
    expect(validateAnswer('Sade Sati is running for you.', packet.guard)).not.toEqual([]);
  });

  it('is determined as before when the Moon sign is stable', async () => {
    const chart = await approximateChart(true);
    const t = transitsForChart(chart, undefined, AS_OF);
    expect(t.sadeSati.determined).toBe(true);
    const direct = getTransits(chart.planets.find((p) => p.name === 'Moon')!.sign, null, undefined, AS_OF);
    expect(t.sadeSati.active).toBe(direct.sadeSati.active);
  });
});

describe('answer guard on Mangal Dosha', () => {
  it('refuses any Mangal Dosha claim when the birth time is approximate', async () => {
    const chart = await approximateChart(true);
    const packet = buildEvidencePacket(chart, routeQuestion('Do I have Mangal Dosha?'), AS_OF, 'Sade Sati not active.');
    expect(validateAnswer('You have Mangal Dosha.', packet.guard)).not.toEqual([]);
  });

  it('accepts "present but cancelled" only for a cancelled dosha', async () => {
    const chart = (await getKundli('1990-08-15', '06:30', 12.9716, 77.5946)).chartData.canonical as CanonicalChart;
    const withMangal = (cancelledBy: string[]): CanonicalChart => ({
      ...chart,
      doshas: chart.doshas.map((d) => (d.id === 'mangal' ? { ...d, present: cancelledBy.length === 0, cancelledBy } : d)),
    });
    const cancelled = buildEvidencePacket(withMangal(['Mars is exalted (Capricorn)']), routeQuestion('Do I have Mangal Dosha?'), AS_OF, 'Sade Sati not active.');
    expect(validateAnswer('Mangal Dosha is formed but cancelled by the exalted Mars.', cancelled.guard)).toEqual([]);
    expect(validateAnswer('You have Mangal Dosha.', cancelled.guard)).not.toEqual([]);
    const active = buildEvidencePacket(withMangal([]), routeQuestion('Do I have Mangal Dosha?'), AS_OF, 'Sade Sati not active.');
    expect(validateAnswer('You have Mangal Dosha.', active.guard)).toEqual([]);
  });
});
