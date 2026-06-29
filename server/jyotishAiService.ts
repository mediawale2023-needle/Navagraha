/**
 * Jyotish AI Reading — AI interpretation layer (admin-only professional tool).
 *
 * Provider note: built on OpenAI for now (matching the rest of the app's AI
 * integration in aiAstrologerService.ts / agents/orchestrator.ts). Per the
 * agreed plan, this is structured so swapping the LLM provider to Claude
 * later is a LOCALIZED change: everything outside this file talks to
 * `streamTraditionReading()` / `answerSessionQuery()`, never to the OpenAI
 * SDK directly. To swap providers, replace the body of `streamChatCompletion()`
 * below (and the lazy client init) — no other file needs to change.
 *
 * Degrades gracefully: every exported function throws a clear error if
 * OPENAI_API_KEY is unset, which routes.ts turns into a normal HTTP error
 * rather than crashing boot (see server/routes.ts convention for other
 * OpenAI-backed features).
 */
import OpenAI from 'openai';
import type { JyotishChartData } from './astroEngine/jyotishEngine.js';

export type Tradition = 'parashar' | 'kn_rao' | 'kamakhya';

export const TRADITION_LABELS: Record<Tradition, string> = {
  parashar: 'Parashar (BPHS classical)',
  kn_rao: 'K.N. Rao (Vimshottari + Jaimini Chara, triple confirmation)',
  kamakhya: 'Kamakhya Tantric (Shakta-Tantric, Mahavidya)',
};

// Shared ethics/discipline, mirrored from aiAstrologerService.ts's
// REPORT_DISCIPLINE so every tradition's output holds to the same standard
// regardless of methodology.
const DISCIPLINE = `Discipline: tie every prediction to the activating dasha + at least two confirmations (Navamsa/Dasamsa, Ashtakavarga SAV, house lord placement, karaka). Weigh planetary strength — a weak/debilitated/combust planet under-delivers; note Neecha-bhanga and yoga cancellation explicitly. Give realistic timing windows, not vague ones. Ethics: never predict death or loss of longevity; never frighten; pair every difficulty with a remedy and hope; respect free will; never push a gemstone — flag this engine's own gemstone-contraindication checks if any are present for the chart.`;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be set for the Jyotish AI Reading feature');
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// ─── Chart summary (engine output → prompt text) ───────────────────────────

function fmtPlanets(chartData: JyotishChartData): string {
  return chartData.planets
    .map((p) => `- ${p.planet}: ${p.sign} ${p.degree}° (House ${p.house}${p.isRetrograde ? ', retrograde' : ''}) — Nakshatra ${p.nakshatra} pada ${p.pada} (lord ${p.nakshatraLord}, deity ${p.deity}, ${p.shakti})`)
    .join('\n');
}

function fmtDasha(chartData: JyotishChartData): string {
  const md = chartData.vimshottariDasha.find((d: any) => d.status === 'current');
  const ad = md?.antardashas?.find((a: any) => a.status === 'current');
  const pd = ad?.pratyantardashas?.find((p: any) => p.status === 'current');
  const upcoming = chartData.vimshottariDasha.filter((d: any) => d.status === 'upcoming').slice(0, 3);
  const yogini = chartData.yoginiDasha.find((y: any) => y.status === 'current');
  return [
    md ? `Current Vimshottari Mahadasha: ${md.planet} (${md.period})${ad ? `, Antardasha ${ad.planet} (${ad.period})` : ''}${pd ? `, Pratyantardasha ${pd.planet} (${pd.period})` : ''}` : 'Mahadasha: not available',
    yogini ? `Yogini Dasha (cross-check): ${yogini.yogini}/${yogini.lord} (${yogini.period})` : '',
    ...upcoming.map((d: any) => `Upcoming Mahadasha: ${d.planet} (${d.period})`),
  ].filter(Boolean).join('\n');
}

function fmtJaimini(chartData: JyotishChartData): string {
  const { charKarakas, karakamsha, charaDasha } = chartData.jaimini;
  const karakaLines = charKarakas.map((k) => `- ${k.karaka} (${k.abbr}): ${k.planet}`).join('\n');
  const currentChara = charaDasha.find((c) => c.status === 'current');
  const upcomingChara = charaDasha.filter((c) => c.status === 'upcoming').slice(0, 2);
  const charaLines = [
    currentChara ? `Current Chara Mahadasha: ${currentChara.sign} (${currentChara.years} yrs, ${currentChara.startDate} to ${currentChara.endDate})` : 'Chara Dasha: not available',
    ...upcomingChara.map((c) => `Upcoming Chara Mahadasha: ${c.sign} (${c.years} yrs)`),
  ].join('\n');
  return `Char Karakas:\n${karakaLines}\n\nKarakamsha: ${karakamsha.karakamshaSign} (Atmakaraka ${karakamsha.atmakarakaPlanet})\nIshta Devata: ${karakamsha.ishtaDevata} (${karakamsha.derivation})\n\nJaimini Chara Dasha:\n${charaLines}`;
}

function fmtYogasDoshas(chartData: JyotishChartData): string {
  const yogaLines = chartData.yogas.map((y) => `- ${y.name}${y.cancelled ? ' (cancelled)' : ''}: ${y.description}`).join('\n') || 'None detected';
  const d = chartData.doshas;
  const doshaList = [
    d.mangalDosha ? 'Mangal Dosha (Kuja Dosha)' : null,
    d.kaalSarpDosha ? 'Kaal Sarp Dosha' : null,
    d.pitruDosha ? 'Pitru Dosha' : null,
    d.vishaYoga ? 'Visha Yoga' : null,
  ].filter(Boolean).join(', ') || 'None detected';
  return `Yogas:\n${yogaLines}\n\nDoshas: ${doshaList}`;
}

function fmtRemedies(chartData: JyotishChartData): string {
  const r = chartData.remedies;
  const functional = r.functional.map((x) => `- ${x.action} ${x.focus}: ${x.gemstone ? `gemstone ${x.gemstone}; ` : ''}${x.donation ? `donate ${x.donation}; ` : ''}mantra "${x.mantra}" (${x.japaCount}x) on ${x.day}; worship ${x.deity}. ${x.reason}`).join('\n') || 'None';
  const contraindications = r.gemstoneContraindications.map((c) => `- [${c.severity.toUpperCase()}] ${c.gemstone} (${c.planet}): ${c.reason}`).join('\n') || 'None flagged';
  return `Functional remedies:\n${functional}\n\nGemstone contraindications (check before recommending any stone):\n${contraindications}`;
}

function fmtMahavidya(chartData: JyotishChartData): string {
  const m = chartData.mahavidya;
  return `Primary Mahavidya (via Atmakaraka ${m.primary.graha}): ${m.primary.mahavidya} — ${m.primary.reasoning}\nLagna Mahavidya (${m.lagna.sign}): ${m.lagna.mahavidya} — ${m.lagna.reasoning}`;
}

export interface JyotishProfileInfo {
  name: string;
  gender?: string | null;
  dateOfBirth: string;
  timeOfBirth: string;
  placeOfBirth: string;
}

function chartSummaryForPrompt(profile: JyotishProfileInfo, chartData: JyotishChartData): string {
  return `
Client: ${profile.name}${profile.gender ? ` (${profile.gender})` : ''}
Born: ${profile.dateOfBirth} at ${profile.timeOfBirth}, ${profile.placeOfBirth}
Ascendant (Lagna): ${chartData.ascendant.sign} ${chartData.ascendant.degree}° — Nakshatra ${chartData.ascendant.nakshatra} pada ${chartData.ascendant.pada}

Planetary Positions (D1 Rasi, Lahiri sidereal, Swiss Ephemeris precision):
${fmtPlanets(chartData)}

Dasha Timeline (Vimshottari + Yogini cross-check):
${fmtDasha(chartData)}

Jaimini layer:
${fmtJaimini(chartData)}

${fmtYogasDoshas(chartData)}

Mahavidya mapping (Kamakhya-Tantric lens):
${fmtMahavidya(chartData)}

${fmtRemedies(chartData)}
`.trim();
}

// ─── Tradition system prompts ──────────────────────────────────────────────

function languageDirective(language?: string): string {
  if (!language || language.toLowerCase() === 'english') return '';
  return `\n\nRespond entirely in ${language}.`;
}

function systemPromptFor(tradition: Tradition, language?: string): string {
  const base = (() => {
    switch (tradition) {
      case 'parashar':
        return `You are a classical Parashari (BPHS) Vedic astrologer giving a working reading to a fellow professional astrologer who is in a live session with their client. Go house-by-house (1st through 12th): house significance, occupying/aspecting planets, house lord's placement and strength, and what this concretely means for the client's life. Use standard Parashari tools: dignity/avastha, Ashtakavarga SAV, Bhava-Chalit shifts, Navamsa/Dasamsa for confirmation. Be direct and structured — this is for the astrologer's own reference, not client-facing copy.`;
      case 'kn_rao':
        return `You are a Vedic astrologer working in the K.N. Rao tradition, briefing a fellow professional astrologer mid-session. Apply K.N. Rao's signature method: lead with the running Vimshottari Mahadasha/Antardasha/Pratyantardasha, cross-confirm every major prediction against the Jaimini Chara Dasha AND the Yogini Dasha (triple confirmation — only commit to a prediction when at least two of the three dasha systems agree), and use the Char Karakas/Karakamsha/Ishta Devata for character and life-purpose reads. Be explicit when the three systems disagree and say which carries more weight here and why. Structured, terse, reference-style.`;
      case 'kamakhya':
        return `You are a Shakta-Tantric (Kamakhya) astrologer briefing a fellow professional astrologer mid-session. Frame the chart through the Mahavidya mapping already computed (primary Mahavidya via Atmakaraka, Lagna Mahavidya), the planets as embodiments of Devi's forms, and tantric remedial measures (specific mantra/yantra/sadhana per the governing Mahavidya) alongside the standard functional remedies. Explicitly flag that this Mahavidya mapping is ONE documented lineage-method, not universal scripture, and invite the astrologer to recalibrate against their own Kamakhya lineage if it differs. Structured, reference-style, not client-facing.`;
    }
  })();
  return `${base}\n\n${DISCIPLINE}${languageDirective(language)}`;
}

// ─── Provider call (swap point for a future Claude migration) ─────────────

/**
 * Streams a chat completion, invoking onToken for each text delta, and
 * resolves with the full concatenated text. This is the ONLY function that
 * talks to the OpenAI SDK — swapping providers later means rewriting this
 * function body (and getClient()) to call Anthropic's streaming API instead,
 * with every caller in this file unchanged.
 */
async function streamChatCompletion(
  systemPrompt: string,
  userPrompt: string,
  onToken: (delta: string) => void,
): Promise<string> {
  const client = getClient();
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    stream: true,
    temperature: 0.6,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      full += delta;
      onToken(delta);
    }
  }
  return full;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate (and stream) the full tradition-specific reading for a chart.
 * Returns the complete text once streaming finishes, for the caller to persist.
 */
export async function streamTraditionReading(
  tradition: Tradition,
  profile: JyotishProfileInfo,
  chartData: JyotishChartData,
  onToken: (delta: string) => void,
  language?: string,
): Promise<string> {
  const system = systemPromptFor(tradition, language);
  const user = `Give a full reading for this chart in the ${TRADITION_LABELS[tradition]} tradition.\n\n${chartSummaryForPrompt(profile, chartData)}`;
  return streamChatCompletion(system, user, onToken);
}

/**
 * Quick mid-session answer to a specific client question, in a given
 * tradition's lens — for the "session query box" so the astrologer never
 * has to dig through the full reading manually during a live call.
 */
export async function answerSessionQuery(
  tradition: Tradition,
  profile: JyotishProfileInfo,
  chartData: JyotishChartData,
  question: string,
  onToken: (delta: string) => void,
  language?: string,
): Promise<string> {
  const system = `${systemPromptFor(tradition, language)}\n\nThe astrologer is live on a call right now and needs a SHORT, direct answer (3-6 sentences) to the specific question below — not a full reading. Answer only what's asked, grounded in the chart data given.`;
  const user = `Chart:\n${chartSummaryForPrompt(profile, chartData)}\n\nClient's question right now: ${question}`;
  return streamChatCompletion(system, user, onToken);
}

export function isJyotishAiAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
