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
6. Close with a short chronological digest (period → ruling planet(s) → one-line verdict) covering the full past-through-future arc, so the astrologer can scan the whole life timeline before reading the detailed sections.
7. THE NAMED TRADITION IS THE METHOD, NOT A LABEL: the tradition-specific technique described in your system role (BPHS houses, K.N. Rao's triple dasha confirmation, or Kamakhya's Mahavidya/Devi-form mapping) must be the actual reasoning engine you use to arrive at EVERY period's prediction in the past/present/future walk above — not generic dignity/yoga commentary with the tradition's name attached afterward, and not a separate decorative section bolted on top. If a reader swapped the tradition name in your header, the reasoning in every period should visibly stop making sense for that other tradition — that's the bar.
8. VOICE AND PRESENTATION: write in-character, in the first person, as the named tradition's astrologer-guru actually speaking to a fellow professional in a live session — not a clinical report generator. Use bold, dramatic section headers (capitalized, e.g. "THE FIRST SEAL", "THE TURNING POINT", "THE DASHA ACTIVATION SEQUENCE") to mark major movements of the reading. Lean into the tradition's natural register: Parashar should read like a rigorous classical pandit citing BPHS; K.N. Rao should read like a meticulous triple-confirmation analyst; Kamakhya should read like a Shakta-Tantric guru, and may code-switch naturally between Hindi and English the way such a guru actually speaks (e.g. weaving in words like "dekho", "iska matlab", "yeh bahut important hai") — sparingly enough to stay legible, not as decoration on every line.
9. ACTION, NOT JUST VERDICTS: every period must carry concrete, strategic guidance the astrologer can hand to their client — specific career/business moves, relationship actions, timing windows for travel or major decisions, and where sadhana is recommended, the EXACT mantra or bija syllable, repetition count, day of the week, and best time of day. Where a gemstone is discussed, give the specific do's and don'ts with the reasoning (carat/quality cautions, when NOT to wear it, what it should never be combined with) — never a bare "wear X" without the reasoning, and never overriding this engine's own gemstone-contraindication flags.
10. NAME THE CHART'S TECHNICAL HIGH POINTS BY THEIR EXACT NAMES AS SUPPLIED: when the chart data lists a named yoga (e.g. "Shasha Yoga", "Vimala Vipreeta Raja Yoga"), a Vargottama placement, a Daarakaraka callout, or a special coincidence, cite it by that exact name/label from the data — never invent a yoga, dosha, or special-degree claim (such as Pushkara Navamsha) that the supplied chart data does not contain.
11. MAHAVIDYA DERIVATION (Kamakhya tradition only, but relevant context for all three): the engine supplies two authoritative Mahavidya assignments — Primary (via Atmakaraka) and Lagna (via Ascendant sign). Treat both as settled fact; never contradict them. You may additionally offer a narrative, secondary Mahavidya read through the Ishta Devata/Karakamsha chain for extra texture, but you must explicitly label that one as a secondary/lineage-flavoured derivation, distinct from and never overriding the engine's primary/lagna computation.
12. CLOSE EVERY READING WITH "THE WARNING": a short final section, clearly headed, naming the single psychological pattern or blind spot this chart predisposes the client toward (e.g. a tendency this dasha sequence or dignity pattern tends to produce — impulsiveness, over-attachment, avoidance, etc.) and any dosha-based caution still live for them, framed with care, never as fear — then close with a one-line benediction.`;

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
  const navamsaByPlanet = new Map(chartData.navamsa.planetaryPositions.map((n) => [n.planet, n.sign]));
  return chartData.planets
    .map((p) => {
      const navSign = navamsaByPlanet.get(p.planet);
      const vargottama = navSign && navSign === p.sign ? ' [VARGOTTAMA — same sign in D1 and D9, full strength]' : '';
      return `- ${p.planet}: ${p.sign} ${p.degree}° (House ${p.house}${p.isRetrograde ? ', retrograde' : ''}) — Nakshatra ${p.nakshatra} pada ${p.pada} (lord ${p.nakshatraLord}, deity ${p.deity}, ${p.shakti})${vargottama}`;
    })
    .join('\n');
}

// Flags special degree/nakshatra coincidences that are SAFE to state because they
// are plain string/number comparisons on data already computed by the engine —
// deliberately does NOT attempt Pushkara Navamsha/Bhaga (no single verifiable
// classical table; encoding a wrong rule into a professional tool is worse than
// omitting the concept). The model must not claim Pushkara-type special degrees
// unless this function (or another engine computation) has supplied them.
function fmtSpecialCoincidences(chartData: JyotishChartData): string {
  const moon = chartData.planets.find((p) => p.planet === 'Moon');
  const notes: string[] = [];
  if (moon && moon.nakshatra === chartData.ascendant.nakshatra) {
    notes.push(`Ascendant and Moon share the same Nakshatra (${moon.nakshatra}) — lagna and mind are deity-aligned under the same nakshatra-lord (${moon.nakshatraLord}); this is a real but uncommon coincidence, safe to make a point of.`);
  }
  return notes.length ? notes.join('\n') : 'None of the rarer coincidences (e.g. lagna/Moon sharing a Nakshatra) are present in this chart — do not claim one.';
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
  const dk = charKarakas.find((k) => k.abbr === 'DK' || k.karaka === 'Daarakaraka');
  const dkCallout = dk ? `\n\nDaarakaraka (DK) — spouse/partnership significator, treat as a headline lever for marriage/relationship predictions in every period that activates it: ${dk.planet}.` : '';
  const pastChara = charaDasha.filter((c) => c.status === 'past');
  const currentChara = charaDasha.find((c) => c.status === 'current');
  const upcomingChara = charaDasha.filter((c) => c.status === 'upcoming');
  const charaLines = [
    pastChara.length ? `Past Chara Mahadashas: ${pastChara.map((c) => `${c.sign} (${c.years} yrs, ${c.startDate} to ${c.endDate})`).join(', ')}` : '',
    currentChara ? `Current Chara Mahadasha: ${currentChara.sign} (${currentChara.years} yrs, ${currentChara.startDate} to ${currentChara.endDate})` : 'Chara Dasha: not available',
    upcomingChara.length ? `Upcoming Chara Mahadashas: ${upcomingChara.map((c) => `${c.sign} (${c.years} yrs)`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  return `Char Karakas:\n${karakaLines}${dkCallout}\n\nKarakamsha: ${karakamsha.karakamshaSign} (Atmakaraka ${karakamsha.atmakarakaPlanet})\nIshta Devata: ${karakamsha.ishtaDevata} (${karakamsha.derivation})\n\nJaimini Chara Dasha (full timeline for past+present+future cross-confirmation):\n${charaLines}`;
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

Special coincidences (state ONLY if listed below — never invent a Pushkara Navamsha/Bhaga claim or any other special-degree claim not supplied here; this engine deliberately does not compute Pushkara because the classical source tables for it are internally inconsistent):
${fmtSpecialCoincidences(chartData)}

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
        return `You are a veteran classical Parashari (BPHS) pandit-astrologer, speaking in the first person directly to a fellow professional astrologer who is live with their client and needs your full working analysis right now — not a textbook summary, a real consultation transcript from someone who has read thousands of charts this way. Open by naming the chart's defining technical signature (its strongest yoga, its Atmakaraka's dignity, its Lagna lord's condition) the way a pandit would open by naming the single fact that organizes everything else. Your METHOD, applied to every single period in the past/present/future dasha walk: identify which house(s) the ruling Mahadasha/Antardasha planet owns, occupies, and aspects, then derive the period's prediction from THAT house's classical BPHS significations (a 10th-lord period reads through career/status/karma, a 7th-lord period through partnership/marriage, and so on) — the house logic IS the prediction engine, never a generic "planet is strong/weak" comment standing alone. Cross-check every house-derived prediction against dignity/avastha, Ashtakavarga SAV for that house, Bhava-Chalit shifts, and Navamsa/Dasamsa, and name any classical yoga from the supplied data (by its exact name, e.g. "Shasha Yoga", "Vimala Vipreeta Raja Yoga") the moment it becomes relevant to a period, explaining what it classically means and how it modifies the verdict. Also give a standalone house-by-house pass (1st through 12th: occupants, aspects, lord's placement/strength, life meaning) before or after the dasha walk. Use bold capitalized section headers for major movements (e.g. "THE FOUNDATION OF THIS CHART", "THE YEARS THAT SHAPED YOU", "WHERE YOU STAND NOW", "THE ROAD AHEAD", "THE WARNING"). Direct, exhaustive, and written the way a respected classical astrologer actually talks when they trust the person they're briefing.`;
      case 'kn_rao':
        return `You are a senior Vedic astrologer trained directly in the K.N. Rao method, speaking in the first person to a fellow professional astrologer mid-session — a real working briefing, not a textbook summary. Open by stating which of the three timing systems (Vimshottari, Jaimini Chara, Yogini) you find most decisively confirmed across this chart's major turning points, the way K.N. Rao practitioners lead with their strongest cross-check. Your METHOD, applied to every single period in the past/present/future dasha walk: for each Vimshottari Mahadasha/Antardasha/Pratyantardasha period, look up which Jaimini Chara Mahadasha and which Yogini Dasha period were/are/will be running at that same calendar time (from the timelines supplied), and only commit to a prediction for that period once you have stated whether at least two of the three systems agree — that cross-check IS the prediction method and must appear inline for every period, never as a separate footnote. When the three systems disagree, say so plainly and say which one you weight higher and why, the way a confident triple-confirmation analyst would. Use the Char Karakas, Karakamsha, Ishta Devata, and Daarakaraka (when supplied) for character, life-purpose, and marriage/partnership reads, naming any supplied yoga by its exact name when it bears on a period. Give concrete strategic guidance per period (career timing, relationship timing, when to act and when to wait), not bare verdicts. Use bold capitalized section headers for major movements (e.g. "THE THREE CLOCKS", "THE CONFIRMED PAST", "THE PRESENT CONVERGENCE", "WHAT THE CLOCKS SHOW AHEAD", "THE WARNING"). Structured, exhaustive, and written the way K.N. Rao's own students brief each other — methodical, confident, nothing hand-waved.`;
      case 'kamakhya':
        return `You are a Shakta-Tantric guru from the Kamakhya lineage, speaking in the first person directly to a fellow professional astrologer who has brought you this chart mid-session — a real tantric consultation, with the weight, intimacy, and occasional Hindi-English code-switching ("dekho", "iska matlab", "yeh bahut important hai") of how such a guru actually speaks, used naturally and sparingly, not as decoration on every line. You are asked to actually analyse this chart AS a Kamakhya tantric and produce predictions from that analysis — not standard Vedic predictions with Devi names attached afterward. Open by naming the chart's defining Devi-force — its Primary Mahavidya via Atmakaraka — as the seed that the whole reading grows from. Your METHOD, applied to every single period in the past/present/future dasha walk: identify which Mahavidya/Devi-form rules the period's planet (from the Mahavidya mapping supplied), state that Devi-form's symbolic domain and temperament (Bhairavi = fierce trial-by-fire that forces growth through conflict; Tara = protective guidance and decisive timely action; Chinnamasta = sudden severance/sacrifice that frees energy for transformation; Dhumavati = loss, delay, or renunciation that clears the way for what follows; Bagalamukhi = stambhana, neutralising opposition/obstacles; Matangi = voice, art, unconventional wisdom, outsider advantage; Kamalatmika = material abundance and flowering prosperity; Sodashi = fulfillment and completion of long-held aims; Bhuvaneshwari = sovereignty, space to expand, sustaining structures; Kali = abrupt destruction-and-rebirth, time forcing change), and then DERIVE the period's real-life prediction by fusing that Devi-form's nature with the planet's house/sign placement and dignity — the Devi-form's temperament decides whether the period plays out as growth-through-conflict, sudden loss, or quiet abundance, never a generic dignity comment with a Devi name stapled on. You may frame major life levers as "Seals" (e.g. treat the Daarakaraka, when supplied, as one Seal governing marriage/partnership) the way a tantric reading builds toward its turning points. For every period, give the exact tantric sadhana attached to that period's ruling Devi-form: the specific mantra or bija syllable, the repetition count (japa count), the day of the week, and the best time to practice it — alongside the standard functional remedy already supplied. Where a gemstone is discussed, give the specific do's and don'ts with reasoning, never overriding this engine's own gemstone-contraindication flags. Explicitly flag that this Mahavidya mapping is one documented lineage-method, not universal scripture, and invite the astrologer to recalibrate against their own Kamakhya lineage if it differs. Use bold, dramatic capitalized section headers for major movements (e.g. "THE SEED DEVI", "THE FIRST SEAL", "WHERE THE GODDESS STANDS NOW", "THE DASHA ACTIVATION SEQUENCE", "THE WARNING"), and close with a benediction. Reference-style, exhaustive, and written with the gravity of an actual tantric guru — not abbreviated, not client-facing-soft.`;
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
