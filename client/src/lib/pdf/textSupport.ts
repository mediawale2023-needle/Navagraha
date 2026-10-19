/**
 * The embedded PDF fonts and jsPDF text path support Latin-script report text only.
 * Reject other scripts before rendering so a customer never receives a PDF with
 * silently missing or broken Hindi, Marathi, or other unsupported text.
 */
export class UnsupportedPdfTextError extends Error {
  constructor() {
    super('Report PDFs currently support English text only. This report contains unsupported text, so no PDF was downloaded.');
    this.name = 'UnsupportedPdfTextError';
  }
}

const LETTER = new RegExp('\\p{Letter}', 'u');
const LATIN = new RegExp('\\p{Script=Latin}', 'u');

export function assertLatinReportText(content: unknown): void {
  const serialized = JSON.stringify(content) ?? '';
  for (const character of serialized) {
    if (LETTER.test(character) && !LATIN.test(character)) {
      throw new UnsupportedPdfTextError();
    }
  }
}

export function isUnsupportedPdfTextError(error: unknown): error is UnsupportedPdfTextError {
  return error instanceof Error && error.name === 'UnsupportedPdfTextError';
}
