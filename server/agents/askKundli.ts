/**
 * Ask Your Kundli — evidence-grounded answers.
 *
 *   question → router (domains, intent, depth) → CanonicalChart → evidence +
 *   resolution + timeline → structured packet → ONE explanation model call
 *   (simple) or the specialist council (deep) → deterministic consistency
 *   check against the chart → answer.
 *
 * The model only explains the packet. It is told the chart facts are
 * authoritative and checked afterwards: an answer that places a planet in the
 * wrong sign or house is regenerated once and otherwise replaced by a
 * deterministic answer built from the evidence. Without an OpenAI key the
 * deterministic answer is returned directly.
 */
import OpenAI from 'openai';
import { GRAHAS, SIGN_NAMES, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { DOMAIN_LABELS, LIFE_DOMAINS, type DomainResolution, type LifeDomain, type TimelinePeriod } from '@shared/v3/evidence';
import { domainResolution, INTERPRETIVE_NOTE } from '../astroEngine/evidence/insights.js';
import { buildTimeline } from '../astroEngine/evidence/timeline.js';
import { runningPeriod, dashaTimingStable } from '../astroEngine/evidence/engine.js';
import { validateAnswer, type GuardContext } from './answerGuard.js';

// ─── Question router (deterministic) ─────────────────────────────────────────

export type Intent = 'verdict' | 'timing' | 'planet' | 'overview';
export type Depth = 'simple' | 'deep';
export interface Route { domains: LifeDomain[]; intent: Intent; planets: Graha[]; depth: Depth }

const DOMAIN_KEYWORDS: Record<LifeDomain, RegExp> = {
  career: /\b(career|job|work|profession|promotion|business|naukri|office|employ|boss|startup|occupation|vyapar|kaam)\b/i,
  wealth: /\b(money|wealth|financ|income|rich|savings?|invest|paisa|dhan|salary|debt|loan|profit|earn)/i,
  relationships: /\b(marriage|married|marry|spouse|wife|husband|partner|relationship|love|shaadi|vivah|divorce|romance|girlfriend|boyfriend)\b/i,
  leadership: /\b(politic|leader|leadership|authority|power|government|minister|election|fame|status|manage)/i,
  property: /\b(property|house|home|land|flat|real estate|apartment|ghar|vehicle|car)\b/i,
  foreign: /\b(abroad|foreign|overseas|settle|immigra|visa|travel|relocat|videsh|usa|canada|uk|australia|europe)\b/i,
  education: /\b(study|studies|education|exam|degree|college|university|school|learning|padhai|phd|masters)\b/i,
  children: /\b(child|children|kids?|son|daughter|baby|santan|bachche)\b/i,
  spirituality: /\b(spiritual|meditation|moksha|dharma|god|religio|sadhana|karma|purpose|soul)\b/i,
};
const TIMING = /\b(when|which (period|year|time)|what (period|year|time)|how long|kab|timing|best time|good time|next (year|few years)|dasha)\b/i;
const DEEP = /\b(detailed|in[- ]depth|deep|complete|full (reading|analysis)|everything|comprehensive|elaborate)\b/i;

export function routeQuestion(question: string, opts: { depth?: Depth } = {}): Route {
  const domains = LIFE_DOMAINS.filter((d) => DOMAIN_KEYWORDS[d].test(question));
  const planets = GRAHAS.filter((g) => new RegExp(`\\b${g}\\b|\\b${g === 'Saturn' ? 'shani' : g === 'Jupiter' ? 'guru|brihaspati' : g === 'Mars' ? 'mangal' : g === 'Venus' ? 'shukra' : g === 'Mercury' ? 'budh' : g === 'Moon' ? 'chandra' : g === 'Sun' ? 'surya' : g.toLowerCase()}\\b`, 'i').test(question));
  const intent: Intent = TIMING.test(question) ? 'timing' : planets.length && !domains.length ? 'planet' : domains.length ? 'verdict' : 'overview';
  const depth: Depth = opts.depth ?? (DEEP.test(question) || domains.length >= 3 || question.length > 400 ? 'deep' : 'simple');
  return { domains, intent, planets, depth };
}

// ─── Evidence packet ─────────────────────────────────────────────────────────

const ORD = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export interface EvidencePacket {
  route: Route;
  text: string;
  resolutions: DomainResolution[];
  timeline: TimelinePeriod[];
  chart: CanonicalChart;
  guard: GuardContext;
}

function resolutionBlock(r: DomainResolution): string {
  const line = (e: DomainResolution['supporting'][number]) => `    - [${e.source}, ${e.strength}, ${e.provenance}] ${e.factor}: ${e.explanation}`;
  return [
    `  ${r.label}: verdict ${r.verdict.toUpperCase()}, confidence ${r.confidence}`,
    `   Supporting (${r.supporting.length}):`, ...r.supporting.slice(0, 6).map(line),
    `   Conflicting (${r.conflicting.length}):`, ...(r.conflicting.length ? r.conflicting.slice(0, 4).map(line) : ['    - none']),
    r.excluded.length ? `   Not used (birth time approximate): ${r.excluded.length} house-based indicators` : '',
    `   Conclusion: ${r.conclusion}`,
  ].filter(Boolean).join('\n');
}

export function buildEvidencePacket(chart: CanonicalChart, route: Route, asOf = new Date(), transits?: string): EvidencePacket {
  const domains = route.domains.length ? route.domains : (['career', 'wealth', 'relationships'] as LifeDomain[]);
  const resolutions = domains.map((d) => domainResolution(chart, d, asOf));
  const timeline = buildTimeline(chart, asOf);
  const rp = runningPeriod(chart, asOf);
  const approx = chart.birth.timeAccuracy === 'approximate';
  const stable = dashaTimingStable(chart, asOf);
  const planetLine = (g: Graha) => {
    const p = chart.planets.find((x) => x.name === g)!;
    const d = chart.strength.dignities.find((x) => x.planet === g);
    if (g === 'Moon' && approx && !chart.uncertainty.moonSignStableAcrossBirthDate) return '  - Moon: sign and nakshatra UNCERTAIN (the Moon changes sign during the birth date). Do not state them.';
    const nak = g === 'Moon' && approx && !chart.uncertainty.moonNakshatraStableAcrossBirthDate ? 'nakshatra UNCERTAIN (do not state it)' : `${p.nakshatra.name} pada ${p.nakshatra.pada}`;
    return `  - ${g}: ${p.sign} ${g === 'Moon' && approx ? '' : `${p.degreeInSign.toFixed(1)}°`}${approx ? '' : `, ${ORD(p.house)} house`}, ${nak}${p.retrograde && g !== 'Rahu' && g !== 'Ketu' ? ', retrograde' : ''}${d ? `, ${d.dignity}${d.combust ? ', combust' : ''}` : ''}`;
  };
  // With an approximate time the period boundaries move, so no dates are supplied (and none may be stated).
  const relevantPeriods = timeline
    .filter((p) => p.status !== 'past' && (route.intent === 'timing' || p.status === 'current'))
    .slice(0, route.intent === 'timing' ? 4 : 1)
    .filter((p) => !approx || (p.status === 'current' && stable.mahadasha))
    .map((p) => `  - ${p.lord} Mahadasha ${approx ? '(dates uncertain: birth time approximate)' : `${p.start.slice(0, 10)} → ${p.end.slice(0, 10)}`} (${p.status}): engages ${p.domains.map((d) => DOMAIN_LABELS[d.domain]).join(', ') || 'no main life area directly'}; ${p.supporting.concat(p.conflicting).join('; ') || 'neutral placement'}; confidence ${p.confidence}`);
  const runningLine = !rp ? ''
    : !stable.mahadasha ? '  Running period today: UNCERTAIN because the birth time is approximate. Do not name a current Mahadasha or Antardasha and give no dates.'
      : `  Running period today (${asOf.toISOString().slice(0, 10)}): ${rp.mahadasha} Mahadasha${rp.antardasha && stable.antardasha ? ` / ${rp.antardasha} Antardasha` : rp.antardasha ? ' (the Antardasha is UNCERTAIN with an approximate birth time; do not name it)' : ''}.`;

  const text = [
    'AUTHORITATIVE CHART FACTS (calculated by the Navagraha engine; never recalculate, contradict or extend them):',
    `  Calculation: ${chart.meta.ephemeris}, ${chart.meta.ayanamsa} ayanamsa, ${chart.meta.houseSystem} houses.`,
    `  Birth: ${chart.birth.localDate} ${chart.birth.localTime} (${chart.birth.timezone}, UTC${chart.birth.utcOffset}), ${chart.birth.place || 'place on record'}; birth time ${chart.birth.timeAccuracy}.`,
    approx ? '  The birth time is APPROXIMATE: the Lagna and houses are unknown. Do not mention the Ascendant or house numbers.' : `  Lagna: ${chart.ascendant.sign} ${chart.ascendant.degreeInSign.toFixed(1)}°.`,
    '  Planets:', ...GRAHAS.map(planetLine),
    runningLine,
    '',
    'DETERMINISTIC EVIDENCE AND VERDICTS (from the evidence and resolution engines):',
    ...resolutions.map(resolutionBlock),
    '',
    'DASHA TIMING (from the Vimshottari calculation):',
    ...(relevantPeriods.length ? relevantPeriods : [approx ? '  - (period dates are not given: the birth time is approximate)' : '  - (no upcoming periods)']),
    transits ? `\nCURRENT TRANSITS:\n${transits}` : '',
    route.planets.length ? `\nQUESTION FOCUSES ON: ${route.planets.join(', ')}` : '',
    ...(chart.uncertainty.notes.length ? ['', 'UNCERTAINTY:', ...chart.uncertainty.notes.map((n) => `  - ${n}`)] : []),
  ].filter((l) => l !== '').join('\n');
  const guard: GuardContext = {
    chart, packetText: text, asOf, transits,
    running: rp ? { mahadasha: rp.mahadasha, antardasha: rp.antardasha } : null,
    timing: { mahadashaReliable: stable.mahadasha, antardashaReliable: stable.antardasha },
  };
  return { route, text, resolutions, timeline, chart, guard };
}

// ─── Consistency check: answer vs chart ──────────────────────────────────────

/** Claims in the answer that contradict, or are not supported by, the chart (see answerGuard.ts). */
export function findChartContradictions(answer: string, chart: CanonicalChart, asOf = new Date()): string[] {
  const rp = runningPeriod(chart, asOf);
  const stable = dashaTimingStable(chart, asOf);
  return validateAnswer(answer, {
    chart, packetText: '', asOf,
    running: rp ? { mahadasha: rp.mahadasha, antardasha: rp.antardasha } : null,
    timing: { mahadashaReliable: stable.mahadasha, antardashaReliable: stable.antardasha },
  });
}

// ─── Deterministic answer (no LLM) ───────────────────────────────────────────

export function deterministicAnswer(packet: EvidencePacket): string {
  const parts: string[] = [];
  for (const r of packet.resolutions) {
    parts.push(`**${r.label}: ${r.verdict}** (confidence: ${r.confidence})`);
    if (r.supporting.length) parts.push(`Supporting:\n${r.supporting.slice(0, 4).map((e) => `- ${e.explanation}`).join('\n')}`);
    if (r.conflicting.length) parts.push(`Counter-evidence:\n${r.conflicting.slice(0, 3).map((e) => `- ${e.explanation}`).join('\n')}`);
  }
  const current = packet.timeline.find((p) => p.status === 'current');
  if (!packet.guard.timing.mahadashaReliable) parts.push('**Timing:** the birth time is approximate, so the current dasha period cannot be stated reliably.');
  else if (current) parts.push(`**Timing:** ${current.whyItMatters}`);
  parts.push(`_${INTERPRETIVE_NOTE}_`);
  return parts.join('\n\n');
}

// ─── Explanation model (simple path) ─────────────────────────────────────────

export const EXPLAINER_RULES = `You are Navagraha's Jyotish explainer. You EXPLAIN a chart that has already been calculated; you never calculate.
Rules:
- Use ONLY the chart facts, evidence and verdicts supplied. Never state a planet's sign, house, degree, nakshatra, dignity, yoga or dosha that is not in the supplied facts. Never invent a yoga, dosha, period or date.
- Keep the engine's verdict and confidence. You may explain them; you may not upgrade or downgrade them.
- Mention counter-evidence honestly. If confidence is Low or the birth time is approximate, say so plainly.
- Do not cite chapter/verse numbers or quote scriptures. Describe principles in plain words.
- Jyotish is a traditional interpretive system: describe tendencies and timing, never certainties. Never predict death, lifespan, serious illness, guaranteed pregnancy, guaranteed marriage or divorce, guaranteed financial outcomes or unavoidable disasters. No medical, legal or financial advice. Never use fear to recommend remedies.
- For a direct question, structure the answer as: VERDICT, WHY, SUPPORTING EVIDENCE, COUNTER-EVIDENCE, TIMING, CONFIDENCE (short sections). For a conversational message, answer naturally and briefly, still grounded in the facts.
- Address the person as "you". Be warm, specific and concise (under 350 words unless asked for more).`;

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export interface AskOptions {
  language?: string | null;
  memories?: string[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

async function callExplainer(packet: EvidencePacket, question: string, opts: AskOptions, correction?: string[]): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;
  const memory = opts.memories?.length ? `\nWhat we know about this person from earlier conversations (personalise; do not recite):\n${opts.memories.map((m) => `- ${m}`).join('\n')}` : '';
  const fix = correction?.length ? `\nYour previous draft contradicted the chart: ${correction.join('; ')}. Use only the supplied facts.` : '';
  const resp = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 900,
    messages: [
      // Always English: the guard reads English. Other languages are translated after checking (localise.ts).
      { role: 'system', content: EXPLAINER_RULES },
      ...(opts.history ?? []).slice(-6),
      { role: 'user', content: `${packet.text}${memory}${fix}\n\nQUESTION: ${question}` },
    ],
  });
  return resp.choices[0]?.message?.content?.trim() || null;
}

/**
 * Ensure an LLM answer agrees with the chart: retry once with the corrections,
 * otherwise fall back to the deterministic answer.
 */
export async function guardAnswer(packet: EvidencePacket, draft: string | null, regenerate: (corrections: string[]) => Promise<string | null>): Promise<{ text: string; source: 'llm' | 'deterministic'; corrected: boolean }> {
  if (!draft) return { text: deterministicAnswer(packet), source: 'deterministic', corrected: false };
  const issues = validateAnswer(draft, packet.guard);
  if (!issues.length) return { text: draft, source: 'llm', corrected: false };
  const second = await regenerate(issues);
  if (second && !validateAnswer(second, packet.guard).length) return { text: second, source: 'llm', corrected: true };
  return { text: deterministicAnswer(packet), source: 'deterministic', corrected: true };
}

export async function answerSimple(packet: EvidencePacket, question: string, opts: AskOptions = {}) {
  let draft: string | null = null;
  try {
    draft = await callExplainer(packet, question, opts);
  } catch (err) {
    console.error('[askKundli] explainer failed:', err);
  }
  return guardAnswer(packet, draft, (c) => callExplainer(packet, question, opts, c).catch(() => null));
}

export function packetSummary(packet: EvidencePacket) {
  return {
    route: packet.route,
    domains: packet.resolutions.map((r) => ({ domain: r.domain, label: r.label, verdict: r.verdict, confidence: r.confidence, supporting: r.supporting.length, conflicting: r.conflicting.length })),
    timeAccuracy: packet.chart.birth.timeAccuracy,
    disclosure: packet.chart.birth.timeAccuracy === 'approximate'
      ? `Birth time is approximate: the Lagna and houses were not used${packet.guard.timing.mahadashaReliable ? ' and dasha dates may shift' : ', and the current dasha period could not be determined'}.`
      : null,
  };
}

// ─── No chart available ──────────────────────────────────────────────────────

/** A chosen chart exists but has no verified V3 calculation: say why instead of answering from unverified data. */
export function limitedChartReply(reason?: string): string {
  return `I can't read this chart reliably yet. ${reason ?? 'It predates the V3 calculation engine.'} Once the chart is recreated with its birth place, I can explain what it shows and why.`;
}

export const NO_CHART_REPLY = 'I can answer from your chart once I have your birth details. Choose a saved chart or enter your date, time and place of birth, and I will explain what your chart shows and why.';

/** General Jyotish questions without a chart: no personal chart claims are allowed. */
export async function answerWithoutChart(question: string, opts: AskOptions = {}): Promise<{ text: string; source: 'llm' | 'deterministic' }> {
  const ai = getClient();
  if (!ai) return { text: NO_CHART_REPLY, source: 'deterministic' };
  try {
    const resp = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        { role: 'system', content: `You are Navagraha's Jyotish guide. No birth chart is available for this person. Answer general questions about Jyotish concepts in plain words. Never make claims about this person's chart, planets, dashas or future; if they ask a personal question, explain that you need their birth details and say what you would look at. ${EXPLAINER_RULES.split('\n').slice(4, 6).join(' ')}${opts.language && opts.language.toLowerCase() !== 'english' ? ` Reply in ${opts.language}.` : ''}` },
        ...(opts.history ?? []).slice(-6),
        { role: 'user', content: question },
      ],
    });
    return { text: resp.choices[0]?.message?.content?.trim() || NO_CHART_REPLY, source: 'llm' };
  } catch (err) {
    console.error('[askKundli] general answer failed:', err);
    return { text: NO_CHART_REPLY, source: 'deterministic' };
  }
}
