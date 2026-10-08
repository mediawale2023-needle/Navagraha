/**
 * Verdict distribution of the evidence engine over the 44 golden charts, by
 * domain — the calibration check for skew (run: npx tsx scripts/calibration/distribution.ts).
 */
import fixtures from '../../tests/golden/fixtures.json';
import { getKundli } from '../../server/astroEngine/index';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { LIFE_DOMAINS, VERDICTS, type LifeDomain, type Verdict } from '../../shared/v3/evidence';

export const CALIBRATION_AS_OF = new Date('2026-10-07T00:00:00Z');

export async function verdictDistribution(asOf = CALIBRATION_AS_OF) {
  const byDomain = Object.fromEntries(LIFE_DOMAINS.map((d) => [d, Object.fromEntries(VERDICTS.map((v) => [v, 0]))])) as Record<LifeDomain, Record<Verdict, number>>;
  const confidence: Record<string, number> = {};
  for (const { input } of (fixtures as any).cases) {
    const k = await getKundli(input.date, input.time, input.latitude, input.longitude, { timeAccuracy: input.timeAccuracy, timezone: input.expectedTimezone });
    for (const d of buildInsights(k.chartData.canonical, asOf).domains) {
      byDomain[d.domain][d.verdict]++;
      confidence[d.confidence] = (confidence[d.confidence] ?? 0) + 1;
    }
  }
  const total = Object.fromEntries(VERDICTS.map((v) => [v, LIFE_DOMAINS.reduce((s, d) => s + byDomain[d][v], 0)])) as Record<Verdict, number>;
  return { charts: (fixtures as any).cases.length, byDomain, total, confidence };
}

if (process.argv[1]?.endsWith('distribution.ts')) {
  verdictDistribution().then((r) => {
    console.log(`charts: ${r.charts}`);
    console.table(r.byDomain);
    console.log('total', r.total, 'confidence', r.confidence);
  });
}
