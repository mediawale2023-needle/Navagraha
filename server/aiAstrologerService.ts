/**
 * AI Astrologer Service
 *
 * Uses Anthropic Claude to power three focused utility functions:
 * 1. Pre-consultation brief — talking points for an upcoming session
 * 2. Post-consultation follow-up — personalised action plan after a session
 * 3. Astrologer matching — rank astrologers by chart compatibility
 *
 * Also retains Kundli interpretation for the Kundli view page.
 *
 * Falls back gracefully when ANTHROPIC_API_KEY is not set.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Kundli } from "@shared/schema";

// Lazy-init so the server starts without the key (degraded mode)
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY must be set for AI features");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function chartSummary(kundli: Partial<Kundli>): string {
  return `
Name: ${kundli.name || "Unknown"}
Date of Birth: ${kundli.dateOfBirth ? new Date(kundli.dateOfBirth).toDateString() : "Unknown"}
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

  const prompt = `You are a Vedic astrology expert. Analyse this birth chart and return ONLY a valid JSON object with exactly these keys:
{
  "overview": "2-3 sentence overall life theme",
  "personality": "core personality traits based on Lagna and Moon sign",
  "career": "career path and professional strengths",
  "relationships": "relationships, marriage timing, partner traits",
  "health": "health tendencies and areas to watch",
  "currentDasha": "current Mahadasha planet, period dates, key life effects",
  "currentAntardasha": "current Antardasha planet, period dates, specific effects now",
  "doshaAnalysis": "dosha analysis and severity",
  "remedies": "top 3-5 practical Vedic remedies",
  "luckyFactors": {
    "number": <1-9>,
    "color": "<color>",
    "day": "<day of week>",
    "gemstone": "<gemstone>"
  }
}

Birth chart:
${chartSummary(kundli)}`;

  const response = await client.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as KundliInterpretation;
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

// ─── Pre-Consultation Brief ───────────────────────────────────────────────────
// Generated before user joins a call/chat. Tells user exactly what to raise
// with this specific astrologer given their current chart.

export interface PreConsultBrief {
  intro: string;              // 1-sentence opener
  suggestedTopics: string[];  // 3-5 specific talking points
  currentFocus: string;       // One key chart area to highlight (e.g. Saturn transit)
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

  const response = await client.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as PreConsultBrief;
  } catch {
    return {
      intro: `You're about to connect with ${astrologerName}.`,
      suggestedTopics: ["Career direction", "Relationship timing", "Current planetary effects"],
      currentFocus: "Share your key concern at the start of the session.",
    };
  }
}

// ─── Post-Consultation Follow-Up ──────────────────────────────────────────────
// Generated after a session ends. Returns a personalised action plan.

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

  const response = await client.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].type === "text"
    ? response.content[0].text
    : `Thank you for your session with ${astrologerName}. Reflect on the insights shared and revisit your chart in the coming weeks.`;
}

// ─── Astrologer Matching ──────────────────────────────────────────────────────
// Ranks a list of astrologers by compatibility with the user's chart issues.

export interface AstrologerMatch {
  astrologerId: string;
  reason: string; // One sentence explaining why this astrologer fits this chart
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

Return ONLY a valid JSON array of up to 3 objects:
[
  { "astrologerId": "<id>", "reason": "One sentence explaining why this astrologer fits this chart right now" }
]`;

  const response = await client.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as AstrologerMatch[];
  } catch {
    return [];
  }
}
