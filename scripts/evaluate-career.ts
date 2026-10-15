/** Opt-in, one synthetic report, no dotenv, database, account, wallet or fulfilment imports. */
import OpenAI from 'openai';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCanonicalChart } from '../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../server/astroEngine/birthResolver';
import { careerRequester, generateDeterministicCareer } from '../server/careerReportGeneration';

async function main() {
  const key = process.env.NAVAGRAHA_CAREER_EVAL_API_KEY;
  if (!process.argv.includes('--run') || !key) {
    console.info('UNVERIFIED: supply a dedicated non-production NAVAGRAHA_CAREER_EVAL_API_KEY and --run. No requests sent.');
    process.exitCode = 2; return;
  }
  const canonical = computeCanonicalChart(resolveBirthWithCoordinates({ date: '1985-03-22', time: '06:15', latitude: 28.6139, longitude: 77.2090, timeAccuracy: 'exact' }));
  const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 60_000 });
  const report = await generateDeterministicCareer({ name: 'Career Evaluation — Synthetic Test', chartData: { canonical } }, new Date(), careerRequester(client), {
    onMetrics: (metrics) => console.info(JSON.stringify({ identity: 'synthetic-career-evaluation', ...metrics })),
  });
  const directory = await mkdtemp(join(tmpdir(), 'navagraha-career-eval-'));
  const file = join(directory, 'report.json');
  await writeFile(file, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.info(`Validated report saved for human review: ${file}`);
}
main().catch((error) => { console.error('Evaluation error:', error instanceof Error ? error.message : String(error)); console.error('Live evaluation failed. No order was created. Review the bounded metrics; production delivery remains unverified.'); process.exitCode = 1; });
