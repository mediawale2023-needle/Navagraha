import OpenAI from 'openai';
import { AGENT_PROMPTS } from './prompts';

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
  chartData?: {
    ascendant?: string | null; sunSign?: string | null; moonSign?: string | null;
    planets?: unknown; calculatedChart?: unknown; dashas?: unknown; doshas?: unknown;
  } | null;
  profession?: string;
  pastEvents?: string[];
  language?: string;
  memories?: string[];
  transits?: string;
  verifiedEvents?: string[];
  accuracyNote?: string;
  /** Deterministic evidence packet (Ask Your Kundli). When present, agents see only this, not raw chart JSON. */
  evidencePacket?: string;
  currentQuery: string;
}

const PREDICTION_DISCIPLINE = `PREDICTION DISCIPLINE (mandatory):
- A yoga or placement is only a promise; tie any timing to the supplied dasha periods and transits.
- Never predict from a single factor; name the supplied confirmations and contradictions.
- Keep the engine's verdict and confidence labels. If the chart is ambiguous or the birth time is approximate, say so plainly.
- Adapt classical rules to the person's modern context (Desha-Kaala-Patra).
ETHICS: Never predict death, lifespan, serious illness, guaranteed pregnancy, guaranteed marriage/divorce or guaranteed financial outcomes. Never frighten, never sell remedies through fear, never push gemstones. The chart shows tendency and timing as the tradition reads it, not fixed fate.`;

/**
 * Super-Astrologer Council — the DEEP path of Ask Your Kundli.
 *
 * Step 1: Every agent receives the same deterministic evidence packet.
 * Step 2: Five specialist agents interpret it in parallel.
 * Step 3: The Jyotishi synthesizes; the Ethicist gate reviews safety.
 * Simple questions do not reach this function (see askKundli.ts).
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

  // Agents see the deterministic evidence packet; raw chart JSON only when no packet exists.
  const contextPayload = context.evidencePacket
    ? `${context.evidencePacket}\n\nQUESTION: ${context.currentQuery}\nMEMORIES: ${(context.memories ?? []).join(' | ') || '(none)'}\nCONFIRMED PAST EVENTS: ${(context.verifiedEvents ?? []).join(' | ') || '(none)'}`
    : JSON.stringify({ ...context, note: 'No deterministic evidence packet: use supplied chart facts only; never invent missing chart facts or strengths.' }, null, 2);

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
  const verifiedBlock = context.verifiedEvents && context.verifiedEvents.length
    ? context.verifiedEvents.map((e) => `- ${e}`).join('\n')
    : '- (none recorded yet)';

  const synthesisPayload = `
### Authoritative Temporal Facts (DO NOT contradict):
- Today's date: ${today}
${currentPeriod ? `- Running Mahadasha: ${currentPeriod.maha}\n- Running Antardasha: ${currentPeriod.antar || '—'}${currentPeriod.period ? `\n- Mahadasha period: ${currentPeriod.period}` : ''}` : '- (Dasha periods unavailable)'}

### What we know about this person (from past conversations — use to personalise; don't recite verbatim):
${memoryBlock}

### Confirmed past events for this person (ground truth — your reading must stay consistent with these):
${verifiedBlock}
${context.accuracyNote ? `\n### Calibration: ${context.accuracyNote}` : ''}

### Current Transits (Gochar — authoritative, as of today):
${context.transits || '(transits unavailable)'}

### User Query:
${context.currentQuery}

### Deterministic evidence packet (authoritative):
${context.evidencePacket ?? '(none — use only the supplied chart facts; do not infer missing strengths)'}

### Council Findings (Tier 2 — LLM Agents):
1. **Chronos (Timing):** ${chronosResult}
2. **Varga-Validator (Divisional Strength):** ${vargaResult}
3. **Ashtakavarga (Matrix Points):** ${ashtakavargaResult}
4. **Event-Backtester (Confidence):** ${backtesterResult}
5. **Desha-Kaala-Patra (Modern Context):** ${contextResult}

${PREDICTION_DISCIPLINE}

Now synthesize into the final reading. Be specific and confident where the chart supports it, honest where it does not.${languageDirective}
`;

  const jyotishiOutput = await callAgent("jyotishi", temporalInjector(AGENT_PROMPTS.jyotishi), synthesisPayload);

  // ─── Step 4: Ethicist Gate (Safety Filter) ────────────────────────────────
  console.log('[Orchestrator] Running Ethicist Gate...');
  const ethicsReinforce = "\n\nSTRICT: Remove any prediction of death or longevity. Remove fear-mongering. Pair challenges with realistic, practical guidance; remedies are optional and never a condition for a good outcome. No gemstone sales pressure.";
  const finalReading = await callAgent("ethicist", temporalInjector(AGENT_PROMPTS.ethicist) + ethicsReinforce + languageDirective, jyotishiOutput);

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
