import { describe, expect, it } from 'vitest';
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
    expect(() => renderGenericReportPdf(doc, content)).not.toThrow();
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('rejects unsupported scripts instead of silently omitting customer text', () => {
    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    expect(() => renderGenericReportPdf(doc, { title: 'Marriage Report', birthDetails: { name: 'आशा' }, sections: [] })).toThrow(UnsupportedPdfTextError);
  });
});
