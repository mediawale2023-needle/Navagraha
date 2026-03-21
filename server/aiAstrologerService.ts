/**
 * AI Astrologer Service
 *
 * Uses Anthropic Claude to:
 * 1. Generate personalised Kundli interpretations from chart data
 * 2. Power an AI astrologer chat that knows the user's birth chart
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

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(kundli?: Partial<Kundli> | null): string {
  const chartSection = kundli
    ? `
The user's birth chart (Kundli) details:
• Name: ${kundli.name || "Unknown"}
• Date of Birth: ${kundli.dateOfBirth ? new Date(kundli.dateOfBirth).toDateString() : "Unknown"}
• Time of Birth: ${kundli.timeOfBirth || "Unknown"}
• Place of Birth: ${kundli.placeOfBirth || "Unknown"}
• Sun Sign (Rashi): ${kundli.zodiacSign || "Unknown"}
• Moon Sign: ${kundli.moonSign || "Unknown"}
• Ascendant (Lagna): ${kundli.ascendant || "Unknown"}
• Chart Data: ${kundli.chartData ? JSON.stringify(kundli.chartData, null, 2) : "Not available"}
• Dasha Periods: ${kundli.dashas ? JSON.stringify(kundli.dashas, null, 2) : "Not available"}
• Doshas: ${kundli.doshas ? JSON.stringify(kundli.doshas, null, 2) : "None detected"}
• Remedies: ${kundli.remedies ? JSON.stringify(kundli.remedies, null, 2) : "None"}
`
    : "No birth chart provided — respond based on general Vedic astrology.";

  return `You are Jyotish AI, a deeply knowledgeable Vedic astrologer on the Navagraha platform.
You combine ancient Vedic wisdom (Jyotish shastra) with compassionate, actionable guidance.

${chartSection}

Guidelines:
• Speak with warmth, authority, and cultural sensitivity appropriate for Indian users.
• Ground every insight in actual Vedic principles (nakshatras, dashas, yogas, doshas).
• When specific chart data is available, reference it explicitly (e.g. "your Moon in Rohini nakshatra…").
• Offer practical remedies (gemstones, mantras, colours, fasting days) where relevant.
• Never make absolute predictions about death, accidents, or incurable illness.
• Keep responses focused and under 300 words unless a detailed analysis is requested.
• Use a mix of English and Hindi transliterations (e.g. "shubh yoga", "mangal dosha") naturally.
• Always be encouraging and solution-oriented.`;
}

// ─── Kundli Interpretation ────────────────────────────────────────────────────

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

  const prompt = `Please provide a comprehensive Vedic astrology interpretation for this birth chart.
Return ONLY a valid JSON object (no markdown, no extra text) with exactly these keys:
{
  "overview": "2-3 sentence overall life theme",
  "personality": "core personality traits based on Lagna and Moon sign",
  "career": "career path and professional strengths",
  "relationships": "relationships, marriage timing, partner traits",
  "health": "health tendencies and areas to watch",
  "currentDasha": "current Mahadasha planet, its period dates, and key life effects",
  "currentAntardasha": "current Antardasha (Pratidasha/Bhukti) planet within the Mahadasha, its period dates, and specific effects right now",
  "doshaAnalysis": "dosha analysis and severity",
  "remedies": "top 3-5 practical Vedic remedies",
  "luckyFactors": {
    "number": <lucky number 1-9>,
    "color": "<lucky color>",
    "day": "<lucky day of week>",
    "gemstone": "<recommended gemstone>"
  }
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: buildSystemPrompt(kundli),
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Strip any accidental markdown fences
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as KundliInterpretation;
  } catch {
    // Fallback: wrap raw text in the expected shape
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

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function aiAstrologerChat(
  userMessage: string,
  history: ChatMessage[],
  kundli?: Partial<Kundli> | null
): Promise<string> {
  const client = getClient();

  // Build conversation history (max last 20 turns to stay within token limits)
  const recentHistory = history.slice(-20);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: buildSystemPrompt(kundli),
    messages: [
      ...recentHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ─── Daily Prediction for a zodiac sign ───────────────────────────────────────

export async function aiDailyPrediction(zodiacSign: string): Promise<string> {
  const client = getClient();

  const today = new Date().toDateString();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: buildSystemPrompt(null),
    messages: [
      {
        role: "user",
        content: `Give a concise, insightful daily Vedic astrology prediction for ${zodiacSign} for ${today}.
Cover: general energy, career, relationships, health. End with a mantra or affirmation. Keep it under 150 words.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
