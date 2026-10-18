/**
 * Opt-in LIVE evaluation on invented charts only: no dotenv, database, account, wallet or fulfilment imports.
 *   NAVAGRAHA_CAREER_EVAL_API_KEY=<non-production key> npx tsx scripts/evaluate-career.ts --run [--chart=delhi | --all] [--out=<dir>]
 * For each chart it writes the complete report text (<chart>.md), the raw report with every section attempt and
 * per-request metrics (<chart>.json), and a summary of calls, corrections, failures, tokens, cost and latency.
 */
import OpenAI from 'openai';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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
  const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
  const directory = out ? (await mkdir(out, { recursive: true }), out) : await mkdtemp(join(tmpdir(), 'navagraha-career-eval-'));
  const summary: Array<{ chart: ChartName; promptTokens: number; completionTokens: number; rejectedAttempts: number } & Pick<CareerMetrics, 'calls' | 'corrections' | 'correctionRounds' | 'transportRetries' | 'formatRetries' | 'costMicroUsd' | 'durationMs' | 'outcome' | 'failureCategory'>> = [];
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
      if (m) summary.push({
        chart: name, calls: m.calls, corrections: m.corrections, correctionRounds: m.correctionRounds, transportRetries: m.transportRetries, formatRetries: m.formatRetries,
        promptTokens: m.attempts.reduce((n, a) => n + (a.promptTokens ?? 0), 0), completionTokens: m.attempts.reduce((n, a) => n + (a.completionTokens ?? 0), 0),
        rejectedAttempts: m.attempts.filter((a) => a.category !== 'accepted').length, costMicroUsd: m.costMicroUsd, durationMs: m.durationMs, outcome: m.outcome, failureCategory: m.failureCategory,
      });
      // The complete report as a reader receives it (synthetic chart; no personal data).
      const r = report as { summary?: string; sections?: Array<{ heading: string; body: string }> } | null;
      const rows = (m?.attempts ?? []).map((a) => `| ${a.section} | ${a.phase} | ${a.attempt} | ${a.category} | ${a.rules.join('; ') || '—'} | ${a.promptTokens ?? '—'} | ${a.completionTokens ?? '—'} | ${(a.costMicroUsd / 1e6).toFixed(4)} | ${(a.durationMs / 1000).toFixed(1)} |`);
      await writeFile(join(directory, `${name}.md`), [`# ${name}: live GPT-4o Career Report (synthetic chart)`, '', m ? `Outcome **${m.outcome}**${m.failureCategory ? ` (${m.failureCategory})` : ''}: ${m.calls} calls, ${m.corrections} corrections in ${m.correctionRounds} rounds, ${m.transportRetries} transport and ${m.formatRetries} format retries, $${(m.costMicroUsd / 1e6).toFixed(4)}, ${(m.durationMs / 1000).toFixed(1)} s.` : 'No metrics.', '',
        '| Part | Phase | Attempt | Category | Rules | Prompt tokens | Completion tokens | Cost (USD) | Seconds |', '|---|---|---|---|---|---|---|---|---|', ...rows, '',
        ...(r?.sections ? [`_${r.summary ?? ''}_`, ...r.sections.flatMap((x) => ['', `## ${x.heading}`, '', x.body])] : ['No report was delivered; the rejected attempts are in the JSON file.'])].join('\n') + '\n');
    }
  }
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.table(summary.map((s) => ({ ...s, costUsd: (s.costMicroUsd / 1e6).toFixed(4), seconds: (s.durationMs / 1000).toFixed(1) })));
  console.info(`Reports, attempts and summary saved for human review: ${directory}`);
}
main().catch((error) => { console.error('Evaluation error:', error instanceof Error ? error.message : String(error)); console.error('Live evaluation failed. No order was created. Review the bounded metrics; production delivery remains unverified.'); process.exitCode = 1; });
