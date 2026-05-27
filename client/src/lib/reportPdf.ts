// Client-side PDF export for paid astrology reports. jsPDF is imported lazily
// so it stays out of the main bundle and only loads when a user downloads.
import { HOUSE_TEXT, PLANET_ABBR, PLANET_COLORS, SIGN_NUM } from "@/components/NorthIndianChartEnhanced";

interface ChartPlanetPos {
  planet: string;
  sign?: string;
  degree?: number;
  house?: number;
  isRetrograde?: boolean;
}

export interface ReportContent {
  title?: string;
  summary?: string;
  sections?: { heading: string; body: string }[];
  remedies?: string[];
  birthDetails?: {
    name?: string;
    dateOfBirth?: string;
    timeOfBirth?: string;
    placeOfBirth?: string;
    ascendant?: string;
    moonSign?: string;
    sunSign?: string;
  };
  planetaryPositions?: { planet: string; sign?: string; house?: number; degree?: number; retrograde?: boolean }[];
  chartData?: {
    houses?: { house: number; sign?: string }[];
    planetaryPositions?: ChartPlanetPos[];
    navamsa?: { houses?: { house: number; sign?: string }[]; planetaryPositions?: ChartPlanetPos[] };
    ashtakavarga?: { savByHouse?: number[] };
  };
  dashaTimeline?: {
    planet: string;
    period?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    currentAntardasha?: { planet: string; period?: string } | null;
  }[];
  generatedAt?: string;
}

const PURPLE: [number, number, number] = [91, 71, 168];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const M = 15;
const PW = 210;
const PH = 297;
const CW = PW - M * 2;

export async function downloadReportPdf(content: ReportContent) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = M;

  const ensure = (h: number) => {
    if (y + h > PH - M) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (t: string) => {
    ensure(12);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...PURPLE);
    doc.text(t, M, y);
    y += 5;
    doc.setDrawColor(...PURPLE);
    doc.setLineWidth(0.3);
    doc.line(M, y, M + CW, y);
    y += 4;
    doc.setTextColor(40);
  };
  const para = (t: string, size = 10) => {
    if (!t) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(40);
    const lh = size * 0.42 + 1.6;
    for (const line of doc.splitTextToSize(t, CW) as string[]) {
      ensure(lh);
      doc.text(line, M, y);
      y += lh;
    }
  };

  // ── Title banner ─────────────────────────────────────────────
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, PW, 30, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(content.title || "Astrology Report", M, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const when = content.generatedAt ? new Date(content.generatedAt) : new Date();
  doc.text(`Prepared on ${when.toLocaleDateString()}`, M, 24);
  y = 38;
  doc.setTextColor(40);

  // ── Birth details ────────────────────────────────────────────
  const bd = content.birthDetails;
  if (bd) {
    heading("Birth Details");
    para(`Name: ${bd.name || "—"}        Date of Birth: ${bd.dateOfBirth || "—"}        Time: ${bd.timeOfBirth || "—"}`);
    para(`Place: ${bd.placeOfBirth || "—"}`);
    para(`Ascendant (Lagna): ${bd.ascendant || "—"}        Moon Sign: ${bd.moonSign || "—"}        Sun Sign: ${bd.sunSign || "—"}`);
  }

  // ── Contents (for long reports) ──────────────────────────────
  if ((content.sections?.length || 0) > 12) {
    heading("Contents");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60);
    content.sections!.forEach((s, i) => {
      for (const ln of doc.splitTextToSize(`${i + 1}.  ${s.heading}`, CW) as string[]) {
        ensure(5.2);
        doc.text(ln, M, y);
        y += 5.2;
      }
    });
  }

  // ── Charts (D1 + D9) ─────────────────────────────────────────
  if (content.chartData?.planetaryPositions?.length) {
    heading("Birth Chart — Rasi (D1)");
    ensure(96);
    drawChart(doc, content.chartData, (PW - 90) / 2, y, 90);
    y += 96;
  }
  if (content.chartData?.navamsa?.planetaryPositions?.length) {
    heading("Navamsa Chart (D9)");
    ensure(96);
    drawChart(doc, content.chartData.navamsa, (PW - 90) / 2, y, 90);
    y += 96;
  }

  // ── Planetary positions ──────────────────────────────────────
  if (content.planetaryPositions?.length) {
    heading("Planetary Positions");
    const rows = content.planetaryPositions.map((p) => [
      p.planet,
      p.sign || "—",
      p.house != null ? String(p.house) : "—",
      p.degree != null ? `${p.degree}°` : "—",
      p.retrograde ? "R" : "",
    ]);
    y = drawTable(doc, M, y, ["Planet", "Sign", "House", "Degree", "Retro"], [40, 50, 30, 35, 25], rows);
  }

  // ── Dasha timeline ───────────────────────────────────────────
  if (content.dashaTimeline?.length) {
    heading("Vimshottari Dasha Timeline");
    const rows = content.dashaTimeline.map((d) => [
      d.planet,
      d.period || "—",
      (d.status || "").replace(/^\w/, (c) => c.toUpperCase()),
      d.currentAntardasha ? `${d.currentAntardasha.planet} (${d.currentAntardasha.period || "—"})` : "—",
    ]);
    y = drawTable(
      doc,
      M,
      y,
      ["Mahadasha", "Period", "Status", "Current Antardasha"],
      [35, 50, 30, 65],
      rows,
      (i) => content.dashaTimeline![i].status === "current",
    );
  }

  // ── Ashtakavarga (SAV) ───────────────────────────────────────
  if (content.chartData?.ashtakavarga?.savByHouse?.length === 12) {
    heading("Ashtakavarga — House Strength (SAV)");
    const rows = content.chartData.ashtakavarga.savByHouse.map((b, i) => [
      `House ${i + 1}`,
      String(b),
      b >= 30 ? "Strong" : b < 25 ? "Weak" : "Moderate",
    ]);
    y = drawTable(doc, M, y, ["House", "SAV Bindus", "Strength"], [55, 45, 55], rows, (i) =>
      (content.chartData!.ashtakavarga!.savByHouse![i]) >= 30,
    );
  }

  // ── Narrative sections ───────────────────────────────────────
  if (content.summary) {
    heading("Overview");
    para(content.summary);
  }
  for (const s of content.sections || []) {
    heading(s.heading);
    para(s.body);
  }

  // ── Remedies ─────────────────────────────────────────────────
  if (content.remedies?.length) {
    heading("Recommended Remedies");
    content.remedies.forEach((r, i) => para(`${i + 1}.  ${r}`));
  }

  // ── Footer page numbers ──────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Navagraha · Page ${i} of ${pages}`, PW / 2, PH - 8, { align: "center" });
  }

  const safe = (content.title || "astrology-report").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  doc.save(`${safe || "astrology-report"}.pdf`);
}

// Reproduces the on-screen NorthIndianChartEnhanced layout exactly: a square
// with the inner diamond (side midpoints) plus both corner diagonals, rashi
// numbers per house, and planet labels grouped by house.
function drawChart(
  doc: any,
  chartData: NonNullable<ReportContent["chartData"]>,
  x0: number,
  y0: number,
  side: number,
) {
  const S = 400;
  const mid = S / 2;
  const sx = (px: number) => x0 + (px / S) * side;
  const sy = (py: number) => y0 + (py / S) * side;
  const L = (a: number, b: number, c: number, d: number) => doc.line(sx(a), sy(b), sx(c), sy(d));

  // Outer border + diamond + diagonals (matches the SVG geometry).
  doc.setDrawColor(26, 26, 46);
  doc.setLineWidth(0.6);
  doc.rect(sx(4), sy(4), (side * (S - 8)) / S, (side * (S - 8)) / S);
  doc.setLineWidth(0.3);
  L(mid, 4, 4, mid);
  L(4, mid, mid, S - 4);
  L(mid, S - 4, S - 4, mid);
  L(S - 4, mid, mid, 4);
  L(4, 4, S - 4, S - 4);
  L(S - 4, 4, 4, S - 4);

  // House sign numbers (rashi).
  const houseSign: Record<number, string> = {};
  for (const h of chartData.houses || []) houseSign[h.house] = h.sign || "";
  for (const pos of chartData.planetaryPositions || []) {
    if (pos.planet === "Ascendant" && pos.house === 1 && pos.sign) houseSign[1] = pos.sign;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...hexToRgb("#8B1A1A"));
  for (let h = 1; h <= 12; h++) {
    const t = HOUSE_TEXT[h];
    const num = houseSign[h] ? SIGN_NUM[houseSign[h]] : h;
    if (t && num) doc.text(String(num), sx(t.rx), sy(t.ry), { align: "center" });
  }

  // Planets grouped by house.
  const byHouse: Record<number, ChartPlanetPos[]> = {};
  for (const p of chartData.planetaryPositions || []) {
    if (p.house && p.house >= 1 && p.house <= 12) (byHouse[p.house] ||= []).push(p);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  for (let h = 1; h <= 12; h++) {
    const t = HOUSE_TEXT[h];
    const planets = byHouse[h];
    if (!t || !planets?.length) continue;
    const lineH = 3.0;
    const startY = sy(t.py) - ((planets.length - 1) * lineH) / 2;
    planets.forEach((p, i) => {
      const abbr = PLANET_ABBR[p.planet] || (p.planet === "Ascendant" ? "Asc" : p.planet.slice(0, 2));
      const label = `${abbr}-${p.degree ?? "—"}°${p.isRetrograde ? "R" : ""}`;
      doc.setTextColor(...hexToRgb(PLANET_COLORS[abbr] || "#1A1A2E"));
      doc.text(label, sx(t.px), startY + i * lineH, { align: "center" });
    });
  }

  doc.setTextColor(40);
  doc.setFont("helvetica", "normal");
}

function drawTable(
  doc: any,
  x: number,
  yStart: number,
  headers: string[],
  widths: number[],
  rows: string[][],
  highlight?: (rowIndex: number) => boolean,
): number {
  const rowH = 6.5;
  const totalW = widths.reduce((a, b) => a + b, 0);
  let y = yStart;

  const drawHeaderRow = () => {
    doc.setFillColor(...PURPLE);
    doc.rect(x, y, totalW, rowH, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let cx = x;
    headers.forEach((h, i) => {
      doc.text(h, cx + 1.5, y + rowH - 2);
      cx += widths[i];
    });
    y += rowH;
  };

  drawHeaderRow();
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);

  rows.forEach((row, ri) => {
    if (y + rowH > PH - M) {
      doc.addPage();
      y = M;
      drawHeaderRow();
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40);
    }
    if (highlight?.(ri)) {
      doc.setFillColor(238, 226, 255);
      doc.rect(x, y, totalW, rowH, "F");
    } else if (ri % 2) {
      doc.setFillColor(247, 247, 250);
      doc.rect(x, y, totalW, rowH, "F");
    }
    let cx = x;
    doc.setFontSize(9);
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ""), cx + 1.5, y + rowH - 2);
      cx += widths[i];
    });
    y += rowH;
  });

  return y + 2;
}
