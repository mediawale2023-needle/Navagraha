/**
 * AI Astrologer Service
 *
 * Uses OpenAI (ChatGPT) to power three focused utility functions:
 * 1. Pre-consultation brief — talking points for an upcoming session
 * 2. Post-consultation follow-up — personalised action plan after a session
 * 3. Astrologer matching — rank astrologers by chart compatibility
 *
 * Also retains Kundli interpretation for the Kundli view page.
 *
 * Falls back gracefully when OPENAI_API_KEY is not set.
 */

import type OpenAI from "openai";
import { createOpenAI } from "./ai/metering";
import type { Kundli } from "@shared/schema";
import { transitsForChart, transitSummary } from "./astroEngine/index.js";
import { isCurrentCanonicalChart } from "@shared/v3/canonical";
import { buildInsights } from "./astroEngine/evidence/insights.js";
import {
  ReportGenerationError, checkSections, correctionNote, textProblems, MIN_SUMMARY_CHARS, type ReportGuard, type Section,
} from "./reportQuality.js";
import { localiseFields } from "./agents/localise.js";

// Shared prediction discipline + ethics for all paid-report generation.
const REPORT_DISCIPLINE = `Discipline: a yoga/placement is only a promise — tie predictions to the activating dasha + transit and at least two confirmations (Navamsa/Dasamsa, Ashtakavarga, house lord, karaka); weigh planetary strength (a weak/debilitated/combust planet under-delivers; note Neecha-bhanga and yoga cancellation). Give realistic timing windows. Grounding: use only the chart facts and deterministic evidence supplied; never invent a placement, yoga, dosha, strength or date; keep the engine's verdicts; never cite chapter/verse numbers or quote scriptures; if the birth time is approximate, say so and do not build on the Lagna or houses. Ethics: Jyotish is a traditional interpretive system, not certainty — describe tendencies and timing; never predict death, lifespan, serious illness, guaranteed pregnancy, guaranteed marriage/divorce or guaranteed financial outcomes; never frighten; pair difficulty with realistic guidance (remedies are optional, never a condition); respect free will; recommend only justified remedies, never push gemstones.`;

// Lazy-init so the server starts without the key (degraded mode)
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY must be set for AI features");
    }
    _client = createOpenAI(process.env.OPENAI_API_KEY);
  }
  return _client;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function chartSummary(kundli: Partial<Kundli>): string {
  const { birthDetails, planetaryPositions, dashaTimeline } = deriveStructured(kundli);

  const posLines = planetaryPositions
    .map((p) => `- ${p.planet}: ${p.sign ?? "—"} (${p.house != null ? `House ${p.house}, ` : ""}${p.degree ?? "—"}°${p.retrograde ? ", retrograde" : ""})`)
    .join("\n");

  const currentMd = dashaTimeline.find((d) => d.status === "current");
  const upcoming = dashaTimeline.filter((d) => d.status === "upcoming").slice(0, 3);

  // Running Pratyantardasha (finer timing) + cross-confirming Yogini dasha.
  const rawDashas: any[] = Array.isArray((kundli as any).dashas) ? (kundli as any).dashas : [];
  // Running periods from the dates as of today (the stored status froze when the chart was saved).
  const today = new Date().toISOString().slice(0, 10);
  const running = (x: any) => x?.startDate && x?.endDate ? x.startDate <= today && today < x.endDate : x?.status === "current";
  const approx = isApproximate(kundli);
  const curMdRaw = approx ? undefined : rawDashas.find(running);
  const curAdRaw = curMdRaw?.antardashas?.find(running);
  const curPdRaw = curAdRaw?.pratyantardashas?.find(running);
  const pratyantarLine = curPdRaw ? `Current Pratyantardasha: ${curPdRaw.planet} (${curPdRaw.period})` : "";
  const yogini: any[] = (kundli as any).chartData?.yoginiDasha || [];
  const curYogini = approx ? undefined : yogini.find(running);
  const yoginiLine = curYogini ? `Yogini Dasha (cross-check): ${curYogini.yogini} / ${curYogini.lord} (${curYogini.period})` : "";

  const dashaLines = approx ? "Not stated: the birth time is approximate, so the dasha dates could shift." : [
    currentMd
      ? `Current Mahadasha: ${currentMd.planet} (${currentMd.period})${currentMd.currentAntardasha ? `, Antardasha ${currentMd.currentAntardasha.planet} (${currentMd.currentAntardasha.period})` : ""}`
      : "Current Mahadasha: not available",
    pratyantarLine,
    yoginiLine,
    ...upcoming.map((d) => `Upcoming Mahadasha: ${d.planet} (${d.period})`),
  ].filter(Boolean).join("\n");

  const doshas = ((kundli as any).doshas || {}) as Record<string, unknown>;
  const doshaList = Object.entries(doshas).filter(([, v]) => v).map(([k]) => k).join(", ") || "None detected";

  const navPositions: any[] = approx ? [] : (kundli as any).chartData?.navamsa?.planetaryPositions || [];
  const navLines = navPositions
    .filter((p) => p.planet !== "Ascendant")
    .map((p) => `- ${p.planet}: ${p.sign} (D9 House ${p.house})`)
    .join("\n");

  const dasamsaPos: any[] = approx ? [] : (kundli as any).chartData?.dasamsa?.planetaryPositions || [];
  const dasamsaLines = dasamsaPos
    .filter((p) => p.planet !== "Ascendant")
    .map((p) => `- ${p.planet}: ${p.sign} (D10 House ${p.house})`)
    .join("\n");

  const savByHouse: number[] = (kundli as any).chartData?.ashtakavarga?.savByHouse || [];
  const savLine = !approx && savByHouse.length === 12
    ? savByHouse.map((b, i) => `H${i + 1}:${b}`).join("  ")
    : "";

  const dignities: any[] = (kundli as any).chartData?.dignities || [];
  const dignityLines = dignities
    .map((p) => `- ${p.planet}: ${p.dignity}${p.neechaBhanga ? " (Neecha Bhanga — cancellation)" : ""}${p.retrograde ? ", retrograde" : ""}${p.combust ? ", combust" : ""}${p.planetaryWar ? `, in planetary war with ${p.planetaryWar}` : ""} — ${p.avastha}`)
    .join("\n");

  const yogasArr: any[] = (kundli as any).chartData?.yogas || [];
  const yogaLines = yogasArr
    .map((y) => `- ${y.name}${y.cancelled ? " (cancelled/bhanga)" : ""}: ${y.description}`)
    .join("\n");

  // Functional remedies are ascendant-specific, so they need an exact birth time.
  const funcRemedies: any[] = approx ? [] : (kundli as any).chartData?.functionalRemedies || [];
  const remedyLines = funcRemedies
    .map((r) => `- ${r.action} ${r.focus}: ${r.gemstone ? `gemstone ${r.gemstone}; ` : ""}${r.donation ? `donate ${r.donation}; ` : ""}mantra "${r.mantra}" (${r.japaCount}x) on ${r.day}; worship ${r.deity}. ${r.reason}`)
    .join("\n");

  const bhava: any = approx ? {} : (kundli as any).chartData?.bhava || {};
  const lordLines = Array.isArray(bhava.houseLords)
    ? bhava.houseLords.map((h: any) => `- House ${h.house} (${h.sign}) lord ${h.lord} sits in house ${h.lordHouse} (${h.lordSign})`).join("\n")
    : "";
  const aspectLines = Array.isArray(bhava.aspects)
    ? bhava.aspects.map((a: any) => `- ${a.planet} aspects houses ${a.aspectsHouses.join(", ")}${a.aspectsPlanets.length ? ` (planets: ${a.aspectsPlanets.join(", ")})` : ""}`).join("\n")
    : "";
  const chalitShifts = Array.isArray(bhava.chalit)
    ? bhava.chalit.filter((c: any) => c.shifted).map((c: any) => `${c.planet}: Rasi H${c.rasiHouse} → Chalit H${c.chalitHouse}`).join("; ")
    : "";

  return `
Name: ${birthDetails.name || "Unknown"}
Date of Birth: ${birthDetails.dateOfBirth || "Unknown"}
Time of Birth: ${birthDetails.timeOfBirth || "Unknown"}
Place of Birth: ${birthDetails.placeOfBirth || "Unknown"}
Ascendant (Lagna): ${birthDetails.ascendant || (approx ? "Not stated — birth time approximate (do not mention the Lagna, houses or dasha dates)" : "Unknown")}
Moon Sign (Rashi): ${birthDetails.moonSign || "Unknown"}
Sun Sign: ${birthDetails.sunSign || "Unknown"}

Planetary Positions (D1 Rasi):
${posLines || "Not available"}

Navamsa Positions (D9 — marriage, dharma, true strength):
${navLines || "Not available"}

Dasamsa Positions (D10 — career & profession):
${dasamsaLines || "Not available"}

Yogas detected (note any cancellation/bhanga):
${yogaLines || "None detected"}

Planetary Dignity & State (what each planet can deliver):
${dignityLines || "Not available"}

House Lords (Bhavesh placements):
${lordLines || "Not available"}

Graha Drishti (aspects):
${aspectLines || "Not available"}

Bhava Chalit shifts (planets near a sign edge): ${chalitShifts || "none"}

Sarvashtakavarga (SAV) bindus by house (higher = stronger; >30 strong, <25 weak; total 337):
${savLine || "Not available"}

Dasha Timeline:
${dashaLines}

Doshas: ${doshaList}

Ascendant-specific Remedies (functional — prefer these over generic advice):
${remedyLines || "Not available"}
${canonicalContext(kundli)}
`.trim();
}

/** V3 additions: calculation provenance, birth-time accuracy, today's running period and the evidence graph. */
// A period the birth-time uncertainty could change is never stated as running.
function runningPeriodLine(
  rp: { mahadasha: string; antardasha?: string | null } | null | undefined,
  timing: { mahadashaReliable: boolean; antardashaReliable: boolean } | undefined,
): string {
  if (!rp) return "not available";
  if (timing && !timing.mahadashaReliable) return "UNCERTAIN because the birth time is approximate; do not name a current Mahadasha or Antardasha";
  const antar = rp.antardasha && (!timing || timing.antardashaReliable) ? ` / ${rp.antardasha} Antardasha` : "";
  const antarNote = rp.antardasha && timing && !timing.antardashaReliable ? " (the Antardasha is uncertain with an approximate birth time; do not name it)" : "";
  return `${rp.mahadasha} Mahadasha${antar}${antarNote}`;
}

function canonicalContext(kundli: Partial<Kundli>): string {
  const canonical = (kundli as any).chartData?.canonical;
  if (!isCurrentCanonicalChart(canonical)) return "";
  const insights = buildInsights(canonical);
  const rp = insights.currentPeriod;
  const domainLines = insights.domains
    .map((d) => `- ${d.label}: ${d.verdict} (confidence ${d.confidence}) — ${d.conclusion}`)
    .join("\n");
  return `
Calculation: ${insights.headline.calculation}; birth time ${canonical.birth.timeAccuracy.toUpperCase()} (${canonical.birth.timezone}, UTC${canonical.birth.utcOffset}).
${canonical.uncertainty.notes.length ? `Uncertainty: ${canonical.uncertainty.notes.join(" ")}` : ""}
Running period TODAY (authoritative; supersedes any status above): ${runningPeriodLine(rp, insights.timing)}

Deterministic evidence verdicts (authoritative; explain, do not change):
${domainLines}`;
}

// ─── Kundli Interpretation (used in KundliView page) ──────────────────────────

export interface KundliInterpretation {
  overview: string;
  personality: string;
  career: string;
  relationships: string;
  currentPeriods: string;
  doshaAnalysis: string;
}

const INTERPRETATION_FIELDS: Array<{ key: keyof KundliInterpretation; ask: string }> = [
  { key: "overview", ask: "2-3 sentence overall life theme" },
  { key: "personality", ask: "core personality from the Lagna (only if the birth time is exact) and the Moon sign" },
  { key: "career", ask: "career path and professional strengths" },
  { key: "relationships", ask: "relationships and partnership tendencies" },
  { key: "currentPeriods", ask: "the running Mahadasha/Antardasha exactly as given in the facts, and what they emphasise; if the facts say the period is uncertain, say so instead" },
  { key: "doshaAnalysis", ask: "the doshas the facts list as present or absent, and what that means" },
];

export class InterpretationUnavailableError extends Error {}

/**
 * A short chart reading for the Ask page. Each paragraph is checked against the canonical chart
 * (one regeneration with the problems listed); a paragraph that still fails is left out, and
 * without a passing overview there is no reading. Health is not predicted.
 */
export async function interpretKundli(kundli: Partial<Kundli>): Promise<Partial<KundliInterpretation>> {
  const client = getClient();
  const canonical = (kundli as any).chartData?.canonical;
  if (!isCurrentCanonicalChart(canonical)) throw new InterpretationUnavailableError("This chart needs to be recreated with its birth place before it can be interpreted.");
  const guard: ReportGuard = { chart: canonical, factsText: chartSummary(kundli), asOf: new Date() };

  const accepted: Partial<KundliInterpretation> = {};
  let pending = INTERPRETATION_FIELDS;
  let correction = "";
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const prompt = `You are a Vedic astrology expert explaining a chart that has already been calculated. Use only the chart facts below; never invent a placement, yoga, dosha, period or date, and never mention health or lifespan. ${REPORT_DISCIPLINE}

Return ONLY a JSON object whose values are single paragraphs (plain strings):
{${pending.map((f) => `"${f.key}": "${f.ask}"`).join(", ")}}

Birth chart:
${chartSummary(kundli)}${correction ? `\n\n${correction}` : ""}`;
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(response.choices[0]?.message?.content || "{}"); } catch { /* every field is retried */ }
    const rejected: Array<{ heading: string; problems: string[] }> = [];
    for (const f of pending) {
      const text = typeof parsed[f.key] === "string" ? String(parsed[f.key]).trim() : "";
      const problems = textProblems(text, guard, 40);
      if (problems.length) rejected.push({ heading: f.key, problems });
      else accepted[f.key] = text;
    }
    pending = INTERPRETATION_FIELDS.filter((f) => rejected.some((r) => r.heading === f.key));
    correction = correctionNote(rejected);
  }
  if (!accepted.overview) throw new InterpretationUnavailableError("A reading consistent with your chart could not be prepared just now. Please try again, or ask a specific question.");
  return accepted;
}

// ─── Paid Reports ─────────────────────────────────────────────────────────────

export interface ReportPlanetPosition {
  planet: string;
  sign?: string;
  house?: number;
  degree?: number;
  retrograde?: boolean;
}
export interface ReportDashaPeriod {
  planet: string;
  period?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  currentAntardasha?: { planet: string; period?: string; startDate?: string; endDate?: string } | null;
}
export interface ReportBirthDetails {
  name?: string;
  dateOfBirth?: string;
  timeOfBirth?: string;
  placeOfBirth?: string;
  ascendant?: string;
  moonSign?: string;
  sunSign?: string;
  timeAccuracy?: "exact" | "approximate";
}

export interface GeneratedReport {
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  remedies: string[];
  birthDetails?: ReportBirthDetails;
  planetaryPositions?: ReportPlanetPosition[];
  chartData?: { houses?: any[]; planetaryPositions?: any[] };
  dashaTimeline?: ReportDashaPeriod[];
  generatedAt: string;
}

interface StructuredChart {
  birthDetails: ReportBirthDetails;
  planetaryPositions: ReportPlanetPosition[];
  chartData: { houses?: any[]; planetaryPositions?: any[] };
  dashaTimeline: ReportDashaPeriod[];
  /** Set when the birth time is approximate: what was withheld and why. */
  disclosure?: string;
}

const APPROXIMATE_DISCLOSURE =
  "The birth time is approximate, so the Lagna (Ascendant), house positions, the Lagna-based charts and dasha dates are not shown: they could all change with the exact time. Planet signs and the readings below that do not depend on the birth time still apply.";
const isApproximate = (kundli: Partial<Kundli>) => (kundli as any).chartData?.canonical?.birth?.timeAccuracy === "approximate";

// Turn a stored Kundli (chartData/dashas JSONB) into the structured shapes the
// report renderer and PDF need: birth details, a planetary-position table, the
// raw chartData (for the North Indian chart) and the Vimshottari dasha timeline.
function deriveStructured(kundli: Partial<Kundli>): StructuredChart {
  const cd = ((kundli as any).chartData || {}) as { houses?: any[]; planetaryPositions?: any[] };
  const rawPositions: any[] = Array.isArray(cd.planetaryPositions) ? cd.planetaryPositions : [];
  const rawDashas: any[] = Array.isArray((kundli as any).dashas) ? (kundli as any).dashas : [];

  const planetaryPositions: ReportPlanetPosition[] = rawPositions.map((p) => ({
    planet: p.planet,
    sign: p.sign,
    house: p.house,
    degree: typeof p.degree === "number" ? p.degree : Number(p.degree) || undefined,
    retrograde: !!p.isRetrograde,
  }));

  // Status is derived from the dates as of today; the stored status froze when the chart was created.
  const today = new Date().toISOString().slice(0, 10);
  const statusOf = (x: any): "past" | "current" | "upcoming" =>
    x?.startDate && x?.endDate ? (x.startDate <= today && today < x.endDate ? "current" : today >= x.endDate ? "past" : "upcoming") : x?.status;
  const dashaTimeline: ReportDashaPeriod[] = rawDashas.map((d) => {
    const current = Array.isArray(d.antardashas) ? d.antardashas.find((a: any) => statusOf(a) === "current") : null;
    return {
      planet: d.planet,
      period: d.period,
      status: statusOf(d),
      startDate: d.startDate,
      endDate: d.endDate,
      currentAntardasha: current
        ? { planet: current.planet, period: current.period, startDate: current.startDate, endDate: current.endDate }
        : null,
    };
  });

  const birthDetails: ReportBirthDetails = {
    name: kundli.name || undefined,
    dateOfBirth: kundli.dateOfBirth ? new Date(kundli.dateOfBirth as any).toDateString() : undefined,
    timeOfBirth: kundli.timeOfBirth || undefined,
    placeOfBirth: kundli.placeOfBirth || undefined,
    ascendant: kundli.ascendant || undefined,
    moonSign: kundli.moonSign || undefined,
    sunSign: kundli.zodiacSign || undefined,
  };

  if (isApproximate(kundli)) {
    return {
      birthDetails: { ...birthDetails, ascendant: undefined, timeAccuracy: "approximate" },
      planetaryPositions: planetaryPositions.filter((p) => p.planet !== "Ascendant").map((p) => ({ ...p, house: undefined })),
      chartData: {},
      dashaTimeline: [],
      disclosure: APPROXIMATE_DISCLOSURE,
    };
  }
  return { birthDetails, planetaryPositions, chartData: cd, dashaTimeline };
}

function extractChartRemedies(kundli: Partial<Kundli>): string[] {
  const r = (kundli as any).remedies;
  if (!Array.isArray(r)) return [];
  return r
    .map((x: any) =>
      x && typeof x === "object"
        ? `${x.title || ""}${x.title && x.description ? ": " : ""}${x.description || ""}`.trim()
        : String(x),
    )
    .filter(Boolean);
}

function dedupeRemedies(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.trim().toLowerCase();
    if (item.trim() && !seen.has(key)) {
      seen.add(key);
      out.push(item.trim());
    }
  }
  return out.slice(0, 10);
}

const REPORT_FOCUS: Record<string, { title: string; focus: string; sections: string[] }> = {
  career:     { title: "Career & Profession Report", focus: "career path, ideal professions, job vs business, and timing of professional growth", sections: ["Career Overview", "Strengths & Ideal Fields", "Job vs Business", "Growth Timing & Dashas", "Challenges to Watch"] },
  marriage:   { title: "Marriage & Love Report", focus: "marriage timing, partner characteristics, married life, and relationship harmony", sections: ["Love & Marriage Overview", "Partner Traits", "Marriage Timing", "Married Life", "Harmony & Compatibility"] },
  finance:    { title: "Wealth & Finance Report", focus: "wealth houses, income sources, investments, savings and financial timing", sections: ["Financial Overview", "Income Sources", "Wealth Accumulation", "Favourable Investment Windows", "Money Management"] },
  year_ahead: { title: "Year Ahead Report", focus: "month-by-month predictions for the coming 12 months across career, money and relationships", sections: ["Year Overview", "Career & Work", "Money & Finance", "Relationships", "Best & Cautious Months"] },
  life:       { title: "Life Reading Report", focus: "overall life themes, personality, and major life areas", sections: ["Life Overview", "Personality", "Career", "Relationships"] },
};

type ReportMeta = { title: string; focus: string; sections: string[] };
type ReportNarrative = Pick<GeneratedReport, "title" | "summary" | "sections" | "remedies">;

// Sections common to every report, wrapping the category-specific ones with a
// chart overview up front and a dasha-timing section at the end.
function sectionPlan(meta: ReportMeta): string[] {
  return ["Birth Chart Overview", "Key Planetary Influences", ...meta.sections, "Dasha Periods & Timing"];
}

async function aiNarrative(meta: ReportMeta, kundli: Partial<Kundli>, correction = ""): Promise<ReportNarrative> {
  const client = getClient();
  const plan = sectionPlan(meta);
  const prompt = `You are an expert Vedic astrologer preparing a premium, in-depth paid report titled "${meta.title}". This is a paid product (₹299–₹499), so it must read like a thorough professional consultation — detailed, specific and personalised, NOT a short summary. Focus on ${meta.focus}.

Use the EXACT planetary positions, houses and Vimshottari dasha timeline below. Reference specific planets, signs, houses and dasha periods by name throughout your analysis. Avoid generic statements that could apply to anyone.

${REPORT_DISCIPLINE}

Return ONLY valid JSON with this exact shape:
{
  "title": "${meta.title}",
  "summary": "a rich, personalised overview of 5-7 sentences",
  "sections": [${plan.map((s) => `{"heading": "${s}", "body": "3-5 detailed, specific paragraphs that reference the actual chart"}`).join(", ")}],
  "remedies": ["6-8 specific, practical Vedic remedies — include a gemstone, a mantra with its repetition count, a charity/daan, a fasting day, and a deity to worship where relevant"]
}

Birth chart:
${chartSummary(kundli)}${correction ? `\n\n${correction}` : ""}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 4000,
  });
  const text = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(text);
  return {
    title: parsed.title || meta.title,
    summary: parsed.summary || "",
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    remedies: Array.isArray(parsed.remedies) ? parsed.remedies : [],
  };
}

/** The guard context for a stored chart; reports are only generated for verified V3 charts. */
function reportGuard(kundli: Partial<Kundli>, transits?: string, extraFacts = ""): ReportGuard {
  const chart = (kundli as any).chartData?.canonical;
  if (!isCurrentCanonicalChart(chart)) throw new ReportGenerationError("chart is not a verified V3 calculation");
  return { chart, factsText: `${chartSummary(kundli)}\n${extraFacts}`, transits, asOf: new Date() };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function reportWindow(asOf: Date): string {
  const end = new Date(Date.UTC(asOf.getUTCFullYear() + 1, asOf.getUTCMonth(), 1));
  return `Report window: ${MONTHS[asOf.getUTCMonth()]} ${asOf.getUTCFullYear()} to ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()} (today is ${asOf.toISOString().slice(0, 10)}).`;
}

function requireAi() {
  if (!process.env.OPENAI_API_KEY) throw new ReportGenerationError("AI report generation is not configured");
}

/** AI remedies are kept only when they make no claim the chart contradicts. */
function checkedRemedies(remedies: string[], guard: ReportGuard): string[] {
  const clean = remedies.filter((r) => typeof r === "string" && r.trim());
  return textProblems(clean.join(". "), guard, 0).length ? [] : clean;
}

/**
 * A paid report: every planned section must be a substantive reading consistent with the
 * chart. One regeneration with the problems listed; then it fails (and the order is refunded).
 */
export async function generateReport(
  category: string,
  kundli: Partial<Kundli>,
): Promise<GeneratedReport> {
  requireAi();
  const meta = REPORT_FOCUS[category];
  if (!meta) throw new ReportGenerationError(`no report is offered for category "${category}"`);
  const asOf = new Date();
  // A year-ahead reading names the months it covers; those years are facts, not inventions.
  const window = category === "year_ahead" ? reportWindow(asOf) : "";
  const guard = reportGuard(kundli, undefined, window);
  const plan = sectionPlan(meta);
  const structured = deriveStructured(kundli);

  let correction = "";
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const narrative = await aiNarrative(meta, kundli, [window, correction].filter(Boolean).join("\n\n"));
    const { accepted, rejected } = checkSections(plan, narrative.sections, guard);
    const summaryProblems = textProblems(narrative.summary || "", guard, MIN_SUMMARY_CHARS);
    if (summaryProblems.length) rejected.push({ heading: "summary", problems: summaryProblems });
    if (!rejected.length) {
      return {
        title: narrative.title || meta.title,
        summary: narrative.summary.trim(),
        sections: accepted,
        remedies: dedupeRemedies([...checkedRemedies(narrative.remedies || [], guard), ...extractChartRemedies(kundli)]),
        ...structured,
        generatedAt: new Date().toISOString(),
      };
    }
    problems = rejected.map((r) => `${r.heading}: ${r.problems.join("; ")}`);
    correction = correctionNote(rejected);
  }
  throw new ReportGenerationError(`report failed the quality check: ${problems.join(" | ")}`);
}

// ─── Complete Life Report (premium, 50+ pages) ────────────────────────────────

// Each batch is one focused gpt-4o call; run in parallel they assemble into a 46-section
// report grounded in the actual chart. Health and longevity are deliberately not predicted.
const LIFE_REPORT_BATCHES: { focus: string; sections: string[] }[] = [
  { focus: "the native's core identity and nature", sections: ["Executive Summary", "Personality & Temperament", "Mind & Emotional Nature", "Core Strengths & Talents", "Challenges & Karmic Lessons"] },
  { focus: "the Sun, Moon and Mars in this chart (placement, dignity, aspects, effects)", sections: ["Sun — Soul, Ego & Authority", "Moon — Mind, Emotions & Mother", "Mars — Energy, Courage & Drive"] },
  { focus: "Mercury, Jupiter and Venus (placement, dignity, aspects, effects)", sections: ["Mercury — Intellect & Communication", "Jupiter — Wisdom, Fortune & Dharma", "Venus — Love, Beauty & Comforts"] },
  { focus: "Saturn, Rahu and Ketu (placement, dignity, aspects, effects)", sections: ["Saturn — Discipline, Karma & Delay", "Rahu — Ambition, Illusion & Obsession", "Ketu — Detachment & Liberation"] },
  { focus: "houses 1 to 6 of the chart, with their lords and occupants", sections: ["1st House — Self, Body & Vitality", "2nd House — Wealth, Speech & Family", "3rd House — Courage, Siblings & Effort", "4th House — Home, Mother & Happiness", "5th House — Intelligence, Children & Romance", "6th House — Service, Debts & Competition"] },
  { focus: "houses 7 to 12 of the chart, with their lords and occupants", sections: ["7th House — Marriage & Partnerships", "8th House — Secrets, Research & Transformation", "9th House — Fortune, Father & Dharma", "10th House — Career, Status & Karma", "11th House — Gains, Networks & Desires", "12th House — Loss, Expenses, Foreign & Moksha"] },
  { focus: "the yogas (planetary combinations) present in this chart and their results", sections: ["Raja Yogas & Power Combinations", "Dhana Yogas (Wealth)", "Other Significant Yogas"] },
  { focus: "doshas and afflictions, including the current Saturn transit (Sade Sati / Dhaiya)", sections: ["Mangal Dosha (Manglik) Analysis", "Kaal Sarp & Pitru Dosha", "Sade Sati & Saturn's Current Influence"] },
  { focus: "the major life domains based on the relevant houses, lords and dashas", sections: ["Career & Profession", "Wealth & Financial Outlook", "Marriage & Relationships", "Education & Learning", "Spirituality & Life Purpose"] },
  { focus: "the Vimshottari dasha life-map — predictions for the major planetary periods, anchored to today's date", sections: ["Dasha Life-Map Overview", "Current Mahadasha — Detailed Forecast", "Next Mahadasha — What to Expect", "Long-Term Dasha Outlook"] },
  { focus: "personalised, practical remedies for this specific chart", sections: ["Gemstone Recommendations", "Mantras & Japa", "Charity, Fasting & Rituals", "Lifestyle & Conduct", "Lucky Factors (colours, numbers, days)"] },
];

async function generateLifeBatch(
  batch: { focus: string; sections: string[] },
  chart: string,
  transit: string,
  correction = "",
): Promise<unknown> {
  const client = getClient();
  const prompt = `You are a master Vedic astrologer (Jyotish) writing one part of a premium "Complete Life Report" (Brihat Kundli). Focus on ${batch.focus}. Reference the EXACT chart data below — name specific planets, signs, houses, degrees, nakshatra and dasha periods. Be thorough, specific and personalised (never generic): write 2-4 rich paragraphs for EACH heading.

${REPORT_DISCIPLINE}

Return ONLY valid JSON: {"sections":[{"heading":"<exact heading>","body":"<2-4 detailed paragraphs>"}]} — one object per heading, with headings EXACTLY and in this order: ${JSON.stringify(batch.sections)}.

Birth chart:
${chart}${transit}${correction ? `\n\n${correction}` : ""}`;

  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 3000,
  });
  return JSON.parse(resp.choices[0]?.message?.content || "{}").sections;
}

/** One batch, checked; the headings it got wrong are regenerated once and otherwise left out. */
async function checkedLifeBatch(batch: { focus: string; sections: string[] }, chart: string, transit: string, guard: ReportGuard): Promise<Section[]> {
  const first = checkSections(batch.sections, await generateLifeBatch(batch, chart, transit).catch(() => []), guard);
  if (!first.rejected.length) return first.accepted;
  const retryHeadings = first.rejected.map((r) => r.heading);
  const retry = checkSections(retryHeadings, await generateLifeBatch({ ...batch, sections: retryHeadings }, chart, transit, correctionNote(first.rejected)).catch(() => []), guard);
  if (retry.rejected.length) console.warn(`[life-report] left out after retry: ${retry.rejected.map((r) => `${r.heading} (${r.problems.join("; ")})`).join(", ")}`);
  const byHeading = new Map([...first.accepted, ...retry.accepted].map((x) => [x.heading, x]));
  return batch.sections.flatMap((h) => byHeading.get(h) ?? []);
}

export const LIFE_REPORT_SECTION_COUNT = LIFE_REPORT_BATCHES.reduce((n, b) => n + b.sections.length, 0);
/** Fewer sections than this and the report is not delivered (the order is refunded). */
export const LIFE_REPORT_MIN_SECTIONS = Math.ceil(LIFE_REPORT_SECTION_COUNT * 0.9);

export async function generateLifeReport(kundli: Partial<Kundli>): Promise<GeneratedReport> {
  requireAi();
  if (isApproximate(kundli)) throw new ReportGenerationError("the Complete Life Report reads every house and needs an exact birth time");
  const structured = deriveStructured(kundli);
  const canonical = (kundli as any).chartData?.canonical;
  const transit = isCurrentCanonicalChart(canonical)
    ? "\n\n" + transitSummary(transitsForChart(canonical, (kundli as any).chartData?.ashtakavarga?.sav))
    : "";
  const guard = reportGuard(kundli, transit);
  const chart = chartSummary(kundli);

  const results = await Promise.all(LIFE_REPORT_BATCHES.map((batch) => checkedLifeBatch(batch, chart, transit, guard)));
  const sections = results.flat();
  if (sections.length < LIFE_REPORT_MIN_SECTIONS) {
    throw new ReportGenerationError(`only ${sections.length} of ${LIFE_REPORT_SECTION_COUNT} sections passed the quality check (minimum ${LIFE_REPORT_MIN_SECTIONS})`);
  }

  const summary = sections.find((s) => s.heading === "Executive Summary")?.body;
  if (!summary) throw new ReportGenerationError("the Executive Summary did not pass the quality check");

  return {
    title: "Complete Life Report",
    summary,
    sections,
    remedies: dedupeRemedies(extractChartRemedies(kundli)),
    ...structured,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Long-term memory extraction ──────────────────────────────────────────────

export interface ExtractedMemory { kind: string; content: string; }

// Pull durable personal facts/goals/events out of a chat message so future
// readings can reference them. Cheap model; degrades to [] without a key.
export async function extractMemories(userMessage: string): Promise<ExtractedMemory[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  try {
    const client = getClient();
    const prompt = `From this user's message to an astrologer, extract only DURABLE personal facts worth remembering long-term: name, relationships/marital status, profession, location, concrete goals, major life events, and stated preferences. Ignore the astrology question itself, greetings, and anything transient. If nothing durable, return an empty array.

Return ONLY JSON: {"memories":[{"kind":"fact|goal|event|preference","content":"<concise third-person statement>"}]}

User message: ${userMessage}`;
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    const arr: any[] = Array.isArray(parsed.memories) ? parsed.memories : [];
    return arr
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .slice(0, 6)
      .map((m) => ({
        kind: ["fact", "goal", "event", "preference"].includes(m.kind) ? m.kind : "fact",
        content: String(m.content).trim(),
      }));
  } catch {
    return [];
  }
}

// ─── Personalised Daily Horoscope ─────────────────────────────────────────────

export interface DailyHoroscopeContent {
  date: string;
  headline: string;
  overall: string;
  career: string;
  love: string;
  finance: string;
  advice: string;
  /** The weekday's ruling planet and its traditional colour and number: the same for everyone today. */
  dayLord: string;
  luckyColor: string;
  luckyNumber: number;
}

// Vara: the weekday lord and its traditional colour and number (Sunday first).
const VARA = [
  { lord: "Sun", color: "Orange", number: 1 },
  { lord: "Moon", color: "White", number: 2 },
  { lord: "Mars", color: "Red", number: 9 },
  { lord: "Mercury", color: "Green", number: 5 },
  { lord: "Jupiter", color: "Yellow", number: 3 },
  { lord: "Venus", color: "Light blue", number: 6 },
  { lord: "Saturn", color: "Dark blue", number: 8 },
];
export function varaFor(dateStr: string) {
  return VARA[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}

const DAILY_FIELDS = ["headline", "overall", "career", "love", "finance", "advice"] as const;

/**
 * Today's card from the person's chart and today's transits. Every field is checked against the
 * chart (one regeneration with the problems listed); null when no AI is configured or the card
 * cannot be made consistent — nothing templated is shown in its place. Health is not predicted.
 */
export async function generateDailyHoroscope(
  kundli: Partial<Kundli>,
  dateStr: string,
  language?: string,
): Promise<DailyHoroscopeContent | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const canonical = (kundli as any).chartData?.canonical;
  if (!isCurrentCanonicalChart(canonical)) return null;
  const asOf = new Date(`${dateStr}T06:00:00Z`);
  const transits = transitSummary(transitsForChart(canonical, (kundli as any).chartData?.ashtakavarga?.sav, asOf));
  const guard: ReportGuard = { chart: canonical, factsText: `${chartSummary(kundli)}\nToday: ${dateStr}.`, transits, asOf };
  const vara = varaFor(dateStr);

  try {
    const client = getClient();
    let correction = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = `You are a Vedic astrologer writing today's personal card for ${dateStr} from the chart facts and today's transits below. Be specific and practical for today; describe tendencies, not certainties. Never mention health, illness or lifespan. Use only the facts given; never invent a placement, yoga, dosha, period or date.

Chart facts:
${chartSummary(kundli)}

Today's transits (Gochar):
${transits}${correction ? `\n\n${correction}` : ""}

Return ONLY valid JSON: {"headline":"short headline","overall":"2-3 sentences for today","career":"1-2 sentences","love":"1-2 sentences","finance":"1-2 sentences","advice":"one practical tip for today"}`;
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 700,
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      const rejected = DAILY_FIELDS.map((k) => ({ heading: k, problems: textProblems(String(parsed[k] ?? ""), guard, k === "overall" ? 40 : 10) }))
        .filter((r) => r.problems.length);
      if (!rejected.length) {
        const card: DailyHoroscopeContent = {
          date: dateStr,
          ...(Object.fromEntries(DAILY_FIELDS.map((k) => [k, String(parsed[k]).trim()])) as Record<(typeof DAILY_FIELDS)[number], string>),
          dayLord: vara.lord,
          luckyColor: vara.color,
          luckyNumber: vara.number,
        };
        return localiseFields(card, [...DAILY_FIELDS], language);
      }
      correction = correctionNote(rejected);
    }
    console.warn("[daily-horoscope] card failed the chart check twice; none shown today");
    return null;
  } catch (err) {
    console.error("[daily-horoscope] generation failed:", err);
    return null;
  }
}

// ─── Pre-Consultation Brief ───────────────────────────────────────────────────

export interface PreConsultBrief {
  intro: string;              
  suggestedTopics: string[];  
  currentFocus: string;       
}

export async function generatePreConsultBrief(
  kundli: Partial<Kundli> | null,
  astrologerName: string,
  astrologerSpecializations: string[]
): Promise<PreConsultBrief> {
  const client = getClient();

  const specs = astrologerSpecializations.join(", ") || "Vedic Astrology";
  const chartCtx = kundli
    ? `\nUser's birth chart:\n${chartSummary(kundli)}`
    : "\nNo birth chart on file — give general preparation tips.";

  const prompt = `You are a Vedic astrology assistant preparing a user for their consultation with ${astrologerName}, who specialises in: ${specs}.${chartCtx}

Return ONLY a valid JSON object with these keys:
{
  "intro": "One personalised sentence telling the user what to expect from this astrologer given their chart",
  "suggestedTopics": ["3 to 5 specific questions or topics to raise during the session, grounded in the chart"],
  "currentFocus": "The single most important chart factor to mention first (e.g. 'You are in Shani Mahadasha — start there')"
}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "";
  try {
    return JSON.parse(text) as PreConsultBrief;
  } catch {
    return {
      intro: `You're about to connect with ${astrologerName}.`,
      suggestedTopics: ["Career direction", "Relationship timing", "Current planetary effects"],
      currentFocus: "Share your key concern at the start of the session.",
    };
  }
}

// ─── Post-Consultation Follow-Up ──────────────────────────────────────────────

export async function generatePostConsultFollowUp(
  kundli: Partial<Kundli> | null,
  astrologerName: string,
  consultationType: string,
  durationMinutes: number
): Promise<string> {
  const client = getClient();

  const chartCtx = kundli
    ? `User's birth chart:\n${chartSummary(kundli)}`
    : "No birth chart on file.";

  const prompt = `The user just completed a ${durationMinutes}-minute ${consultationType} consultation with ${astrologerName} on the Navagraha platform.

${chartCtx}

Write a short, warm post-session message (3-5 sentences) with:
1. Acknowledgement of the session
2. One key action item grounded in their current chart (current dasha / dosha)
3. A suggested follow-up timeframe based on their planetary periods
Keep it under 120 words. No bullet points. Write naturally, like a message from the platform.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0]?.message?.content || `Thank you for your session with ${astrologerName}. Reflect on the insights shared and revisit your chart in the coming weeks.`;
}

// ─── Astrologer Matching ──────────────────────────────────────────────────────

export interface AstrologerMatch {
  astrologerId: string;
  reason: string;
}

export async function matchAstrologerToChart(
  kundli: Partial<Kundli>,
  astrologers: Array<{ id: string; name: string; specializations: string[] }>
): Promise<AstrologerMatch[]> {
  if (!astrologers.length) return [];

  const client = getClient();

  const astroList = astrologers
    .map((a) => `ID: ${a.id} | Name: ${a.name} | Specialisations: ${a.specializations.join(", ")}`)
    .join("\n");

  const prompt = `You are a Vedic astrology routing engine. Given this user's birth chart, identify the top 3 most relevant astrologers from the list below. Prioritise chart issues (doshas, current dasha, weak houses) against specialisation match.

User's birth chart:
${chartSummary(kundli)}

Available astrologers:
${astroList}

Return ONLY a valid JSON object with the array under the key "matches":
{
  "matches": [
    { "astrologerId": "<id>", "reason": "One sentence explaining why this astrologer fits this chart right now" }
  ]
}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "{\"matches\":[]}";
  try {
    const data = JSON.parse(text);
    return data.matches as AstrologerMatch[];
  } catch {
    return [];
  }
}

