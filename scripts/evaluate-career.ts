/** Opt-in, one synthetic report, no dotenv, database, account, wallet or fulfilment imports. */
import OpenAI from 'openai';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCanonicalChart } from '../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../server/astroEngine/birthResolver';
import { careerRequester, generateDeterministicCareer, type CareerSectionAttempt } from '../server/careerReportGeneration';

async function main() {
  const key = process.env.NAVAGRAHA_CAREER_EVAL_API_KEY;
  if (!process.argv.includes('--run') || !key) {
    console.info('UNVERIFIED: supply a dedicated non-production NAVAGRAHA_CAREER_EVAL_API_KEY and --run. No requests sent.');
    process.exitCode = 2; return;
  }
  // Synthetic charts only (the test fixtures); never a customer's.
  const CHARTS = {
    delhi: { date: '1985-03-22', time: '06:15', latitude: 28.6139, longitude: 77.2090 },
    belagavi: { date: '1991-11-13', time: '12:30', latitude: 15.8497, longitude: 74.4977 },
    mumbai: { date: '2000-07-04', time: '18:45', latitude: 19.0760, longitude: 72.8777 },
  } as const;
  const name = (process.argv.find((a) => a.startsWith('--chart='))?.slice(8) ?? 'delhi') as keyof typeof CHARTS;
  if (!CHARTS[name]) { console.error(`Unknown --chart; use ${Object.keys(CHARTS).join(', ')}.`); process.exitCode = 2; return; }
  console.info(JSON.stringify({ identity: 'synthetic-career-evaluation', chart: name }));
  const canonical = computeCanonicalChart(resolveBirthWithCoordinates({ ...CHARTS[name], timeAccuracy: 'exact' }));
  const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 60_000 });
  // Every section attempt, accepted or rejected, is kept for review: a failed run is diagnosed from the text.
  const attempts: CareerSectionAttempt[] = [];
  const directory = await mkdtemp(join(tmpdir(), 'navagraha-career-eval-'));
  const file = join(directory, 'report.json');
  let report: unknown = null;
  try {
    report = await generateDeterministicCareer({ name: 'Career Evaluation — Synthetic Test', chartData: { canonical } }, new Date(), careerRequester(client), {
      onMetrics: (metrics) => console.info(JSON.stringify({ identity: 'synthetic-career-evaluation', ...metrics })),
      onSection: (attempt) => attempts.push(attempt),
    });
  } finally {
    await writeFile(file, JSON.stringify({ report, attempts }, null, 2), { mode: 0o600 });
    console.info(`${report ? 'Validated report' : 'Rejected section attempts'} saved for human review: ${file}`);
  }
}
main().catch((error) => { console.error('Evaluation error:', error instanceof Error ? error.message : String(error)); console.error('Live evaluation failed. No order was created. Review the bounded metrics; production delivery remains unverified.'); process.exitCode = 1; });
