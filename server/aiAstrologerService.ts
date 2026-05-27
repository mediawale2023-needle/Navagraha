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

import OpenAI from "openai";
import type { Kundli } from "@shared/schema";
import { getKundli, getTransits, transitSummary } from "./astroEngine/index.js";

// Lazy-init so the server starts without the key (degraded mode)
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY must be set for AI features");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function chartSummary(kundli: Partial<Kundli>): string {
  const { birthDetails, planetaryPositions, dashaTimeline } = deriveStructured(kundli);

  const posLines = planetaryPositions
    .map((p) => `- ${p.planet}: ${p.sign ?? "—"} (House ${p.house ?? "—"}, ${p.degree ?? "—"}°${p.retrograde ? ", retrograde" : ""})`)
    .join("\n");

  const currentMd = dashaTimeline.find((d) => d.status === "current");
  const upcoming = dashaTimeline.filter((d) => d.status === "upcoming").slice(0, 3);

  // Running Pratyantardasha (finer timing) + cross-confirming Yogini dasha.
  const rawDashas: any[] = Array.isArray((kundli as any).dashas) ? (kundli as any).dashas : [];
  const curMdRaw = rawDashas.find((d) => d.status === "current");
  const curAdRaw = curMdRaw?.antardashas?.find((a: any) => a.status === "current");
  const curPdRaw = curAdRaw?.pratyantardashas?.find((p: any) => p.status === "current");
  const pratyantarLine = curPdRaw ? `Current Pratyantardasha: ${curPdRaw.planet} (${curPdRaw.period})` : "";
  const yogini: any[] = (kundli as any).chartData?.yoginiDasha || [];
  const curYogini = yogini.find((y) => y.status === "current");
  const yoginiLine = curYogini ? `Yogini Dasha (cross-check): ${curYogini.yogini} / ${curYogini.lord} (${curYogini.period})` : "";

  const dashaLines = [
    currentMd
      ? `Current Mahadasha: ${currentMd.planet} (${currentMd.period})${currentMd.currentAntardasha ? `, Antardasha ${currentMd.currentAntardasha.planet} (${currentMd.currentAntardasha.period})` : ""}`
      : "Current Mahadasha: not available",
    pratyantarLine,
    yoginiLine,
    ...upcoming.map((d) => `Upcoming Mahadasha: ${d.planet} (${d.period})`),
  ].filter(Boolean).join("\n");

  const doshas = ((kundli as any).doshas || {}) as Record<string, unknown>;
  const doshaList = Object.entries(doshas).filter(([, v]) => v).map(([k]) => k).join(", ") || "None detected";

  const navPositions: any[] = (kundli as any).chartData?.navamsa?.planetaryPositions || [];
  const navLines = navPositions
    .filter((p) => p.planet !== "Ascendant")
    .map((p) => `- ${p.planet}: ${p.sign} (D9 House ${p.house})`)
    .join("\n");

  const savByHouse: number[] = (kundli as any).chartData?.ashtakavarga?.savByHouse || [];
  const savLine = savByHouse.length === 12
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

  const bhava: any = (kundli as any).chartData?.bhava || {};
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
Ascendant (Lagna): ${birthDetails.ascendant || "Unknown"}
Moon Sign (Rashi): ${birthDetails.moonSign || "Unknown"}
Sun Sign: ${birthDetails.sunSign || "Unknown"}

Planetary Positions (D1 Rasi):
${posLines || "Not available"}

Navamsa Positions (D9 — marriage, dharma, true strength):
${navLines || "Not available"}

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
`.trim();
}

// ─── Kundli Interpretation (used in KundliView page) ──────────────────────────

export interface KundliInterpretation {
  overview: string;
  personality: string;
  career: string;
  relationships: string;
  health: string;
  currentDasha: string;
  currentAntardasha: string;
  doshaAnalysis: string;
  remedies: string;
  luckyFactors: {
    number: number;
    color: string;
    day: string;
    gemstone: string;
  };
}

export async function interpretKundli(
  kundli: Partial<Kundli>
): Promise<KundliInterpretation> {
  const client = getClient();

  const prompt = `You are a Vedic astrology expert. Analyse this birth chart and return ONLY a valid JSON object with exactly these keys. EVERY VALUE MUST BE A SINGLE, WELL-WRITTEN PARAGRAPH STRING (except luckyFactors). DO NOT USE NESTED JSON OR ARRAYS FOR ANY TEXT FIELD:
{
  "overview": "2-3 sentence overall life theme",
  "personality": "core personality traits based on Lagna and Moon sign",
  "career": "career path and professional strengths",
  "relationships": "relationships, marriage timing, partner traits",
  "health": "health tendencies and areas to watch",
  "currentDasha": "Write a flowing paragraph describing the current Mahadasha planet, dates, and its key life effects.",
  "currentAntardasha": "Write a flowing paragraph describing the current Antardasha, dates, and specific effects now.",
  "doshaAnalysis": "Write a paragraph describing the dosha analysis and severity.",
  "remedies": "Write a single paragraph listing top 3-5 practical Vedic remedies, separated by commas.",
  "luckyFactors": {
    "number": <1-9>,
    "color": "<color>",
    "day": "<day of week>",
    "gemstone": "<gemstone>"
  }
}

Birth chart:
${chartSummary(kundli)}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "";

  try {
    return JSON.parse(text) as KundliInterpretation;
  } catch {
    return {
      overview: text,
      personality: "",
      career: "",
      relationships: "",
      health: "",
      currentDasha: "",
      currentAntardasha: "",
      doshaAnalysis: "",
      remedies: "",
      luckyFactors: { number: 1, color: "Gold", day: "Sunday", gemstone: "Ruby" },
    };
  }
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
}

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

  const dashaTimeline: ReportDashaPeriod[] = rawDashas.map((d) => {
    const current = Array.isArray(d.antardashas) ? d.antardashas.find((a: any) => a.status === "current") : null;
    return {
      planet: d.planet,
      period: d.period,
      status: d.status,
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
  health:     { title: "Health & Wellbeing Report", focus: "constitution, vulnerable periods, and lifestyle and astrological remedies", sections: ["Health Constitution", "Vulnerable Periods", "Areas to Watch", "Lifestyle Guidance"] },
  year_ahead: { title: "Year Ahead Report", focus: "month-by-month predictions for the coming 12 months across career, money, relationships and health", sections: ["Year Overview", "Career & Work", "Money & Finance", "Relationships", "Health", "Best & Cautious Months"] },
  life:       { title: "Life Reading Report", focus: "overall life themes, personality, and major life areas", sections: ["Life Overview", "Personality", "Career", "Relationships", "Health & Wellbeing"] },
};

type ReportMeta = { title: string; focus: string; sections: string[] };
type ReportNarrative = Pick<GeneratedReport, "title" | "summary" | "sections" | "remedies">;

// Sections common to every report, wrapping the category-specific ones with a
// chart overview up front and a dasha-timing section at the end.
function sectionPlan(meta: ReportMeta): string[] {
  return ["Birth Chart Overview", "Key Planetary Influences", ...meta.sections, "Dasha Periods & Timing"];
}

function templatedNarrative(meta: ReportMeta, structured: StructuredChart): ReportNarrative {
  const bd = structured.birthDetails;
  const currentMd = structured.dashaTimeline.find((d) => d.status === "current");
  const posText = structured.planetaryPositions
    .filter((p) => p.planet !== "Ascendant")
    .map((p) => `${p.planet} in ${p.sign} (House ${p.house})`)
    .join(", ");

  return {
    title: meta.title,
    summary: `This ${meta.title} is prepared from your Vedic birth chart — Lagna ${bd.ascendant || "—"}, Moon ${bd.moonSign || "—"}, Sun ${bd.sunSign || "—"}. ${currentMd ? `You are currently running the ${currentMd.planet} Mahadasha${currentMd.currentAntardasha ? ` with ${currentMd.currentAntardasha.planet} Antardasha` : ""}. ` : ""}It focuses on ${meta.focus}.`,
    sections: [
      { heading: "Birth Chart Overview", body: `Your ascendant (Lagna) is ${bd.ascendant || "—"} with the Moon placed in ${bd.moonSign || "—"} and the Sun in ${bd.sunSign || "—"}. Planetary placements: ${posText || "—"}.` },
      ...meta.sections.map((heading) => ({
        heading,
        body: `Analysis of ${heading.toLowerCase()} based on your ascendant ${bd.ascendant || ""}, Moon sign ${bd.moonSign || ""}${currentMd ? ` and the current ${currentMd.planet} Mahadasha` : ""}.`,
      })),
      { heading: "Dasha Periods & Timing", body: currentMd ? `Current Mahadasha: ${currentMd.planet} (${currentMd.period}).${currentMd.currentAntardasha ? ` Antardasha: ${currentMd.currentAntardasha.planet} (${currentMd.currentAntardasha.period}).` : ""} The full Vimshottari timeline is shown in your report.` : "Your Vimshottari dasha timeline is shown in your report." },
    ],
    remedies: [
      "Chant your Lagna lord's beej mantra 108 times daily",
      "Wear the gemstone recommended for your ascendant after consultation",
      "Offer prayers and donate on your favourable weekday",
    ],
  };
}

async function aiNarrative(meta: ReportMeta, kundli: Partial<Kundli>): Promise<ReportNarrative> {
  const client = getClient();
  const plan = sectionPlan(meta);
  const prompt = `You are an expert Vedic astrologer preparing a premium, in-depth paid report titled "${meta.title}". This is a paid product (₹299–₹499), so it must read like a thorough professional consultation — detailed, specific and personalised, NOT a short summary. Focus on ${meta.focus}.

Use the EXACT planetary positions, houses and Vimshottari dasha timeline below. Reference specific planets, signs, houses and dasha periods by name throughout your analysis. Avoid generic statements that could apply to anyone.

Return ONLY valid JSON with this exact shape:
{
  "title": "${meta.title}",
  "summary": "a rich, personalised overview of 5-7 sentences",
  "sections": [${plan.map((s) => `{"heading": "${s}", "body": "3-5 detailed, specific paragraphs that reference the actual chart"}`).join(", ")}],
  "remedies": ["6-8 specific, practical Vedic remedies — include a gemstone, a mantra with its repetition count, a charity/daan, a fasting day, and a deity to worship where relevant"]
}

Birth chart:
${chartSummary(kundli)}`;

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

export async function generateReport(
  category: string,
  kundli: Partial<Kundli>,
): Promise<GeneratedReport> {
  const meta = REPORT_FOCUS[category] || REPORT_FOCUS.life;
  const structured = deriveStructured(kundli);
  const chartRemedies = extractChartRemedies(kundli);

  let narrative: ReportNarrative;
  if (process.env.OPENAI_API_KEY) {
    try {
      narrative = await aiNarrative(meta, kundli);
    } catch (err) {
      console.error("[report] generation failed, using templated fallback:", err);
      narrative = templatedNarrative(meta, structured);
    }
  } else {
    narrative = templatedNarrative(meta, structured);
  }

  return {
    ...narrative,
    remedies: dedupeRemedies([...(narrative.remedies || []), ...chartRemedies]),
    ...structured,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Complete Life Report (premium, 50+ pages) ────────────────────────────────

// Each batch is one focused gpt-4o call; run in parallel they assemble into a
// ~50-section, 50+ page report grounded in the actual chart.
const LIFE_REPORT_BATCHES: { focus: string; sections: string[] }[] = [
  { focus: "the native's core identity and nature", sections: ["Executive Summary", "Personality & Temperament", "Mind & Emotional Nature", "Physical Constitution & Appearance", "Core Strengths & Talents", "Challenges & Karmic Lessons"] },
  { focus: "the Sun, Moon and Mars in this chart (placement, dignity, aspects, effects)", sections: ["Sun — Soul, Ego & Authority", "Moon — Mind, Emotions & Mother", "Mars — Energy, Courage & Drive"] },
  { focus: "Mercury, Jupiter and Venus (placement, dignity, aspects, effects)", sections: ["Mercury — Intellect & Communication", "Jupiter — Wisdom, Fortune & Dharma", "Venus — Love, Beauty & Comforts"] },
  { focus: "Saturn, Rahu and Ketu (placement, dignity, aspects, effects)", sections: ["Saturn — Discipline, Karma & Delay", "Rahu — Ambition, Illusion & Obsession", "Ketu — Detachment & Liberation"] },
  { focus: "houses 1 to 6 of the chart, with their lords and occupants", sections: ["1st House — Self, Body & Vitality", "2nd House — Wealth, Speech & Family", "3rd House — Courage, Siblings & Effort", "4th House — Home, Mother & Happiness", "5th House — Intelligence, Children & Romance", "6th House — Health, Debts & Enemies"] },
  { focus: "houses 7 to 12 of the chart, with their lords and occupants", sections: ["7th House — Marriage & Partnerships", "8th House — Longevity, Secrets & Transformation", "9th House — Fortune, Father & Dharma", "10th House — Career, Status & Karma", "11th House — Gains, Networks & Desires", "12th House — Loss, Expenses, Foreign & Moksha"] },
  { focus: "the yogas (planetary combinations) present in this chart and their results", sections: ["Raja Yogas & Power Combinations", "Dhana Yogas (Wealth)", "Other Significant Yogas"] },
  { focus: "doshas and afflictions, including the current Saturn transit (Sade Sati / Dhaiya)", sections: ["Mangal Dosha (Manglik) Analysis", "Kaal Sarp & Pitru Dosha", "Sade Sati & Saturn's Current Influence"] },
  { focus: "the major life domains based on the relevant houses, lords and dashas", sections: ["Career & Profession", "Wealth & Financial Outlook", "Marriage & Relationships", "Education & Learning", "Health & Longevity", "Spirituality & Life Purpose"] },
  { focus: "the Vimshottari dasha life-map — predictions for the major planetary periods, anchored to today's date", sections: ["Dasha Life-Map Overview", "Current Mahadasha — Detailed Forecast", "Next Mahadasha — What to Expect", "Long-Term Dasha Outlook"] },
  { focus: "personalised, practical remedies for this specific chart", sections: ["Gemstone Recommendations", "Mantras & Japa", "Charity, Fasting & Rituals", "Lifestyle & Conduct", "Lucky Factors (colours, numbers, days)"] },
];

async function currentTransitContext(): Promise<string> {
  try {
    const nk: any = await getKundli(new Date(), "12:00", 28.6139, 77.2090);
    const positions: any[] = nk?.chartData?.planetaryPositions || [];
    const sign = (p: string) => positions.find((x) => x.planet === p)?.sign || "—";
    return `\nCurrent planetary transits (as of ${new Date().toDateString()}): Saturn in ${sign("Saturn")}, Jupiter in ${sign("Jupiter")}, Rahu in ${sign("Rahu")}, Ketu in ${sign("Ketu")}. Assess Sade Sati from Saturn's transit relative to the natal Moon sign.`;
  } catch {
    return "";
  }
}

async function generateLifeBatch(
  batch: { focus: string; sections: string[] },
  chart: string,
  transit: string,
): Promise<{ heading: string; body: string }[]> {
  const client = getClient();
  const prompt = `You are a master Vedic astrologer (Jyotish) writing one part of a premium 50+ page "Complete Life Report" (Brihat Kundli). Focus on ${batch.focus}. Reference the EXACT chart data below — name specific planets, signs, houses, degrees, nakshatra and dasha periods. Be thorough, specific and personalised (never generic): write 2-4 rich paragraphs for EACH heading.

Return ONLY valid JSON: {"sections":[{"heading":"<exact heading>","body":"<2-4 detailed paragraphs>"}]} — one object per heading, with headings EXACTLY and in this order: ${JSON.stringify(batch.sections)}.

Birth chart:
${chart}${transit}`;

  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 3000,
  });
  const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
  const arr: any[] = Array.isArray(parsed.sections) ? parsed.sections : [];
  return batch.sections
    .map((h, i) => {
      const byHeading = arr.find((s) => typeof s?.heading === "string" && s.heading.trim().toLowerCase() === h.trim().toLowerCase());
      const body = String((byHeading?.body ?? arr[i]?.body) || "").trim();
      return { heading: h, body };
    })
    .filter((s) => s.body);
}

export async function generateLifeReport(kundli: Partial<Kundli>): Promise<GeneratedReport> {
  const structured = deriveStructured(kundli);
  const chartRemedies = extractChartRemedies(kundli);
  const title = "Complete Life Report";

  if (!process.env.OPENAI_API_KEY) {
    const narrative = templatedNarrative(REPORT_FOCUS.life, structured);
    return {
      ...narrative,
      title,
      remedies: dedupeRemedies([...(narrative.remedies || []), ...chartRemedies]),
      ...structured,
      generatedAt: new Date().toISOString(),
    };
  }

  const chart = chartSummary(kundli);
  const transit = (kundli.moonSign && kundli.ascendant)
    ? "\n\n" + transitSummary(getTransits(kundli.moonSign, kundli.ascendant, (kundli as any).chartData?.ashtakavarga?.sav))
    : await currentTransitContext();

  // Parallel batches; a failed batch degrades to empty (filtered out) rather than
  // failing the whole report.
  const results = await Promise.all(
    LIFE_REPORT_BATCHES.map((batch) =>
      generateLifeBatch(batch, chart, transit).catch((err) => {
        console.error(`[life-report] batch "${batch.focus}" failed:`, err);
        return [] as { heading: string; body: string }[];
      }),
    ),
  );
  const sections = results.flat();

  const summary =
    sections.find((s) => /summary/i.test(s.heading))?.body ||
    `A complete Vedic life analysis prepared from your birth chart — Lagna ${structured.birthDetails.ascendant || "—"}, Moon ${structured.birthDetails.moonSign || "—"}, Sun ${structured.birthDetails.sunSign || "—"}.`;

  return {
    title,
    summary,
    sections,
    remedies: dedupeRemedies(chartRemedies),
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
  rating: number; // 1-5
  career: string;
  love: string;
  health: string;
  finance: string;
  luckyColor: string;
  luckyNumber: number;
  advice: string;
}

function clampRating(r: any): number {
  const n = Math.round(Number(r));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
}

function templatedDaily(dateStr: string, bd: ReportBirthDetails, currentMd?: ReportDashaPeriod): DailyHoroscopeContent {
  return {
    date: dateStr,
    headline: "Steady progress today",
    overall: `With your Moon in ${bd.moonSign || "your sign"}${currentMd ? ` and the ${currentMd.planet} Mahadasha active` : ""}, today favours measured, deliberate action over haste.`,
    rating: 3,
    career: "Focus on one priority task; avoid scattering your energy.",
    love: "A calm, honest conversation strengthens a key relationship.",
    health: "Balance activity with rest and keep hydrated.",
    finance: "A good day to plan and review rather than make big purchases.",
    luckyColor: "Yellow",
    luckyNumber: 5,
    advice: "Begin the day with a few minutes of stillness before acting.",
  };
}

export async function generateDailyHoroscope(
  kundli: Partial<Kundli>,
  dateStr: string,
  language?: string,
): Promise<DailyHoroscopeContent> {
  const { birthDetails, dashaTimeline } = deriveStructured(kundli);
  const currentMd = dashaTimeline.find((d) => d.status === "current");
  const lang = language && language.trim().toLowerCase() !== "english" ? language.trim() : null;

  if (!process.env.OPENAI_API_KEY) {
    return templatedDaily(dateStr, birthDetails, currentMd);
  }

  try {
    const client = getClient();
    const dashaCtx = currentMd
      ? `, currently running the ${currentMd.planet} Mahadasha${currentMd.currentAntardasha ? ` / ${currentMd.currentAntardasha.planet} Antardasha` : ""}`
      : "";
    const prompt = `You are an expert Vedic astrologer writing today's PERSONALISED daily horoscope for ${dateStr}. Base it specifically on this person's chart — Lagna ${birthDetails.ascendant || "—"}, Moon ${birthDetails.moonSign || "—"}, Sun ${birthDetails.sunSign || "—"}${dashaCtx}. Make it specific and actionable for today — not generic sun-sign text.${lang ? ` Write every text field in ${lang}.` : ""}

Return ONLY valid JSON: {"headline":"short uplifting headline","overall":"2-3 sentence personalised summary for today","rating":<integer 1-5>,"career":"1-2 sentences","love":"1-2 sentences","health":"1-2 sentences","finance":"1-2 sentences","luckyColor":"a colour","luckyNumber":<integer 1-9>,"advice":"one practical tip for today"}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 700,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    return {
      date: dateStr,
      headline: parsed.headline || "Your day ahead",
      overall: parsed.overall || "",
      rating: clampRating(parsed.rating),
      career: parsed.career || "",
      love: parsed.love || "",
      health: parsed.health || "",
      finance: parsed.finance || "",
      luckyColor: parsed.luckyColor || "—",
      luckyNumber: Number(parsed.luckyNumber) || 1,
      advice: parsed.advice || "",
    };
  } catch (err) {
    console.error("[daily-horoscope] generation failed, using fallback:", err);
    return templatedDaily(dateStr, birthDetails, currentMd);
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

