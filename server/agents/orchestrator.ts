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
  const temporalInjector = (prompt: string) =>
    `GLOBAL DIRECTIVE: The exact current date is ${today}. All 'current' Dasha and Transit analysis MUST be relative to today. Do not hallucinate historical dates as the present.\n\n${prompt}`;

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

  const synthesisPayload = `
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
Speak directly to the person — no "ifs", no "coulds". The math is already computed above.
`;

  const jyotishiOutput = await callAgent("jyotishi", temporalInjector(AGENT_PROMPTS.jyotishi), synthesisPayload);

  // ─── Step 4: Ethicist Gate (Safety Filter) ────────────────────────────────
  console.log('[Orchestrator] Running Ethicist Gate...');
  const finalReading = await callAgent("ethicist", temporalInjector(AGENT_PROMPTS.ethicist), jyotishiOutput);

  return finalReading;

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
