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
  chartData?: any;
  profession?: string;
  pastEvents?: string[];
  currentQuery: string;
}

/**
 * Super-Astrologer Council: Parallel \`$team\` Orchestrator
 * Harnesses 5 specialized agents concurrently before passing to the Jyotishi synthesizer.
 */
export async function runCouncil(context: UserContext): Promise<string> {
  // Step 1: Prepare the context payload
  const contextPayload = JSON.stringify(context, null, 2);

  console.log('[Orchestrator] Spinning up the $team council...');
  
  // Step 2: Massive Parallelism - Run all analytical agents simultaneously
  const [
    chronosResult,
    vargaResult,
    ashtakavargaResult,
    backtesterResult,
    contextResult
  ] = await Promise.all([
    callAgent("chronos", AGENT_PROMPTS.chronos, contextPayload),
    callAgent("vargaValidator", AGENT_PROMPTS.vargaValidator, contextPayload),
    callAgent("ashtakavarga", AGENT_PROMPTS.ashtakavarga, contextPayload),
    callAgent("eventBacktester", AGENT_PROMPTS.eventBacktester, contextPayload),
    callAgent("deshaKaalaPatra", AGENT_PROMPTS.deshaKaalaPatra, contextPayload),
  ]);

  // Step 3: Synthesis - The Jyotishi compiles the absolute truth
  console.log('[Orchestrator] Council computations complete. Synthesizing...');
  
  const synthesisPayload = `
### User Query:
${context.currentQuery}

### Council Findings:
1. **Chronos (Timing):** ${chronosResult}
2. **Varga-Validator (Strength):** ${vargaResult}
3. **Ashtakavarga (Matrix Points):** ${ashtakavargaResult}
4. **Event-Backtester (Confidence stats):** ${backtesterResult}
5. **Desha-Kaala-Patra (Modern Context):** ${contextResult}

Synthesize these findings into the final "Lethal" reading.
`;

  return callAgent("jyotishi", AGENT_PROMPTS.jyotishi, synthesisPayload);
}

/**
 * Helper to call the OpenAI API for a specific agent role
 */
async function callAgent(role: string, systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.2, // Low temperature for high deterministic accuracy
    });
    
    return response.choices[0]?.message?.content || "Error: Unexpected empty response from OpenAI.";
  } catch (error) {
    console.error(`[Orchestrator] Agent ${role} failed:`, error);
    return `[Agent ${role} computationally unavailable]`;
  }
}

