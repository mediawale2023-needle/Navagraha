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
  return `
Name: ${kundli.name || "Unknown"}
Date of Birth: ${kundli.dateOfBirth ? new Date(kundli.dateOfBirth).toDateString() : "Unknown"}
Time of Birth: ${kundli.timeOfBirth || "Unknown"}
Place of Birth: ${kundli.placeOfBirth || "Unknown"}
Sun Sign (Rashi): ${kundli.zodiacSign || "Unknown"}
Moon Sign: ${kundli.moonSign || "Unknown"}
Ascendant (Lagna): ${kundli.ascendant || "Unknown"}
Current Dasha: ${kundli.dashas ? JSON.stringify(kundli.dashas).slice(0, 300) : "Not available"}
Doshas: ${kundli.doshas ? JSON.stringify(kundli.doshas).slice(0, 200) : "None detected"}
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

export interface GeneratedReport {
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  remedies: string[];
  generatedAt: string;
}

const REPORT_FOCUS: Record<string, { title: string; focus: string; sections: string[] }> = {
  career:     { title: "Career & Profession Report", focus: "career path, ideal professions, job vs business, and timing of professional growth", sections: ["Career Overview", "Strengths & Ideal Fields", "Job vs Business", "Growth Timing & Dashas", "Challenges to Watch"] },
  marriage:   { title: "Marriage & Love Report", focus: "marriage timing, partner characteristics, married life, and relationship harmony", sections: ["Love & Marriage Overview", "Partner Traits", "Marriage Timing", "Married Life", "Harmony & Compatibility"] },
  finance:    { title: "Wealth & Finance Report", focus: "wealth houses, income sources, investments, savings and financial timing", sections: ["Financial Overview", "Income Sources", "Wealth Accumulation", "Favourable Investment Windows", "Money Management"] },
  health:     { title: "Health & Wellbeing Report", focus: "constitution, vulnerable periods, and lifestyle and astrological remedies", sections: ["Health Constitution", "Vulnerable Periods", "Areas to Watch", "Lifestyle Guidance"] },
  year_ahead: { title: "Year Ahead Report", focus: "month-by-month predictions for the coming 12 months across career, money, relationships and health", sections: ["Year Overview", "Career & Work", "Money & Finance", "Relationships", "Health", "Best & Cautious Months"] },
  life:       { title: "Life Reading Report", focus: "overall life themes, personality, and major life areas", sections: ["Life Overview", "Personality", "Career", "Relationships", "Health & Wellbeing"] },
};

function templatedReport(category: string, kundli: Partial<Kundli>): GeneratedReport {
  const meta = REPORT_FOCUS[category] || REPORT_FOCUS.life;
  return {
    title: meta.title,
    summary: `A personalised ${meta.title} prepared from your Vedic birth chart (Lagna: ${kundli.ascendant || "—"}, Moon: ${kundli.moonSign || "—"}, Rashi: ${kundli.zodiacSign || "—"}). Detailed AI analysis is being finalised; meanwhile here is your chart-based outline.`,
    sections: meta.sections.map((heading) => ({
      heading,
      body: `Insights on ${heading.toLowerCase()} based on your ascendant ${kundli.ascendant || ""}, Moon sign ${kundli.moonSign || ""} and current planetary periods.`,
    })),
    remedies: ["Chant your ruling planet's mantra", "Wear the recommended gemstone after consultation", "Offer prayers on your favourable weekday"],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateReport(
  category: string,
  kundli: Partial<Kundli>,
): Promise<GeneratedReport> {
  const meta = REPORT_FOCUS[category] || REPORT_FOCUS.life;
  if (!process.env.OPENAI_API_KEY) {
    return templatedReport(category, kundli);
  }

  try {
    const client = getClient();
    const prompt = `You are an expert Vedic astrologer preparing a premium paid "${meta.title}". Focus on ${meta.focus}. Analyse the birth chart and return ONLY valid JSON with this exact shape:
{
  "title": "${meta.title}",
  "summary": "3-4 sentence personalised summary",
  "sections": [${meta.sections.map((s) => `{"heading": "${s}", "body": "2-3 rich, specific paragraphs"}`).join(", ")}],
  "remedies": ["4-6 specific, practical Vedic remedies"]
}

Birth chart:
${chartSummary(kundli)}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const text = response.choices[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    return {
      title: parsed.title || meta.title,
      summary: parsed.summary || "",
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      remedies: Array.isArray(parsed.remedies) ? parsed.remedies : [],
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[report] generation failed, using templated fallback:", err);
    return templatedReport(category, kundli);
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

