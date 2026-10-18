/**
 * MOCKED-CONTENT LAYOUT SAMPLES of the Career Report PDF, from invented charts (no real person) and no model calls:
 *   npx tsx scripts/career-sample-pdfs.ts [out-dir]
 * The deterministic analysis and chart data are real; the paragraphs come from the mocked requester
 * (tests/fixtures/career-premium-replies.ts) and every page is marked as a layout sample.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { ASOF, fixtureChart, SYNTHETIC_CHARTS } from '../tests/fixtures/career-chart';
import { mockedRequester } from '../tests/fixtures/career-premium-replies';
import { buildCareerReportFacts } from '../server/careerReportEvidence';
import { generateDeterministicCareer } from '../server/careerReportGeneration';
import { renderCareerPdf } from '../client/src/lib/careerReportPdf';
import { DM_SANS_REGULAR, DM_SANS_SEMIBOLD, ECZAR_SEMIBOLD } from '../client/src/lib/pdf/fonts';

const OUT = process.argv[2] ?? 'docs/career-evaluations/premium-b';
// Edge cases ride on the samples: a long name and place, and a report with neither.
const SAMPLES: Array<{ chart: keyof typeof SYNTHETIC_CHARTS; name?: string; place?: string }> = [
  { chart: 'delhi', name: 'Synthetic Test Chart A', place: 'New Delhi, Delhi, India' },
  { chart: 'mumbai', name: 'Synthetic Test Chart B with an Unusually Long Name for Layout Testing', place: 'Chhatrapati Shivaji Maharaj Terminus area, Mumbai, Maharashtra, India' },
  { chart: 'chennai' },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const s of SAMPLES) {
    const k = fixtureChart(...SYNTHETIC_CHARTS[s.chart]);
    const report: any = await generateDeterministicCareer({ ...k, name: s.name }, ASOF, mockedRequester(buildCareerReportFacts(k, ASOF)));
    report.birthDetails.placeOfBirth = s.place;
    const doc = renderCareerPdf(new jsPDF({ unit: 'mm', format: 'a4' }), report, {
      fonts: { regular: DM_SANS_REGULAR, semibold: DM_SANS_SEMIBOLD, display: ECZAR_SEMIBOLD },
      banner: 'MOCKED-CONTENT LAYOUT SAMPLE: paragraphs are fixture text, not GPT-4o output',
    });
    const file = `${OUT}/${s.chart}-career-report-layout-sample.pdf`;
    writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    console.info(`${file}: ${doc.getNumberOfPages()} pages`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
