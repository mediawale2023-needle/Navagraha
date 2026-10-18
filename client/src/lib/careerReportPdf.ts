/**
 * The facts-first Career Report as a premium A4 PDF, in the frontend's Direction 3 identity (tokens in pdf/tokens.ts,
 * fonts in pdf/fonts.ts). Everything it shows comes from the stored report: the model's sections and the
 * deterministic `careerAnalysis` (server/careerReportRendering.ts) with the canonical chart data. Nothing is
 * calculated or interpreted here. Pure over a jsPDF instance, so the browser and the sample script share it.
 */
import { formatPlanetDegree } from './reportFormatting';
import { GRAHA_ABBR } from './jyotishNames';
import { LAGNA_DIAMOND, NORTH_GROWTH, NORTH_LAGNA_LABEL, NORTH_LINES, NORTH_PLANETS, NORTH_SIGN_NUMBER, labelOffsets } from './rashiChart';
import { PDF_FONTS, PDF_LINE_HEIGHT, PDF_PAGE, PDF_RADIUS, PDF_TYPE, rgb, type PdfColour } from './pdf/tokens';
import type { ReportContent } from './reportPdf';

type Doc = any;
type Analysis = NonNullable<ReportContent['careerAnalysis']>;
export interface CareerPdfFonts { regular: string; semibold: string; display: string }
export interface CareerPdfOptions { fonts: CareerPdfFonts; /** Marks every page; for layout samples built from mocked text. */ banner?: string }

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Indian order, day first: "19 Sep 2029". */
export const indianDate = (iso?: string | null) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const { width: PW, height: PH, margin: M, top: TOP, bottom: BOTTOM } = PDF_PAGE;
const CW = PW - 2 * M;
const LIMIT = PH - BOTTOM;
const pt2mm = (pt: number) => pt * 0.3528;
const lineMm = (pt: number) => pt2mm(pt) * PDF_LINE_HEIGHT;
const VERDICT_TONE = (v: string) => (/Exceptional|Very Strong|Strong/.test(v) ? 'support' : /Challenging/.test(v) ? 'strain' : 'neutral');
const toneOfDirection = (d: string) => (d === 'positive' ? 'support' : d === 'negative' ? 'strain' : 'neutral');

export function renderCareerPdf(doc: Doc, content: ReportContent, opts: CareerPdfOptions): Doc {
  const a = content.careerAnalysis as Analysis;
  for (const [file, name, style, data] of [['DMSans-Regular.ttf', PDF_FONTS.body, 'normal', opts.fonts.regular], ['DMSans-SemiBold.ttf', PDF_FONTS.body, 'bold', opts.fonts.semibold], ['Eczar-SemiBold.ttf', PDF_FONTS.display, 'bold', opts.fonts.display]] as const) {
    doc.addFileToVFS(file, data); doc.addFont(file, name, style);
  }
  const bd = content.birthDetails ?? {};
  const sections = new Map((content.sections ?? []).map((s) => [s.heading, s.body]));
  let y = 0;

  // ── Primitives ──────────────────────────────────────────────────────────────
  const font = (kind: 'body' | 'bold' | 'display', size: number, colour: PdfColour = 'ink') => {
    doc.setFont(kind === 'display' ? PDF_FONTS.display : PDF_FONTS.body, kind === 'body' ? 'normal' : 'bold'); doc.setFontSize(size); doc.setTextColor(...rgb(colour));
  };
  const wrap = (text: string, width: number): string[] => doc.splitTextToSize(text, width);
  const fill = (c: PdfColour) => doc.setFillColor(...rgb(c));
  const stroke = (c: PdfColour, w = 0.25) => { doc.setDrawColor(...rgb(c)); doc.setLineWidth(w); };
  const box = (x: number, yy: number, w: number, h: number, bg: PdfColour | null, border: PdfColour | null, r: number = PDF_RADIUS.card) => {
    if (bg) fill(bg); if (border) stroke(border);
    doc.roundedRect(x, yy, w, h, r, r, bg && border ? 'FD' : bg ? 'F' : 'S');
  };
  const page = () => { doc.addPage(); fill('surface'); doc.rect(0, 0, PW, PH, 'F'); y = TOP; };
  const ensure = (h: number) => { if (y + h > LIMIT) page(); };
  /** Draws wrapped text at x and returns the height used. */
  const textBlock = (lines: string[], x: number, yy: number, size: number) => { lines.forEach((l, i) => doc.text(l, x, yy + pt2mm(size) + i * lineMm(size))); return lines.length * lineMm(size); };
  const chip = (label: string, x: number, yy: number, tone: 'support' | 'strain' | 'neutral') => {
    font('bold', PDF_TYPE.micro, tone === 'support' ? 'onNavy' : 'ink');
    const w = doc.getTextWidth(label) + 3.2, h = 4.4;
    if (tone === 'support') box(x, yy, w, h, 'ink', null, PDF_RADIUS.chip);
    else if (tone === 'strain') { stroke('ink', 0.4); doc.roundedRect(x, yy, w, h, PDF_RADIUS.chip, PDF_RADIUS.chip, 'S'); }
    else box(x, yy, w, h, 'highlight', 'line', PDF_RADIUS.chip);
    font('bold', PDF_TYPE.micro, tone === 'support' ? 'onNavy' : 'ink');
    doc.text(label, x + 1.6, yy + 3.05);
    return w;
  };

  // Paragraphs: a body flows across pages; a short lead line (a field name) stays with its paragraph.
  const paragraph = (text: string, opt: { size?: number; colour?: PdfColour; x?: number; width?: number; gap?: number } = {}) => {
    const size = opt.size ?? PDF_TYPE.body, x = opt.x ?? M, width = opt.width ?? CW;
    font('body', size, opt.colour ?? 'ink');
    const lines = wrap(text, width);
    // Never leave a single line at the foot of a page or carry one alone to the next.
    let i = 0;
    while (i < lines.length) {
      const room = Math.floor((LIMIT - y) / lineMm(size));
      if (room < 2 || (lines.length - i > room && lines.length - i - room < 2 && room < lines.length - i)) { page(); font('body', size, opt.colour ?? 'ink'); continue; }
      const take = lines.length - i <= room ? lines.length - i : Math.max(2, room - (lines.length - i - room < 2 ? 1 : 0));
      y += textBlock(lines.slice(i, i + take), x, y, size); i += take;
      if (i < lines.length) { page(); font('body', size, opt.colour ?? 'ink'); }
    }
    y += opt.gap ?? 2.6;
  };
  const sectionTitle = (number: number, title: string, minFollowing = 38) => {
    ensure(22 + minFollowing);
    font('bold', PDF_TYPE.micro, 'amberText'); doc.text(String(number).padStart(2, '0'), M, y + 3);
    font('display', PDF_TYPE.title, 'ink'); doc.text(title, M, y + 11);
    fill('amber'); doc.rect(M, y + 13.6, 14, 0.9, 'F');
    y += 19;
  };
  const subTitle = (title: string, minFollowing = 18) => {
    ensure(9 + minFollowing);
    font('display', PDF_TYPE.heading, 'ink'); doc.text(title, M, y + 5.5); y += 9;
  };
  /** The model's paragraphs for a section, a field lead set as a small heading, numbered steps kept apart. */
  const body = (heading: string) => {
    const text = sections.get(heading); if (!text) return;
    for (const block of text.split('\n\n')) {
      if (block.startsWith('Next steps\n')) {
        subTitle('Next steps', 14);
        for (const step of block.split('\n').slice(1)) {
          const m = step.match(/^(\d+)\.\s+(.*)$/); if (!m) continue;
          font('body', PDF_TYPE.body); const lines = wrap(m[2], CW - 9); ensure(lines.length * lineMm(PDF_TYPE.body) + 2);
          box(M, y + 0.4, 5.6, 5.6, 'ink', null, 2.8); font('bold', PDF_TYPE.micro, 'onNavy'); doc.text(m[1], M + 2.8, y + 4.3, { align: 'center' });
          font('body', PDF_TYPE.body); y += textBlock(lines, M + 9, y, PDF_TYPE.body) + 2.4;
        }
        continue;
      }
      const lead = block.match(/^([A-Z][^.()]+ \((?:[a-z ]+ reading|too little evidence to judge)\)\.)\s+([\s\S]*)$/);
      // A field's name never stands alone: a short paragraph moves with it whole, a long one by four lines.
      if (lead) { font('body', PDF_TYPE.body); const n = wrap(lead[2], CW).length; ensure(6.2 + (n <= 7 ? n : 4) * lineMm(PDF_TYPE.body) + 1); font('display', PDF_TYPE.cardTitle, 'ink'); doc.text(lead[1].replace(/\.$/, ''), M, y + 4); y += 6.2; paragraph(lead[2]); }
      else paragraph(block);
    }
  };

  // Tables: header repeated after a break, a row never split, wrapped cells.
  type Cell = string | { chip: string; tone: 'support' | 'strain' | 'neutral' };
  const table = (head: string[], widths: number[], rows: Cell[][], opt: { size?: number; highlight?: (i: number) => boolean; bold?: number[] } = {}) => {
    const size = opt.size ?? PDF_TYPE.small, pad = 1.8;
    const header = () => {
      font('bold', PDF_TYPE.micro, 'inkMuted'); let x = M;
      head.forEach((h, i) => { doc.text(h.toUpperCase(), x + pad, y + 4); x += widths[i]; });
      stroke('line', 0.35); doc.line(M, y + 6, M + CW, y + 6); y += 6.6;
    };
    // A table that fits on one page is kept whole; a longer one breaks between rows with its header repeated.
    const heights = rows.map((row) => Math.max(...row.map((c, i) => { if (typeof c !== 'string') return 4.6; font(opt.bold?.includes(i) ? 'bold' : 'body', size); return wrap(c, widths[i] - 2 * pad).length * lineMm(size); })) + 2.6);
    const total = 6.6 + heights.reduce((n, h) => n + h, 0);
    ensure(total < LIMIT - TOP ? total : 6.6 + 8); header();
    rows.forEach((row, ri) => {
      const cells = row.map((c, i) => { if (typeof c !== 'string') return null; font(opt.bold?.includes(i) ? 'bold' : 'body', size); return wrap(c, widths[i] - 2 * pad); });
      const h = Math.max(...cells.map((c) => (c ? c.length * lineMm(size) : 4.6))) + 2.6;
      if (y + h > LIMIT) { page(); header(); }
      if (opt.highlight?.(ri)) { fill('highlight'); doc.rect(M, y - 0.4, CW, h, 'F'); }
      let x = M;
      row.forEach((c, i) => {
        if (typeof c === 'string') { font(opt.bold?.includes(i) ? 'bold' : 'body', size); textBlock(cells[i]!, x + pad, y + 0.6, size); }
        else chip(c.chip, x + pad, y + 0.8, c.tone);
        x += widths[i];
      });
      y += h; stroke('hairline', 0.25); doc.line(M, y - 0.4, M + CW, y - 0.4);
    });
    y += 3;
  };

  // A North Indian chart in the frontend's geometry (lib/rashiChart.ts), English labels.
  const chart = (x0: number, y0: number, side: number, lagnaSign: number, placements: Array<{ planet: string; sign: number; retrograde?: boolean }>, caption: string) => {
    const k = side / 300, X = (u: number) => x0 + u * k, Y = (u: number) => y0 + u * k;
    stroke('frame', 0.25); doc.rect(X(-10), Y(-10), side + 20 * k, side + 20 * k);
    stroke('frame', 0.6); doc.rect(X(-6), Y(-6), side + 12 * k, side + 12 * k);
    fill('surface'); doc.rect(X(0), Y(0), side, side, 'F');
    const pts = LAGNA_DIAMOND.match(/\d+ \d+/g)!.map((p) => p.split(' ').map(Number));
    fill('highlight'); doc.triangle(X(pts[0][0]), Y(pts[0][1]), X(pts[1][0]), Y(pts[1][1]), X(pts[2][0]), Y(pts[2][1]), 'F'); doc.triangle(X(pts[0][0]), Y(pts[0][1]), X(pts[2][0]), Y(pts[2][1]), X(pts[3][0]), Y(pts[3][1]), 'F');
    stroke('ink', 0.35); doc.rect(X(0), Y(0), side, side);
    stroke('ink', 0.22);
    for (const seg of NORTH_LINES.split('M').filter(Boolean)) {
      const p = seg.trim().replace(/Z$/, '').split(/ ?L ?/).map((q) => q.trim().split(' ').map(Number));
      const closed = /Z\s*$/.test(seg.trim());
      for (let i = 0; i < p.length - 1; i++) doc.line(X(p[i][0]), Y(p[i][1]), X(p[i + 1][0]), Y(p[i + 1][1]));
      if (closed) doc.line(X(p[p.length - 1][0]), Y(p[p.length - 1][1]), X(p[0][0]), Y(p[0][1]));
    }
    for (let h = 1; h <= 12; h++) { font('body', PDF_TYPE.micro * 0.95, 'inkMuted'); const [sx, sy] = NORTH_SIGN_NUMBER[h]; doc.text(String(((lagnaSign + h - 1) % 12) + 1), X(sx), Y(sy) + 1, { align: 'center' }); }
    font('display', PDF_TYPE.small, 'amberText'); doc.text('Asc', X(NORTH_LAGNA_LABEL[0]), Y(NORTH_LAGNA_LABEL[1]) + 1.2, { align: 'center' });
    const byHouse = new Map<number, typeof placements>();
    const order = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
    for (const p of [...placements].sort((m, n) => order.indexOf(m.planet) - order.indexOf(n.planet))) { const h = ((p.sign - lagnaSign + 12) % 12) + 1; byHouse.set(h, [...(byHouse.get(h) ?? []), p]); }
    byHouse.forEach((ps, h) => {
      const offs = labelOffsets(ps.length, 'en'); const [cx, cy] = NORTH_PLANETS[h]; const rows = Math.ceil(ps.length / Math.max(1, offs.length > 2 ? (ps.length <= 4 ? 2 : 3) : ps.length));
      const shift = NORTH_GROWTH[h] === 'down' ? ((rows - 1) * 19) / 2 : NORTH_GROWTH[h] === 'up' ? -((rows - 1) * 19) / 2 : 0;
      ps.forEach((p, i) => {
        const tx = X(cx + offs[i][0] * 1.3), ty = Y(cy + offs[i][1] + shift) + 1.3;
        font('display', PDF_TYPE.small + 0.6, 'ink'); doc.text(GRAHA_ABBR[p.planet] ?? p.planet.slice(0, 2), tx, ty, { align: 'center' });
        if (p.retrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu') { font('bold', 5.2, 'inkMuted'); doc.text('R', tx + 2.6, ty - 1.6); }
      });
    });
    font('display', PDF_TYPE.cardTitle, 'inkMuted'); doc.text(caption, x0 + side / 2, y0 + side + 8.5, { align: 'center' });
  };

  // ── Page 1: the summary ───────────────────────────────────────────────────────
  fill('surface'); doc.rect(0, 0, PW, PH, 'F');
  fill('ink'); doc.rect(0, 0, PW, 64, 'F');
  font('display', 14, 'amber'); doc.text('Navagraha', M, 16);
  font('body', PDF_TYPE.caption, 'onNavy3'); doc.text(`Report date ${indianDate(a.reportDate)}`, PW - M, 16, { align: 'right' });
  font('display', PDF_TYPE.hero, 'onNavy'); doc.text('Career & Profession Report', M, 33);
  const who = [bd.name, [indianDate(bd.dateOfBirth), bd.timeOfBirth?.slice(0, 5), bd.placeOfBirth].filter(Boolean).join(' · ')].filter(Boolean) as string[];
  font('body', PDF_TYPE.lead, 'onNavy2'); let hy = 42;
  for (const line of wrap(who.join('  ·  '), CW).slice(0, 2)) { doc.text(line, M, hy); hy += lineMm(PDF_TYPE.lead); }
  font('body', PDF_TYPE.small, 'onNavy3');
  doc.text([bd.ascendant && `${bd.ascendant} Lagna`, bd.moonSign && `Moon in ${bd.moonSign}`, a.lords?.d10LagnaSign && `D10 Lagna ${a.lords.d10LagnaSign}`, a.lords?.tenth && `10th lord ${a.lords.tenth}`].filter(Boolean).join('   ·   '), M, Math.max(hy + 1.5, 56));
  y = 72;
  if (opts.banner) {
    box(M, y, CW, 9, 'highlight', 'negative', PDF_RADIUS.chip);
    font('bold', PDF_TYPE.small, 'negative'); doc.text(opts.banner, PW / 2, y + 5.8, { align: 'center' }); y += 13;
  }

  /** The recurring planet's own evidence, from the synthesis sentence "X recurs as a …: a, b and c all point…". */
  const recurrence = (t: string) => t.match(/recurs as a \w+: (.+?) (?:both|all) point/)?.[1];
  const current = a.periods.filter((p) => p.current), next = a.periods.find((p) => !p.current);
  const leading = a.fields.filter((f) => f.verdict === a.fields[0].verdict);
  const cards: Array<{ label: string; value: string; detail: string; tone: 'support' | 'strain' | 'neutral' }> = [
    { label: 'Overall career reading', value: a.verdict.career === 'Insufficient evidence' ? 'Too little evidence' : a.verdict.career, detail: `${a.verdict.confidence} confidence · the same reading as your Kundli's Career verdict`, tone: VERDICT_TONE(a.verdict.career) },
    { label: leading.length > 1 ? 'Leading fields' : 'Leading field', value: `${leading.slice(0, 2).map((f) => f.label.split(' ')[0]).join(' · ')}${leading.length > 2 ? ` +${leading.length - 2}` : ''}`, detail: `${leading.length > 1 ? `${leading.map((f) => f.label.split(' ')[0]).join(', ')} share the best reading` : 'The best reading'} (${a.fields[0].verdict.toLowerCase()}) of the six assessed`, tone: VERDICT_TONE(a.fields[0].verdict) },
    { label: 'Employment or independent work', value: { employment: 'Leans to employment', independent: 'Leans to independent work', mixed: 'Supports both', unresolved: 'Not settled' }[a.workStyle as 'employment'] ?? a.workStyle, detail: a.workStyle === 'unresolved' ? 'Neither the 6th nor the 7th house is clearly supportive' : 'From the 6th and 7th houses', tone: 'neutral' },
    { label: 'Main strength', value: (a.theses.strength.match(/^(?:The )?(\w+) recurs/)?.[1] ?? a.strengths[0]?.label ?? 'None recurs'), detail: recurrence(a.theses.strength) ?? 'No single planet recurs as a strength', tone: 'support' },
    { label: 'Main challenge', value: (a.theses.challenge.match(/^(?:The )?(\w+) recurs/)?.[1] ?? a.challenges[0]?.label ?? 'None recurs'), detail: recurrence(a.theses.challenge) ?? 'No single planet recurs as a challenge', tone: 'strain' },
    { label: 'Current period', value: current.map((p) => p.lord).join(' – '), detail: `${current.map((p) => `${p.level} to ${indianDate(p.end)}`).join('; ')}${next ? `; next ${next.lord} from ${indianDate(next.start)}` : ''}`, tone: 'neutral' },
  ];
  const cw2 = (CW - 5) / 2;
  for (let i = 0; i < cards.length; i += 2) {
    const pair = cards.slice(i, i + 2);
    const hs = pair.map((c) => { font('body', PDF_TYPE.small); return 14.5 + wrap(c.detail, cw2 - 8).slice(0, 3).length * lineMm(PDF_TYPE.small); });
    const h = Math.max(...hs);
    pair.forEach((c, j) => {
      const x = M + j * (cw2 + 5);
      box(x, y, cw2, h, 'surface', 'line');
      fill(c.tone === 'support' ? 'ink' : c.tone === 'strain' ? 'negative' : 'amber'); doc.rect(x, y + 3, 1.1, h - 6, 'F');
      font('bold', PDF_TYPE.micro, 'inkMuted'); doc.text(c.label.toUpperCase(), x + 5, y + 5.5);
      font('display', PDF_TYPE.value, 'ink'); doc.text(wrap(c.value, cw2 - 8)[0], x + 5, y + 11.6);
      font('body', PDF_TYPE.small, 'inkMuted'); textBlock(wrap(c.detail, cw2 - 8).slice(0, 3), x + 5, y + 13, PDF_TYPE.small);
    });
    y += h + 4;
  }
  // Limitations, stated once and plainly.
  const limits = `${a.d10.sensitivity} Dates are calculated periods, not promised events; the report describes tendencies, not guarantees.`;
  font('body', PDF_TYPE.small); const ll = wrap(limits, CW - 10);
  box(M, y, CW, ll.length * lineMm(PDF_TYPE.small) + 9, 'highlight', 'line');
  font('bold', PDF_TYPE.micro, 'amberText'); doc.text('LIMITS OF THIS READING', M + 5, y + 5);
  font('body', PDF_TYPE.small, 'ink'); textBlock(ll, M + 5, y + 6, PDF_TYPE.small);
  y += ll.length * lineMm(PDF_TYPE.small) + 15;

  sectionTitle(1, 'Executive Career Summary', 20); body('Executive Career Summary');

  // ── 02 Professional Identity ──────────────────────────────────────────────────
  sectionTitle(2, 'Professional Identity'); body('Professional Identity');
  {
    font('body', PDF_TYPE.small); const lines = wrap(a.theses.arrangement, CW - 10); const h = lines.length * lineMm(PDF_TYPE.small) + 10;
    ensure(h + 2); box(M, y, CW, h, 'ground', 'line');
    font('bold', PDF_TYPE.micro, 'amberText'); doc.text('EMPLOYMENT OR INDEPENDENT WORK: THE EVIDENCE', M + 5, y + 5);
    font('body', PDF_TYPE.small, 'ink'); textBlock(lines, M + 5, y + 6.5, PDF_TYPE.small); y += h + 5;
  }

  // ── 03 Strengths and Challenges ───────────────────────────────────────────────
  sectionTitle(3, 'Strengths and Challenges', 60);
  {
    const col = (CW - 5) / 2;
    const list = (items: Analysis['strengths'], x: number, title: string, recur: string, tone: 'support' | 'strain') => {
      let yy = y + 6.5;
      font('display', PDF_TYPE.cardTitle, 'ink'); doc.text(title, x + 5, yy + 2); yy += 6;
      font('body', PDF_TYPE.small, 'inkMuted'); yy += textBlock(wrap(recur, col - 10), x + 5, yy, PDF_TYPE.small) + 2;
      for (const s of items) {
        font('bold', PDF_TYPE.small, 'ink'); const lab = wrap(s.label, col - 30);
        textBlock(lab, x + 5, yy, PDF_TYPE.small); chip(s.strength, x + col - 21, yy + 0.4, tone);
        yy += lab.length * lineMm(PDF_TYPE.small);
        font('body', PDF_TYPE.micro, 'inkMuted'); yy += textBlock(wrap(s.text, col - 10), x + 5, yy, PDF_TYPE.micro) + 2.2;
      }
      return yy - y + 3;
    };
    // Measure on a scratch pass is not available in jsPDF; estimate generously and draw boxes behind.
    const est = (items: Analysis['strengths'], recur: string) => { font('body', PDF_TYPE.small); let h = 14 + wrap(recur, col - 10).length * lineMm(PDF_TYPE.small); for (const s of items) { h += wrap(s.label, col - 30).length * lineMm(PDF_TYPE.small); font('body', PDF_TYPE.micro); h += wrap(s.text, col - 10).length * lineMm(PDF_TYPE.micro) + 2.2; font('body', PDF_TYPE.small); } return h + 3; };
    const h = Math.max(est(a.strengths, a.theses.strength), est(a.challenges, a.theses.challenge));
    ensure(h + 4);
    box(M, y, col, h, 'surface', 'line'); box(M + col + 5, y, col, h, 'surface', 'line');
    fill('ink'); doc.rect(M, y, col, 1.4, 'F'); fill('negative'); doc.rect(M + col + 5, y, col, 1.4, 'F');
    list(a.strengths, M, 'Strengths', a.theses.strength, 'support'); list(a.challenges, M + col + 5, 'Challenges', a.theses.challenge, 'strain');
    y += h + 6;
  }
  body('Strengths and Challenges');

  // ── 04 D1 and D10 ─────────────────────────────────────────────────────────────
  sectionTitle(4, 'D1 and D10 Analysis', 110);
  {
    const d1 = content.chartData?.planetaryPositions ?? [], d10 = content.chartData?.dasamsa?.planetaryPositions ?? [];
    const lagna1 = SIGNS.indexOf(content.chartData?.houses?.[0]?.sign ?? ''), lagna10 = SIGNS.indexOf(content.chartData?.dasamsa?.houses?.[0]?.sign ?? '');
    const side = 70, gap = CW - 2 * side;
    chart(M + 4, y + 4, side, lagna1, d1.filter((p) => SIGNS.includes(p.sign ?? '')).map((p) => ({ planet: p.planet, sign: SIGNS.indexOf(p.sign!), retrograde: p.isRetrograde })), 'Rasi · D1 (birth chart)');
    chart(M + side + gap - 4, y + 4, side, lagna10, d10.filter((p) => SIGNS.includes(p.sign ?? '')).map((p) => ({ planet: p.planet, sign: SIGNS.indexOf(p.sign!) })), 'Dasamsa · D10 (profession)');
    y += side + 18;
    font('body', PDF_TYPE.micro, 'inkMuted'); doc.text('North Indian charts; house 1 is the shaded top diamond; numbers are signs (1 = Aries). R marks a retrograde planet.', PW / 2, y, { align: 'center' }); y += 6;
    const REL = { reinforces: ['Reinforces', 'support'], contradicts: ['Contradicts', 'strain'], qualifies: ['Qualifies', 'neutral'], unresolved: ['Unresolved', 'neutral'] } as const;
    const dig = (d: string | null) => (d ? d.replace("Friend's sign", 'friendly').replace("Enemy's sign", "enemy's").replace('Neutral sign', 'neutral').replace('Own sign', 'own sign').toLowerCase() : '');
    table(['Planet', 'Role', 'Birth chart (D1)', 'Dasamsa (D10)', 'D10 bearing'], [22, 48, 38, 38, 28], a.d1d10.map((r) => {
      const p = a.placements.find((x) => x.planet === r.planet);
      return [r.planet, r.roles.join(', '), p ? `${p.d1.sign}, ${p.d1.house}th; ${dig(p.d1.dignity)}` : '', p ? `${p.d10.sign}, ${p.d10.house}th; ${dig(p.d10.dignity)}` : '', { chip: REL[r.relation as keyof typeof REL][0], tone: REL[r.relation as keyof typeof REL][1] }];
    }).map((row) => row.map((c) => (typeof c === 'string' ? c.replace(/\b1th\b/g, '1st').replace(/\b2th\b/g, '2nd').replace(/\b3th\b/g, '3rd') : c))), { bold: [0] });
    font('body', PDF_TYPE.small); const lines = wrap(a.theses.d10, CW - 10); const h = lines.length * lineMm(PDF_TYPE.small) + 10;
    ensure(h); box(M, y, CW, h, 'ground', 'line');
    font('bold', PDF_TYPE.micro, 'amberText'); doc.text(`OVERALL: THE D10 ${({ reinforces: 'REINFORCES', contradicts: 'CUTS AGAINST', qualifies: 'QUALIFIES', unresolved: 'DOES NOT SETTLE' } as Record<string, string>)[a.d10.relation]} THE BIRTH-CHART READING`, M + 5, y + 5);
    font('body', PDF_TYPE.small, 'ink'); textBlock(lines, M + 5, y + 6.5, PDF_TYPE.small); y += h + 5;
  }
  body('D1 and D10 Analysis');

  // The engine lists evidence strongest first; the table names the first four.
  const few = (xs: string[]) => (xs.length ? `${xs.slice(0, 4).join('; ')}${xs.length > 4 ? `; +${xs.length - 4} more` : ''}` : 'nothing counted');
  // ── 05 Field comparison ───────────────────────────────────────────────────────
  sectionTitle(5, 'Professional Field Comparison', 70);
  font('body', PDF_TYPE.small, 'inkMuted');
  y += textBlock(wrap('Each field is judged on its own significators and houses by the same engine as your Kundli; fields are ranked by that reading. Readings are qualitative, never percentages.', CW), M, y, PDF_TYPE.small) + 3;
  table(['#', 'Field', 'Reading', 'For', 'Against'], [7, 36, 25, 54, 52], a.fields.map((f, i) => [String(i + 1), f.label, { chip: f.verdict === 'Insufficient evidence' ? 'Too little' : f.verdict, tone: VERDICT_TONE(f.verdict) }, few(f.supporting), few(f.conflicting)]), { bold: [1], highlight: (i) => a.fields[i].verdict === a.fields[0].verdict });
  subTitle('What separates the fields', 16);
  for (const c of a.comparisons) paragraph(c.text, { size: PDF_TYPE.small, gap: 2 });
  y += 2; body('Professional Field Comparison');

  // ── 06 Timing ────────────────────────────────────────────────────────────────
  sectionTitle(6, 'Career Timing', 95);
  {
    const t0 = Date.parse(a.timeline.from), t1 = Date.parse(a.timeline.to), X = (iso: string) => M + ((Math.min(Math.max(Date.parse(iso), t0), t1) - t0) / (t1 - t0)) * CW;
    const rowH = 9;
    const lane = (items: Array<{ lord: string; start: string; end: string }>, yy: number, label: string) => {
      font('bold', PDF_TYPE.micro, 'inkMuted'); doc.text(label, M, yy - 1.5);
      items.forEach((s, i) => {
        const x0 = X(s.start), x1 = X(s.end); const now = Date.parse(s.start) <= t0 && t0 < Date.parse(s.end);
        fill(now ? 'amber' : i % 2 ? 'surface' : 'highlight'); stroke('ink', 0.25); doc.rect(x0, yy, x1 - x0, rowH, 'FD');
        const w = x1 - x0; const name = w > 16 ? s.lord : w > 6 ? GRAHA_ABBR[s.lord] ?? s.lord.slice(0, 2) : '';
        font(now ? 'bold' : 'body', PDF_TYPE.small, 'ink'); if (name) doc.text(name, x0 + w / 2, yy + 5.8, { align: 'center' });
      });
    };
    ensure(50);
    font('bold', PDF_TYPE.micro, 'ink'); doc.text(`Now · ${indianDate(a.timeline.from)}`, M, y + 2.5); doc.text(`${indianDate(a.timeline.to)}`, M + CW, y + 2.5, { align: 'right' });
    y += 9; lane(a.timeline.mahadashas, y, 'MAHADASHA'); y += rowH + 6; lane(a.timeline.antardashas, y, 'ANTARDASHA');
    stroke('ink', 0.7); doc.line(M, y - rowH - 8, M, y + rowH + 1.5);
    y += rowH + 1.5;
    for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) {
      const x = X(`${yr}-01-01`); if (x < M + 4 || x > M + CW - 4) continue; stroke('inkMuted', 0.2); doc.line(x, y, x, y + 1.6); font('body', PDF_TYPE.micro, 'inkMuted'); doc.text(String(yr), x, y + 4.6, { align: 'center' });
    }
    y += 9;
    // Period cards: the running Mahadasha and Antardasha and the next sub-period.
    const cw3 = (CW - 8) / 3;
    const heights = a.periods.map((p) => { font('body', PDF_TYPE.micro); return 21 + wrap(p.links, cw3 - 8).length * lineMm(PDF_TYPE.micro); });
    const h = Math.max(...heights); ensure(h + 3);
    a.periods.forEach((p, i) => {
      const x = M + i * (cw3 + 4);
      box(x, y, cw3, h, p.current ? 'surface' : 'ground', p.current ? 'frame' : 'line');
      font('bold', PDF_TYPE.micro, 'amberText'); doc.text(p.current ? `RUNNING ${p.level.toUpperCase()}` : `NEXT ${p.level.toUpperCase()}`, x + 4, y + 5);
      font('display', PDF_TYPE.cardTitle, 'ink'); doc.text(`${p.lord}${p.within && p.within !== p.lord ? ` in ${p.within}` : ''}`, x + 4, y + 10.5);
      font('body', PDF_TYPE.micro, 'inkMuted'); doc.text(`${indianDate(p.start)} – ${indianDate(p.end)}`, x + 4, y + 14.5);
      chip(`tone ${({ positive: 'supportive', negative: 'strained', neutral: 'neutral' } as Record<string, string>)[p.tone]}`, x + 4, y + 16, toneOfDirection(p.tone));
      font('body', PDF_TYPE.micro, 'ink'); textBlock(wrap(p.links, cw3 - 8), x + 4, y + 21, PDF_TYPE.micro);
    });
    y += h + 5;
    paragraph(a.theses.timing, { size: PDF_TYPE.small, colour: 'inkMuted' });
  }
  body('Career Timing');

  // ── 07 Strategy ──────────────────────────────────────────────────────────────
  sectionTitle(7, 'Career Strategy'); body('Career Strategy');

  // ── Appendix ─────────────────────────────────────────────────────────────────
  page();
  sectionTitle(8, 'Astrological Evidence Appendix', 40);
  subTitle('Planetary positions', 30);
  const d10Of = (planet: string) => content.chartData?.dasamsa?.planetaryPositions?.find((p) => p.planet === planet);
  table(['Planet', 'Sign', 'House', 'Degree', 'Motion', 'D10 sign', 'D10 house'], [24, 26, 16, 22, 22, 34, 30], (content.planetaryPositions ?? []).map((p) => [p.planet, p.sign ?? '', p.house != null ? String(p.house) : '', formatPlanetDegree(p.degree, "'"), p.retrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu' ? 'retrograde' : '', d10Of(p.planet)?.sign ?? '', d10Of(p.planet)?.house != null ? String(d10Of(p.planet)!.house) : '']), { bold: [0] });
  if (a.yogas.length) { subTitle('Yogas detected', 14); table(['Yoga', 'Planets', 'Configuration'], [46, 32, 96], a.yogas.map((g) => [g.name, g.planets.join(', '), g.configuration]), { bold: [0] }); }
  if (content.dashaTimeline?.length) {
    subTitle('Vimshottari Mahadashas', 30);
    table(['Mahadasha', 'From', 'To', 'Status'], [36, 40, 40, 58], content.dashaTimeline.map((d) => [d.planet, indianDate(d.startDate), indianDate(d.endDate), d.status === 'current' && d.currentAntardasha ? `running; ${d.currentAntardasha.planet} sub-period to ${indianDate(d.currentAntardasha.endDate)}` : d.status ?? '']), { highlight: (i) => content.dashaTimeline![i].status === 'current', bold: [0] });
  }
  subTitle('Method', 24);
  for (const note of [
    'Calculations: Swiss Ephemeris (Moshier), Lahiri ayanamsa, mean node, whole-sign houses. Vimshottari dates are the engine\'s; nothing in this PDF is recalculated.',
    'Readings: every conclusion comes from the same evidence engine as your Kundli, which weighs evidence as strong, moderate or weak and gives qualitative readings, never percentages.',
    'Fields: each is judged on its own significators and houses, using house rules that apply alike to every house; ruling the 10th is a link to career, not support in itself.',
    'D10: the Dasamsa needs an exact birth time; how far its rising sign holds is stated on page 1.',
    'Written paragraphs cite these calculated facts and are checked against the chart before the report is delivered.',
  ]) paragraph(`•  ${note}`, { size: PDF_TYPE.small, gap: 1.6 });
  const glossary = sections.get('Glossary');
  if (glossary) {
    subTitle('Glossary', 16);
    for (const line of glossary.split('\n')) { const [term, ...rest] = line.split(': '); font('bold', PDF_TYPE.small); const w = doc.getTextWidth(`${term}  `); ensure(lineMm(PDF_TYPE.small) * 2); doc.text(term, M, y + pt2mm(PDF_TYPE.small)); font('body', PDF_TYPE.small, 'ink'); const ls = wrap(rest.join(': '), CW - w); y += textBlock(ls, M + w, y, PDF_TYPE.small) + 1; }
  }

  // ── Running header and footer ────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      font('display', PDF_TYPE.small, 'amberText'); doc.text('Navagraha', M, 12);
      font('body', PDF_TYPE.micro, 'inkMuted'); const right = ['Career & Profession Report', bd.name].filter(Boolean).join(' · '); const fit = wrap(right, CW / 2 - 6); doc.text(fit.length > 1 ? `${fit[0].replace(/\s*\S*$/, '')}…` : right, PW - M, 12, { align: 'right' });
      stroke('line', 0.3); doc.line(M, 14.5, PW - M, 14.5);
    }
    stroke('hairline', 0.3); doc.line(M, PH - 13, PW - M, PH - 13);
    font('body', PDF_TYPE.micro, 'inkMuted'); doc.text(`${i} / ${pages}`, PW - M, PH - 8.5, { align: 'right' });
    doc.text('Swiss Ephemeris · Lahiri · tendencies, not guarantees', M, PH - 8.5);
    if (opts.banner) { font('bold', PDF_TYPE.micro, 'negative'); doc.text('MOCKED-CONTENT LAYOUT SAMPLE', PW / 2 + 8, PH - 8.5, { align: 'center' }); }
  }
  return doc;
}

/** Browser entry: loads jsPDF and the fonts lazily, renders and saves. */
export async function downloadCareerReportPdf(content: ReportContent) {
  const [{ jsPDF }, f] = await Promise.all([import('jspdf'), import('./pdf/fonts')]);
  const doc = renderCareerPdf(new jsPDF({ unit: 'mm', format: 'a4' }), content, { fonts: { regular: f.DM_SANS_REGULAR, semibold: f.DM_SANS_SEMIBOLD, display: f.ECZAR_SEMIBOLD } });
  doc.save('career-profession-report.pdf');
}
