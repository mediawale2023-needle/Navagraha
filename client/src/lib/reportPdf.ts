// Client-side PDF export for paid astrology reports. jsPDF is imported lazily
// so it stays out of the main bundle and only loads when a user downloads.

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
  houses?: { number: number; sign?: string; planets: { name: string; symbol: string; house: number }[] }[];
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
const PLANET_ABBR: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju",
  Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke", Ascendant: "As",
};

// Fixed cell centres (in the chart's 0–400 coordinate space) keyed by house
// number — mirrors the on-screen NorthIndianChart layout so PDF matches UI.
const HOUSE_POS: Record<number, [number, number]> = {
  1: [120, 120], 2: [280, 120], 3: [345, 160], 4: [345, 250], 5: [280, 300], 6: [120, 300],
  7: [55, 250], 8: [55, 160], 9: [150, 55], 10: [250, 55], 11: [345, 345], 12: [55, 345],
};

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

  // ── Chart ────────────────────────────────────────────────────
  if (content.houses?.length) {
    heading("Birth Chart (North Indian)");
    ensure(96);
    drawChart(doc, content.houses, (PW - 90) / 2, y, 90);
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

function drawChart(
  doc: any,
  houses: NonNullable<ReportContent["houses"]>,
  x0: number,
  y0: number,
  side: number,
) {
  const mx = (px: number) => x0 + (px / 400) * side;
  const my = (py: number) => y0 + (py / 400) * side;

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.rect(x0, y0, side, side);
  const L = (a: number, b: number, c: number, d: number) => doc.line(mx(a), my(b), mx(c), my(d));
  L(200, 0, 200, 400);
  L(0, 200, 400, 200);
  L(200, 0, 0, 200);
  L(200, 0, 400, 200);
  L(200, 400, 0, 200);
  L(200, 400, 400, 200);

  for (const h of houses) {
    const pos = HOUSE_POS[h.number];
    if (!pos) continue;
    const labels = (h.planets || []).map((p) => PLANET_ABBR[p.name] || (p.name || "").slice(0, 2));
    if (!labels.length) continue;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...PURPLE);
    labels.forEach((lab, i) => {
      doc.text(lab, mx(pos[0]), my(pos[1]) + i * 3.4, { align: "center" });
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
