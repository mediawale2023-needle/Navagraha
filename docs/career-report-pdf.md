# Career Report PDF (Milestone B)

`client/src/lib/careerReportPdf.ts` renders the facts-first Career Report as an A4 PDF in the frontend's Direction 3 identity. `downloadReportPdf` sends only reports carrying `careerAnalysis.timeline` there; every other report keeps the existing renderer unchanged.

The renderer reads only the stored report:
- the model's sections;
- the deterministic `careerAnalysis` (`server/careerReportRendering.ts`);
- the canonical chart data.

It calculates and interprets nothing. It makes no model call and needs no new tokens.

## Design: frontend → PDF

Tokens are in `client/src/lib/pdf/tokens.ts` and are reusable by other premium reports. `tests/unit/career-report-pdf.test.ts` checks every colour against `client/src/index.css`.

| Role | Frontend (index.css / SPEC.md) | PDF |
|---|---|---|
| Headings, values, wordmark | Eczar 600 | Eczar 600, embedded (OFL), subset to Latin |
| Body | DM Sans 400 / 600 | DM Sans 400 / 600, embedded (OFL), subset to Latin |
| Navy band | `--ink` #1a1a2e with `--on-navy` #fbf1dc, `--on-navy-2/-3` | cover band, same values |
| Wordmark, rules | `--amber` #e9a84d | same |
| Amber text on cream | `--amber-text` #8a5a12 | section numbers, card labels, Lagna label |
| Cards | `--surface` #fffaf0, 1px `--line` #e5d29a, radius 12px | same colours, radius 2.6mm |
| Tinted panels, current rows | `--highlight` #f6ead0, `--ground` #fbf1dc | same |
| Chart | `--frame` #b6791e double frame, Lagna diamond `--highlight`, lines `--ink` | same geometry (`lib/rashiChart.ts`) |
| Supportive / demanding | filled `--ink` chip / outlined chip (fill, not colour) | same |
| For / against | `--positive` #0b7848 / `--negative` #8b1a1a | strength and challenge accents |

**Print adjustments:**
- **Page tint.** The page is `--surface` rather than `--ground`. That is the frontend's lightest cream, so prints stay close to white while keeping the tint.
- **Type sizes.** Body 9.8pt and captions down to 7.2pt are the frontend's 16px and 12px roles at reading distance on A4.
- **Devanagari.** The glosses are left out: jsPDF cannot shape Devanagari conjuncts, and broken glyphs would be worse than none. Chart labels use the frontend's English abbreviations, and "R" stands for ℞, which neither font has.

## Structure

1. **Cover:**
   - the summary: overall reading (the Kundli's Career verdict), leading fields, work arrangement, main strength and challenge (each the recurring planet with its own evidence), and the current period;
   - limits: the D10 birth-time window, and that the reading gives tendencies;
   - the Executive Summary.
2. **Professional Identity**, with the employment/independent evidence panel.
3. **Strengths and Challenges** cards (engine weights as chips).
4. **D1 and D10:** both charts side by side, a comparison table (D1 and D10 sign, house and dignity; D10 bearing as reinforces / qualifies / contradicts / unresolved), and the overall D10 panel.
5. **Field comparison:**
   - a matrix: rank, reading chip, and the four firmest items for and against each field;
   - what separates neighbouring fields;
   - a paragraph for each field.
6. **Career Timing:** a proportional ten-year Mahadasha/Antardasha timeline, cards for the running and next periods, and the shift.
7. **Strategy**, with numbered steps.
8. **Appendix:** planetary positions with D10, yogas, every Mahadasha, method, and glossary.

**Page and type rules:**
- Running header and footer with page numbers.
- Dates in Indian order ("19 Sep 2029").
- A table that fits a page is kept whole; longer tables repeat their header.
- A field heading moves with its paragraph, and no single line is left alone at a page end.

## Samples

`docs/career-evaluations/premium-b/` (`npx tsx scripts/career-sample-pdfs.ts`) holds three **MOCKED-CONTENT LAYOUT SAMPLES**: Delhi, Mumbai (long name and place) and Chennai (no name or place). Previews of every page are in `previews/`.

The paragraphs are fixture text, so these show layout, not GPT-4o writing.

## Known limits

- Devanagari is left out, as above.
- The appendix's last page is about one third full.
- Field-matrix rows run tall when a field has many indicators; the matrix names the firmest four, plus a count.
- Live text lengths may differ from the fixtures. The renderer flows text, but page count and breaks still need checking on live reports.
