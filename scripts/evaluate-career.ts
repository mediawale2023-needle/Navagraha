/**
 * Opt-in LIVE evaluation on invented charts only: no dotenv, database, account, wallet or fulfilment imports.
 *   NAVAGRAHA_CAREER_EVAL_API_KEY=<non-production key> npx tsx scripts/evaluate-career.ts --run [--chart=delhi | --all]
 * Each run writes the report and every section attempt (accepted or rejected) for human review, plus a metrics
 * summary (calls, corrections, failures, cost, latency) across the charts run.
 */
import OpenAI from 'openai';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { careerRequester, generateDeterministicCareer, type CareerMetrics, type CareerSectionAttempt } from '../server/careerReportGeneration';
import { fixtureChart, SYNTHETIC_CHARTS } from '../tests/fixtures/career-chart';

type ChartName = keyof typeof SYNTHETIC_CHARTS;

async function main() {
  const key = process.env.NAVAGRAHA_CAREER_EVAL_API_KEY;
  if (!process.argv.includes('--run') || !key) {
    console.info('UNVERIFIED: supply a dedicated non-production NAVAGRAHA_CAREER_EVAL_API_KEY and --run. No requests sent.');
    process.exitCode = 2; return;
  }
  const names = (Object.keys(SYNTHETIC_CHARTS) as ChartName[]);
  const chosen = process.argv.includes('--all') ? names : [(process.argv.find((a) => a.startsWith('--chart='))?.slice(8) ?? 'delhi') as ChartName];
  if (chosen.some((n) => !SYNTHETIC_CHARTS[n])) { console.error(`Unknown --chart; use ${names.join(', ')} or --all.`); process.exitCode = 2; return; }
  const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 60_000 });
  const directory = await mkdtemp(join(tmpdir(), 'navagraha-career-eval-'));
  const summary: Array<{ chart: ChartName } & Pick<CareerMetrics, 'calls' | 'corrections' | 'correctionRounds' | 'transportRetries' | 'formatRetries' | 'costMicroUsd' | 'durationMs' | 'outcome' | 'failureCategory'>> = [];
  for (const name of chosen) {
    console.info(JSON.stringify({ identity: 'synthetic-career-evaluation', chart: name }));
    // Every section attempt, accepted or rejected, is kept for review: a failed run is diagnosed from the text.
    const attempts: CareerSectionAttempt[] = [];
    let report: unknown = null, metrics: CareerMetrics | null = null;
    try {
      report = await generateDeterministicCareer({ name: 'Career Evaluation — Synthetic Test', chartData: { canonical: fixtureChart(...SYNTHETIC_CHARTS[name]).chartData.canonical } }, new Date(), careerRequester(client), {
        onMetrics: (m) => { metrics = m; },
        onSection: (attempt) => attempts.push(attempt),
      });
    } catch (err) {
      console.error(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await writeFile(join(directory, `${name}.json`), JSON.stringify({ report, attempts, metrics }, null, 2), { mode: 0o600 });
      const m = metrics as CareerMetrics | null;
      if (m) summary.push({ chart: name, calls: m.calls, corrections: m.corrections, correctionRounds: m.correctionRounds, transportRetries: m.transportRetries, formatRetries: m.formatRetries, costMicroUsd: m.costMicroUsd, durationMs: m.durationMs, outcome: m.outcome, failureCategory: m.failureCategory });
    }
  }
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.table(summary.map((s) => ({ ...s, costUsd: (s.costMicroUsd / 1e6).toFixed(4), seconds: (s.durationMs / 1000).toFixed(1) })));
  console.info(`Reports, attempts and summary saved for human review: ${directory}`);
}
main().catch((error) => { console.error('Evaluation error:', error instanceof Error ? error.message : String(error)); console.error('Live evaluation failed. No order was created. Review the bounded metrics; production delivery remains unverified.'); process.exitCode = 1; });
