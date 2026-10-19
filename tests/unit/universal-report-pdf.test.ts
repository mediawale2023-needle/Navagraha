import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { renderGenericReportPdf, type ReportContent } from '../../client/src/lib/reportPdf';
import { UNIVERSAL_REPORT_REGISTRY } from '../../server/reportEngine/registry';
import { UnsupportedPdfTextError } from '../../client/src/lib/pdf/textSupport';

const body = 'This offline fixture explains a verified astrological tendency in plain language, connects it to a practical conclusion, and states the limitation without making a guaranteed prediction. '.repeat(3);

describe('universal report PDF adapters', () => {
  it.each(Object.values(UNIVERSAL_REPORT_REGISTRY).filter((c) => c.pdfRenderer === 'generic-premium').map((c) => c.reportId))('%s renders every section with the preserved generic premium renderer', (category) => {
    const config = UNIVERSAL_REPORT_REGISTRY[category];
    const content: ReportContent = { title: config.reportName, summary: body, sections: config.reportSections.map((s) => ({ heading: s.heading, body })), remedies: [], generatedAt: '2026-10-18T00:00:00Z' };
    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    const text = vi.spyOn(doc, 'text');
    expect(() => renderGenericReportPdf(doc, content)).not.toThrow();
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const drawn = text.mock.calls.flatMap((call) => Array.isArray(call[0]) ? call[0] : [call[0]]);
    for (const section of config.reportSections) expect(drawn).toContain(section.heading);
    expect(text.mock.calls.every((call) => typeof call[2] !== 'number' || call[2] <= 289)).toBe(true);
  });

  it('paginates long prose and long place names without dropping content, and accepts missing birth details', () => {
    const config = UNIVERSAL_REPORT_REGISTRY.marriage;
    const marker = 'END-OF-LONG-PARAGRAPH';
    const content: ReportContent = {
      title: config.reportName,
      summary: `${body.repeat(10)} ${marker}`,
      birthDetails: {
        name: 'Synthetic Reader',
        placeOfBirth: 'A deliberately long place name spanning a district, state, country, and additional locality information for wrapping verification',
      },
      sections: config.reportSections.map((section) => ({ heading: section.heading, body: `${body.repeat(12)} ${marker}` })),
      remedies: [`${body.repeat(4)} ${marker}`],
      generatedAt: '2026-10-18T00:00:00Z',
    };
    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    const text = vi.spyOn(doc, 'text');
    expect(() => renderGenericReportPdf(doc, content)).not.toThrow();
    expect(doc.getNumberOfPages()).toBeGreaterThan(10);
    const drawn = text.mock.calls.flatMap((call) => Array.isArray(call[0]) ? call[0] : [call[0]]).map(String);
    expect(drawn.filter((line) => line.includes(marker))).toHaveLength(config.reportSections.length + 2);
    expect(drawn.some((line) => line.includes('additional locality information'))).toBe(true);
    expect(text.mock.calls.every((call) => typeof call[2] !== 'number' || call[2] <= 289)).toBe(true);
  });

  it('rejects unsupported scripts instead of silently omitting customer text', () => {
    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    expect(() => renderGenericReportPdf(doc, { title: 'Marriage Report', birthDetails: { name: 'आशा' }, sections: [] })).toThrow(UnsupportedPdfTextError);
  });
});
