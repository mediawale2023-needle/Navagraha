import OpenAI from 'openai';
import { AGENT_PROMPTS } from './prompts';
import { callAstroEngine, formatShadbalaSummary, ChartRequest } from '../astroEngineClient';

// Ensure OPENAI_API_KEY is available in the environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build',
});

export interface UserContext {
  birthDetails: {
    date: string;
    time: string;
    place: string;
  };
  chartData?: any;
  profession?: string;
  pastEvents?: string[];
  language?: string;
  memories?: string[];
  currentQuery: string;
}

/**
 * Super-Astrologer Council: Parallel `$team` Orchestrator (v2 Shadbala Edition)
 *
 * Step 0 (NEW): Calls the Rust astro-engine for deterministic Shadbala/Yoga/Varga math.
 * Step 1: Injects the Rust matrix into all 5 agents' prompt payloads.
 * Step 2: Runs 5 specialist LLM agents in parallel.
 * Step 3: Jyotishi Synthesizer compiles the final reading from pure math, not guesses.
 */
export async function runCouncil(context: UserContext): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  // Recompute the running periods from TODAY (not the stored status, which is
  // frozen at chart-generation time) so the council can't anchor to a stale year.
  const currentPeriod = deriveCurrentPeriod(context.chartData?.dashas, today);
  const currentPeriodLine = currentPeriod
    ? ` As of today the running Mahadasha is ${currentPeriod.maha}${currentPeriod.antar ? ` and the running Antardasha is ${currentPeriod.antar}` : ''}${currentPeriod.period ? ` (${currentPeriod.period})` : ''} — treat this as authoritative and do not contradict it.`
    : '';
  const temporalInjector = (prompt: string) =>
    `GLOBAL DIRECTIVE: Today's exact date is ${today} (YYYY-MM-DD); treat this as the present moment.${currentPeriodLine} All 'current' Dasha and Transit analysis MUST be relative to ${today}. Never describe a past year as the present, and never call a period that has already begun 'upcoming'.\n\n${prompt}`;

  // Only the final reading is translated; the internal council reasons in English.
  const lang = context.language && context.language.trim().toLowerCase() !== 'english' ? context.language.trim() : null;
  const languageDirective = lang
    ? `\n\nLANGUAGE DIRECTIVE: Write the entire final response in ${lang}, using natural, fluent, everyday ${lang}. Astrological proper nouns (planet, sign and dasha names) may stay recognizable.`
    : '';

  // ─── Step 0: Deterministic Rust Math ──────────────────────────────────────
  let shadbalaSummary = '';
  if (context.chartData?.planets) {
    console.log('[Orchestrator] Calling Rust astro-engine for Shadbala/Yoga math...');
    const rustRequest: ChartRequest = {
      planets: context.chartData.planets,
      ascendant_longitude: context.chartData.ascendantLongitude ?? 0,
      latitude: context.chartData.latitude ?? 0,
      julian_day: context.chartData.julianDay ?? 2451545.0, // J2000.0 fallback
    };
    const astroResult = await callAstroEngine(rustRequest);
    if (astroResult) {
      shadbalaSummary = formatShadbalaSummary(astroResult);
      console.log(
        `[Orchestrator] Rust engine: GlobalStrength=${astroResult.global_strength_score} Rupas, ` +
        `${astroResult.yogas.filter(y => y.fires).length} active Yogas`
      );
    } else {
      console.warn('[Orchestrator] Rust engine unavailable — agents will operate without Shadbala data.');
    }
  }

  // Combine chart + shadbala for agents
  const contextPayload = JSON.stringify({
    ...context,
    shadbalaMath: shadbalaSummary || 'Shadbala engine offline — use available chart data only.',
  }, null, 2);

  console.log('[Orchestrator] Spinning up the $team council...');

  // ─── Step 1+2: Parallel 5-Agent Council ────────────────────────────────────
  const [
    chronosResult,
    vargaResult,
    ashtakavargaResult,
    backtesterResult,
    contextResult
  ] = await Promise.all([
    callAgent("chronos", temporalInjector(AGENT_PROMPTS.chronos), contextPayload),
    callAgent("vargaValidator", temporalInjector(AGENT_PROMPTS.vargaValidator), contextPayload),
    callAgent("ashtakavarga", temporalInjector(AGENT_PROMPTS.ashtakavarga), contextPayload),
    callAgent("eventBacktester", temporalInjector(AGENT_PROMPTS.eventBacktester), contextPayload),
    callAgent("deshaKaalaPatra", temporalInjector(AGENT_PROMPTS.deshaKaalaPatra), contextPayload),
  ]);

  // ─── Step 3: Jyotishi Synthesis ────────────────────────────────────────────
  console.log('[Orchestrator] Council computations complete. Synthesizing...');

  const memoryBlock = context.memories && context.memories.length
    ? context.memories.map((m) => `- ${m}`).join('\n')
    : '- (no saved memory yet)';

  const synthesisPayload = `
### Authoritative Temporal Facts (DO NOT contradict):
- Today's date: ${today}
${currentPeriod ? `- Running Mahadasha: ${currentPeriod.maha}\n- Running Antardasha: ${currentPeriod.antar || '—'}${currentPeriod.period ? `\n- Mahadasha period: ${currentPeriod.period}` : ''}` : '- (Dasha periods unavailable)'}

### What we know about this person (from past conversations — use to personalise; don't recite verbatim):
${memoryBlock}

### User Query:
${context.currentQuery}

### Deterministic Rust Math (Tier 1 — NO LLM, pure arithmetic):
${shadbalaSummary || '(Shadbala engine offline)'}

### Council Findings (Tier 2 — LLM Agents):
1. **Chronos (Timing):** ${chronosResult}
2. **Varga-Validator (Divisional Strength):** ${vargaResult}
3. **Ashtakavarga (Matrix Points):** ${ashtakavargaResult}
4. **Event-Backtester (Confidence):** ${backtesterResult}
5. **Desha-Kaala-Patra (Modern Context):** ${contextResult}

Synthesize these findings into the final precise, deterministic, confident Vedic reading.
Speak directly to the person — no "ifs", no "coulds". The math is already computed above.${languageDirective}
`;

  const jyotishiOutput = await callAgent("jyotishi", temporalInjector(AGENT_PROMPTS.jyotishi), synthesisPayload);

  // ─── Step 4: Ethicist Gate (Safety Filter) ────────────────────────────────
  console.log('[Orchestrator] Running Ethicist Gate...');
  const finalReading = await callAgent("ethicist", temporalInjector(AGENT_PROMPTS.ethicist) + languageDirective, jyotishiOutput);

  return finalReading;

}

/**
 * Determine the running Mahadasha/Antardasha as of `today` (YYYY-MM-DD) from a
 * dasha timeline, by date range rather than the stored `status` (which is frozen
 * when the chart is generated and goes stale over time).
 */
function deriveCurrentPeriod(
  dashas: any,
  today: string,
): { maha: string; antar?: string; period?: string } | null {
  if (!Array.isArray(dashas)) return null;
  const inRange = (d: any) => d?.startDate && d?.endDate && d.startDate <= today && today < d.endDate;
  const md = dashas.find(inRange) || dashas.find((d: any) => d?.status === 'current');
  if (!md) return null;
  const antars = Array.isArray(md.antardashas) ? md.antardashas : [];
  const ad = antars.find(inRange) || antars.find((a: any) => a?.status === 'current');
  return { maha: md.planet, antar: ad?.planet, period: md.period };
}

/**
 * Helper: call one LLM agent
 */
async function callAgent(role: string, systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.2,
    });
    return response.choices[0]?.message?.content || "Error: Unexpected empty response from OpenAI.";
  } catch (error) {
    console.error(`[Orchestrator] Agent ${role} failed:`, error);
    return `[Agent ${role} computationally unavailable]`;
  }
}
