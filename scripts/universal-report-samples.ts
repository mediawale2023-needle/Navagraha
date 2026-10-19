/**
 * Offline-only representative artifacts for the universal paid-report engine.
 * Narrative calls use deterministic fixtures; this script never reads or calls an OpenAI credential.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jsPDF } from 'jspdf';
import { getKundli } from '../server/astroEngine';
import { generateUniversalReport } from '../server/reportEngine/engine';
import { universalReportConfig } from '../server/reportEngine/registry';
import type { ReportRequester } from '../server/reportEngine/runtime';
import { generateDeterministicCareer, type CareerMetrics } from '../server/careerReportGeneration';
import { buildCareerReportFacts } from '../server/careerReportEvidence';
import { renderGenericReportPdf } from '../client/src/lib/reportPdf';
import { renderCareerPdf } from '../client/src/lib/careerReportPdf';
import { DM_SANS_REGULAR, DM_SANS_SEMIBOLD, ECZAR_SEMIBOLD } from '../client/src/lib/pdf/fonts';
import { ASOF, fixtureChart, SYNTHETIC_CHARTS } from '../tests/fixtures/career-chart';
import { mockedRequester } from '../tests/fixtures/career-premium-replies';

const outputDir = resolve(process.argv[2] || '/private/tmp/navagraha-universal-report-samples');
const prose = (_heading: string, conclusion: string, fact: string) => `This section begins with the verified chart rather than a general prediction. ${fact} This matters because the deterministic assessment for this part is: ${conclusion} The indication describes a tendency to weigh alongside lived experience, not a guaranteed event. A practical response is to observe the relevant pattern over time, choose reversible steps, and review the result before making a larger commitment. The limiting evidence remains part of the reading, so the advice is deliberately measured and specific to what the calculation establishes.`;

const offlineRequester: ReportRequester = async (prompt) => {
  const sections = JSON.parse(prompt.match(/SECTIONS: (\[.*\])\nEVIDENCE:/s)?.[1] || '[]');
  const evidence = JSON.parse(prompt.match(/EVIDENCE: (\[.*\])\n\nRules:/s)?.[1] || '[]');
  const byId = new Map(evidence.map((e: any) => [e.id, e]));
  const generated = sections.map((section: any) => {
    const evidenceId = section.citableEvidenceIds[0];
    const fact = byId.get(evidenceId)?.text || 'The supplied evidence sets a clear limitation for this section.';
    return {
      heading: section.heading,
      body: prose(section.heading, section.conclusion, fact),
      evidenceIds: [evidenceId],
      evidenceLinks: [{ evidenceId, conclusion: section.conclusion, explanation: `This calculated evidence supports the stated section conclusion because it directly supplies the relevant chart factor while the blueprint preserves its limitations.` }],
    };
  });
  return {
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      summary: prose('Report overview', sections[0]?.conclusion || 'Only verified tendencies are stated.', byId.get(sections[0]?.citableEvidenceIds[0])?.text || ''),
      summaryEvidenceIds: sections[0]?.citableEvidenceIds.slice(0, 1) || [], sections: generated, remedies: [],
    }) } }],
    usage: { prompt_tokens: Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4), completion_tokens: 900 },
  };
};

await mkdir(outputDir, { recursive: true });
const exact = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946, { timeAccuracy: 'exact', place: 'A deliberately long synthetic place name, Bengaluru, Karnataka, India' });
const kundli = { ...exact, name: 'Synthetic Offline Reader', dateOfBirth: new Date('1990-08-15'), timeOfBirth: '06:30', placeOfBirth: 'A deliberately long synthetic place name, Bengaluru, Karnataka, India' };
const manifest: any[] = [];

for (const category of ['marriage', 'finance', 'year_ahead', 'life', 'life_complete'] as const) {
  const content: any = await generateUniversalReport(category, kundli, { requester: offlineRequester, asOf: ASOF });
  const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
  renderGenericReportPdf(doc, content);
  await writeFile(resolve(outputDir, `${category}.json`), JSON.stringify(content, null, 2));
  await writeFile(resolve(outputDir, `${category}.pdf`), Buffer.from(doc.output('arraybuffer')));
  manifest.push({ category, sections: content.sections.length, pages: doc.getNumberOfPages(), metrics: content.generationMetrics, renderer: universalReportConfig(category).pdfRenderer, narrative: 'offline deterministic fixture; not GPT-4o quality evidence' });
}

const careerKundli: any = { ...fixtureChart(...SYNTHETIC_CHARTS.kolkata), name: 'Synthetic Offline Career Reader', dateOfBirth: new Date('1977-10-30'), timeOfBirth: '10:25', placeOfBirth: 'Kolkata' };
let careerMetrics: CareerMetrics | undefined;
const career: any = await generateDeterministicCareer(careerKundli, ASOF, mockedRequester(buildCareerReportFacts(careerKundli, ASOF)), { onMetrics: (m) => { careerMetrics = m; }, retryDelaysMs: [0, 0] });
const careerDoc: any = new jsPDF({ unit: 'mm', format: 'a4' });
renderCareerPdf(careerDoc, career, { fonts: { regular: DM_SANS_REGULAR, semibold: DM_SANS_SEMIBOLD, display: ECZAR_SEMIBOLD }, banner: 'OFFLINE FIXTURE — NOT A LIVE GPT-4o QUALITY EVALUATION' });
await writeFile(resolve(outputDir, 'career.json'), JSON.stringify({ ...career, generationMetrics: careerMetrics }, null, 2));
await writeFile(resolve(outputDir, 'career.pdf'), Buffer.from(careerDoc.output('arraybuffer')));
manifest.unshift({ category: 'career', sections: career.sections.length, pages: careerDoc.getNumberOfPages(), metrics: careerMetrics, renderer: 'career-premium', narrative: 'offline deterministic fixture; not GPT-4o quality evidence' });
await writeFile(resolve(outputDir, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), paidCalls: 0, reports: manifest }, null, 2));
console.log(JSON.stringify({ outputDir, reports: manifest }, null, 2));
