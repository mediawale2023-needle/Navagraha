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
const DISCIPLINE = `Discipline: tie every prediction to the activating dasha + at least two confirmations (Navamsa/Dasamsa, Ashtakavarga SAV, house lord placement, karaka). Weigh planetary strength — a weak/debilitated/combust planet under-delivers; note Neecha-bhanga and yoga cancellation explicitly. Give realistic timing windows, not vague ones. Ethics: never predict death or loss of longevity; never frighten; pair every difficulty with a remedy and hope; respect free will; never push a gemstone — flag this engine's own gemstone-contraindication checks if any are present for the chart.

Depth and structure (mandatory — this is a working reference for a professional astrologer, not a short summary; write the full length needed to satisfy every point below, do not compress or truncate):
1. PAST: Walk through every COMPLETED Mahadasha (and Antardasha where given) in the timeline supplied, oldest to most recent. For each, state what that period most plausibly delivered (career/finance, relationships/marriage, health, family, education, relocation, spiritual life) and WHY — name the specific placement driving it (planet's sign, house, dignity/avastha, nakshatra, yoga/dosha involvement, aspect, or karaka role). Mark each period explicitly as favourable, mixed, or difficult for the life areas it touched, with causal reasoning, not bare assertion.
2. PRESENT: Analyse the CURRENT Mahadasha → Antardasha → Pratyantardasha stack in detail. State precisely what is active right now, which life areas it activates, whether it is fundamentally supportive or challenging for each of those areas (explicit: favourable, unfavourable, or mixed — never hedge into vagueness), and the chart-placement reasoning behind that verdict.
3. FUTURE: Project forward through every UPCOMING Mahadasha given (and their Antardasha if supplied), in chronological order, with the approximate date ranges drawn from the dasha periods given. For each: what it is likely to bring, which life areas, favourable/unfavourable/mixed verdict, and the placement-based reasoning. Flag the single strongest opportunity window and the single most cautious window across the whole forward timeline, each with its "why".
4. EXPLAIN THE "WHY" EVERYWHERE: every prediction — past, present, or future — must cite at least one concrete chart fact (sign, house, dignity, retrogression, combustion, nakshatra, aspect, yoga, dosha, or karaka) as its cause. Never state an outcome without grounding it. If two confirmations agree, say so; if they conflict, say which wins and why.
5. GOOD/BAD FRAMING: for every period and every life domain discussed (career, wealth, relationships/marriage, health, family, spirituality, travel/relocation), explicitly characterise it as favourable, unfavourable, or mixed — never leave the astrologer guessing the verdict.
6. Close with a short chronological digest (period → ruling planet(s) → one-line verdict) covering the full past-through-future arc, so the astrologer can scan the whole life timeline before reading the detailed sections.`;

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
  const all = chartData.vimshottariDasha;
  const md = all.find((d: any) => d.status === 'current');
  const ad = md?.antardashas?.find((a: any) => a.status === 'current');
  const pd = ad?.pratyantardashas?.find((p: any) => p.status === 'current');
  const past = all.filter((d: any) => d.status === 'past');
  const upcoming = all.filter((d: any) => d.status === 'upcoming');
  const yoginiPast = chartData.yoginiDasha.filter((y: any) => y.status === 'past');
  const yoginiCurrent = chartData.yoginiDasha.find((y: any) => y.status === 'current');
  const yoginiUpcoming = chartData.yoginiDasha.filter((y: any) => y.status === 'upcoming');

  const lines: string[] = [];
  lines.push('FULL Vimshottari Mahadasha timeline (use this for past + present + future coverage — do not skip any entry):');
  if (past.length) lines.push(`Completed (past) Mahadashas, oldest to most recent:\n${past.map((d: any) => `- ${d.planet} (${d.period})`).join('\n')}`);
  if (md) {
    const adLines = (md.antardashas ?? []).map((a: any) => `  - Antardasha ${a.planet} (${a.period})${a.status === 'current' ? ' [CURRENT]' : a.status === 'past' ? ' [completed]' : ' [upcoming]'}`).join('\n');
    lines.push(`CURRENT Mahadasha: ${md.planet} (${md.period})${pd ? `\n  Active Pratyantardasha right now: ${pd.planet} (${pd.period})` : ''}\n  Antardasha sub-periods within this Mahadasha:\n${adLines || '  (not available)'}`);
  } else {
    lines.push('Current Mahadasha: not available');
  }
  if (upcoming.length) lines.push(`UPCOMING Mahadashas, in order:\n${upcoming.map((d: any) => `- ${d.planet} (${d.period})`).join('\n')}`);

  lines.push('\nYogini Dasha (cross-check layer):');
  if (yoginiPast.length) lines.push(`Past: ${yoginiPast.map((y: any) => `${y.yogini}/${y.lord} (${y.period})`).join(', ')}`);
  if (yoginiCurrent) lines.push(`Current: ${yoginiCurrent.yogini}/${yoginiCurrent.lord} (${yoginiCurrent.period})`);
  if (yoginiUpcoming.length) lines.push(`Upcoming: ${yoginiUpcoming.slice(0, 6).map((y: any) => `${y.yogini}/${y.lord} (${y.period})`).join(', ')}`);

  return lines.filter(Boolean).join('\n');
}

function fmtJaimini(chartData: JyotishChartData): string {
  const { charKarakas, karakamsha, charaDasha } = chartData.jaimini;
  const karakaLines = charKarakas.map((k) => `- ${k.karaka} (${k.abbr}): ${k.planet}`).join('\n');
  const pastChara = charaDasha.filter((c) => c.status === 'past');
  const currentChara = charaDasha.find((c) => c.status === 'current');
  const upcomingChara = charaDasha.filter((c) => c.status === 'upcoming');
  const charaLines = [
    pastChara.length ? `Past Chara Mahadashas: ${pastChara.map((c) => `${c.sign} (${c.years} yrs, ${c.startDate} to ${c.endDate})`).join(', ')}` : '',
    currentChara ? `Current Chara Mahadasha: ${currentChara.sign} (${currentChara.years} yrs, ${currentChara.startDate} to ${currentChara.endDate})` : 'Chara Dasha: not available',
    upcomingChara.length ? `Upcoming Chara Mahadashas: ${upcomingChara.map((c) => `${c.sign} (${c.years} yrs)`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  return `Char Karakas:\n${karakaLines}\n\nKarakamsha: ${karakamsha.karakamshaSign} (Atmakaraka ${karakamsha.atmakarakaPlanet})\nIshta Devata: ${karakamsha.ishtaDevata} (${karakamsha.derivation})\n\nJaimini Chara Dasha (full timeline for past+present+future cross-confirmation):\n${charaLines}`;
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
        return `You are a classical Parashari (BPHS) Vedic astrologer giving a working reading to a fellow professional astrologer who is in a live session with their client. Go house-by-house (1st through 12th): house significance, occupying/aspecting planets, house lord's placement and strength, and what this concretely means for the client's life — and for EACH house also walk it through the client's past, present, and future using the full dasha timeline supplied (which Mahadasha/Antardasha activated or will activate that house's affairs, when, and whether the result is favourable or unfavourable for that house's domain and why). Use standard Parashari tools: dignity/avastha, Ashtakavarga SAV, Bhava-Chalit shifts, Navamsa/Dasamsa for confirmation. Be direct and structured, but exhaustive — this is for the astrologer's own reference, not client-facing copy, so completeness matters more than brevity.`;
      case 'kn_rao':
        return `You are a Vedic astrologer working in the K.N. Rao tradition, briefing a fellow professional astrologer mid-session. Apply K.N. Rao's signature method: lead with a full past-through-future Vimshottari Mahadasha/Antardasha/Pratyantardasha walk-through (not just the present period), cross-confirm every major prediction — past, present, and future — against the Jaimini Chara Dasha AND the Yogini Dasha (triple confirmation — only commit to a prediction when at least two of the three dasha systems agree), and use the Char Karakas/Karakamsha/Ishta Devata for character and life-purpose reads. Be explicit when the three systems disagree and say which carries more weight here and why. For every dasha period discussed (past, current, and upcoming), state the favourable/unfavourable verdict per life area and the specific placement reasoning behind it. Structured, exhaustive, reference-style — do not stop at the current period, the astrologer needs the full timeline.`;
      case 'kamakhya':
        return `You are a Shakta-Tantric (Kamakhya) astrologer briefing a fellow professional astrologer mid-session. Frame the chart through the Mahavidya mapping already computed (primary Mahavidya via Atmakaraka, Lagna Mahavidya), the planets as embodiments of Devi's forms, and tantric remedial measures (specific mantra/yantra/sadhana per the governing Mahavidya) alongside the standard functional remedies. Walk the FULL dasha timeline — past Mahadashas (what that Devi-energy period delivered and why, favourable/unfavourable), the current Mahadasha/Antardasha (what is active now and its verdict per life area), and every upcoming Mahadasha (what to expect, when, and the verdict) — reading each period through which Devi-form/planet is ruling and why that produces the stated outcome. Explicitly flag that this Mahavidya mapping is ONE documented lineage-method, not universal scripture, and invite the astrologer to recalibrate against their own Kamakhya lineage if it differs. Structured, reference-style, exhaustive — not client-facing, and not abbreviated.`;
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
  maxTokens = 16000,
): Promise<string> {
  const client = getClient();
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    stream: true,
    temperature: 0.6,
    max_tokens: maxTokens,
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
  const user = `Give a full, detailed reading for this chart in the ${TRADITION_LABELS[tradition]} tradition. Cover the client's PAST (every completed Mahadasha/Antardasha given — what happened and why), PRESENT (current Mahadasha/Antardasha/Pratyantardasha — what's active and why), and FUTURE (every upcoming Mahadasha given — what to expect, when, and why), with an explicit favourable/unfavourable/mixed verdict for each life area in each period, and the specific chart placement causing each verdict. Do not summarize briefly — be exhaustive and structured.\n\n${chartSummaryForPrompt(profile, chartData)}`;
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
  const system = `${systemPromptFor(tradition, language)}\n\nThe astrologer is live on a call right now and needs a SHORT, direct answer (3-6 sentences) to the specific question below — not a full reading. Answer only what's asked, grounded in the chart data given, and still name the specific placement causing the answer.`;
  const user = `Chart:\n${chartSummaryForPrompt(profile, chartData)}\n\nClient's question right now: ${question}`;
  return streamChatCompletion(system, user, onToken, 700);
}

export function isJyotishAiAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
