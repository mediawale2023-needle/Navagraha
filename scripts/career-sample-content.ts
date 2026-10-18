/**
 * Sample content for review, from the seven invented charts (no real person) and NO model calls:
 *   npx tsx scripts/career-sample-content.ts [out-dir]
 * For each chart: the deterministic plan, field assessments and comparisons, D1/D10 relations and periods (all
 * written by code, as the report uses them), one real part prompt, and the assembled report whose paragraphs come
 * from the MOCKED requester (tests/fixtures/career-premium-replies.ts) — structure only, not GPT-4o's writing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ASOF, fixtureChart, SYNTHETIC_CHARTS } from '../tests/fixtures/career-chart';
import { mockedRequester } from '../tests/fixtures/career-premium-replies';
import { buildCareerReportFacts } from '../server/careerReportEvidence';
import { careerSectionPrompt } from '../server/careerReportRendering';
import { generateDeterministicCareer, partTokens, type CareerMetrics } from '../server/careerReportGeneration';

const OUT = process.argv[2] ?? 'docs/career-evaluations/premium-a';
const table = (head: string[], rows: Array<Array<string | number>>) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, '/')).join(' | ')} |`)].join('\n');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows: Array<Array<string | number>> = [];
  for (const [name, birth] of Object.entries(SYNTHETIC_CHARTS)) {
    const k = fixtureChart(...birth); const e = buildCareerReportFacts(k, ASOF); const s = e.synthesis; const L = e.ledger;
    const text = (id: string) => L.byId.get(id)!.text;
    let metrics: CareerMetrics | null = null;
    const report = await generateDeterministicCareer(k, ASOF, mockedRequester(e), { onMetrics: (m) => { metrics = m; } });
    const m = metrics!;
    rows.push([name, e.chart.ascendant.sign, `${L.career.verdict} (${L.career.confidence})`, s.order.slice(0, 2).map((f) => s.fields.find((x) => x.id === f)!.label.split(' ')[0]).join(', '), s.workStyle, s.d10.relation, `${s.periods[1].lord} → ${s.periods[2]?.lord ?? '—'}`]);
    const doc = [
      `# ${name}: Career Report sample (Milestone A)`,
      '',
      `Invented birth: ${birth[0]} ${birth[1]} at ${birth[2]}, ${birth[3]} (no real person). Report date ${ASOF.toISOString().slice(0, 10)}. Lagna ${e.chart.ascendant.sign}; 10th lord ${L.lords.tenth}; D10 Lagna lord ${L.lords.d10Lagna}; D10 10th lord ${L.lords.d10Tenth}.`,
      '',
      '> Everything above "Assembled report" is written by code from the canonical chart. In the assembled report the section structure, field leads, steps numbering, appendix and glossary are code; **the paragraphs are MOCKED fixture text**, present only to show the structure. No GPT-4o output appears in this file.',
      '',
      '## The plan every part shares',
      ...Object.entries(s.theses).map(([k2, id]) => `- **${k2}** — ${text(id)}`),
      '',
      '## Field assessments (engine verdict over each field\'s own evidence)',
      table(['Rank', 'Field', 'Verdict', 'For', 'Against'], s.order.map((id, i) => { const f = s.fields.find((x) => x.id === id)!; return [i + 1, f.label, f.verdict, f.supporting.map((x) => L.byId.get(x)!.label).join('; ') || '—', f.conflicting.map((x) => L.byId.get(x)!.label).join('; ') || '—']; })),
      '',
      '### What separates neighbouring fields',
      ...s.comparisons.map((c) => `- ${text(c.itemId)}`),
      '',
      '## D1 and D10',
      ...s.relations.map((r) => `- **${r.relation}** — ${text(r.itemId)}`),
      `- **overall: ${s.d10.relation}** — ${text(s.d10.itemId)}`,
      `- ${text(s.d10.sensitivityId)}`,
      '',
      '## Periods',
      ...s.periods.map((p) => `- ${text(p.itemId)} ${text(p.activationId)}${p.relationId ? ` ${text(p.relationId)} (traditional, not counted)` : ''}`),
      '',
      '## Generation (MOCKED requester)',
      table(['Calls', 'Corrections', 'Estimated cost (USD)', 'Outcome', 'Output allowance per part (tokens)'], [[m.calls, m.corrections, (m.costMicroUsd / 1e6).toFixed(4), m.outcome, e.sections.map((x) => `${x.key} ${partTokens(x)}`).join(', ')]]),
      '',
      'Cost is estimated from the prompt and reply sizes (about 4 bytes a token); it is not a measured API charge.',
      '',
      '<details><summary>The Professional Field Comparison prompt as sent</summary>',
      '',
      '```text',
      careerSectionPrompt(e, e.sections.find((x) => x.key === 'fields')!),
      '```',
      '</details>',
      '',
      '## Assembled report (paragraphs MOCKED)',
      '',
      `_${report.summary}_`,
      ...report.sections.flatMap((x) => ['', `### ${x.heading}`, '', x.body]),
    ].join('\n');
    writeFileSync(`${OUT}/${name}.md`, `${doc}\n`);
    console.info(`${name}: ${m.calls} calls, ${m.corrections} corrections, ${m.outcome}`);
  }
  writeFileSync(`${OUT}/README.md`, [
    '# Career Report Milestone A: sample content',
    '',
    'Seven invented charts. Plans, assessments, comparisons, relations and periods are deterministic and real; report paragraphs are MOCKED (no API key was available). See each chart\'s file.',
    '',
    table(['Chart', 'Lagna', 'Career verdict', 'Leading fields', 'Work style', 'D10 vs D1', 'Sub-period now → next'], rows),
    '',
  ].join('\n'));
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
