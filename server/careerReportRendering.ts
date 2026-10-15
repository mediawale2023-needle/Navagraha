/**
 * Career report text: the prompt for one section, the checks on what the model returns, and the assembled
 * section. Facts come from careerReportEvidence.ts; the model writes explanations attached to them, a
 * synthesis and (Guidance) next steps. Its text may name only what the facts it explains already state.
 */
import { z } from 'zod';
import { GRAHAS, SIGN_NAMES } from '@shared/v3/canonical';
import { FIELDS } from './careerReport';
import { signDignity } from './astroEngine/dignity';
import { textProblems } from './reportQuality';
import { CAREER_HEADINGS, namesIn, type CareerFact, type CareerReportFacts, type CareerSectionFacts } from './careerReportEvidence';

export const SYNTHESIS = 'synthesis';
export const stepId = (i: number) => `step.${i + 1}`;
export interface SectionReply { explanations: Record<string, string>; synthesis?: string; steps: Array<{ factIds: string[]; text: string }> }
/** Accepted text per slot id: fact ids, `synthesis` and `step.N`. */
export type SectionText = Map<string, { text: string; factIds?: string[] }>;

export const countWords = (s: string) => (s.match(/[A-Za-z0-9'’-]+/g) ?? []).length;
const SENTENCES = /(?<=[.!?])\s+/;
const LENGTH = { explanation: [20, 90], synthesis: [80, 200], step: [12, 70] } as const;
export const MIN_STEPS = 3, MAX_STEPS = 5;

// ── Reply ────────────────────────────────────────────────────────────────────

const prose = z.union([z.string(), z.array(z.string()).transform((xs) => xs.join(' '))]);
const replySchema = z.object({
  explanations: z.union([
    z.record(z.string(), prose),
    z.array(z.object({ id: z.string().optional(), factId: z.string().optional(), text: prose.optional(), explanation: prose.optional() }))
      .transform((xs) => Object.fromEntries(xs.map((x) => [x.factId ?? x.id ?? '', x.text ?? x.explanation ?? '']))),
  ]).default({}),
  synthesis: prose.optional(),
  steps: z.array(z.union([
    z.object({ factIds: z.array(z.string()).default([]), text: prose }),
    z.string().transform((text) => ({ factIds: [] as string[], text })),
  ])).default([]),
});

/** Paths and codes only, never the model's text. */
export const schemaIssues = (error: z.ZodError) => error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(root)'} ${i.code}`).join(', ');

export function parseSectionReply(content: string | null | undefined): { reply?: SectionReply; problem?: string } {
  let raw: unknown;
  try { raw = JSON.parse(content ?? ''); } catch { return { problem: 'invalid-json' }; }
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return { problem: `malformed output (${schemaIssues(parsed.error)})` };
  return { reply: parsed.data as SectionReply };
}

// ── Checks ───────────────────────────────────────────────────────────────────

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
// A tendency may be stated; an outcome may not be promised. "will" is refused only before an outcome verb
// ("will bring", "will favour", "will come to the fore") and not when hedged ("will likely bring");
// "will need to", "will begin on" or "small steps will tell you more" pass.
const OUTCOME = 'bring|favou?r|see|experience|come|lead|open|result|thrive|flourish|prosper|excel|succeed|achieve|get|become|earn|receive|land|win|rise|grow|gain|attract|enjoy|face|shine|be (?:successful|promoted|recogni[sz]ed|rewarded|prosperous)';
const PROMISE = new RegExp(`\\bwill\\s+(?:(?:definitely|certainly|surely|soon)\\s+)?(?:${OUTCOME})\\b|\\b(?:shall|guarantee\\w*|ensures?|destined|is bound to|are bound to|certainly|definitely)\\b|\\b(?:brings?|promis\\w*|confers?|grants?)\\b[^.!?]{0,40}\\b(?:success|fame|wealth|prosperity|status)\\b|\\b(?:indicat\\w*|signal\\w*|mean\\w*)\\s+(?:a\\s+|an\\s+)?(?:favou?rable|strong|great|certain|assured)\\b[^.!?]{0,40}\\b(?:success|fame|wealth|prosperity|status)\\b`, 'i');
const REMEDY = /\b(gemstones?|sapphire|ruby|emerald|pearl|coral|wear (?:a|an) \w+|mantras?|pujas?|poojas?|rituals?|fasting)\b/i;
const INTERNAL = /\bwork_?style\b|\bfact ?ids?\b|\bJSON\b/i;
const DEGREE = /\d\s*°|\bdegrees?\b/i;
// Preference between ways of working (not between fields: "business" as a field is not an arrangement).
const FAVOUR = /\b(favou?rs?|better suited|best suited|recommend\w*|should (?:choose|pursue|aim for)|points? (?:clearly )?(?:to|towards)|more|better|best|mainly|primarily|chiefly|rather than|instead of)\b/i;
const EMPLOYED = /\b(employment|employed roles?|a job|salaried|working for an organi[sz]ation|organisational settings?|organizational settings?)\b/i;
const INDEPENDENT = /\b(self-employ\w*|self-directed|independent(?:,? \w+)? (?:work|settings?|roles?|ventures?|paths?|pursuits?|projects?|initiatives?)|working independently|working for yourself|your own (?:business|venture|firm|practice)|freelanc\w*)\b/i;
const STOCK = /\b(natural leader|inspire others|great candidate|shine in your career|unlock (?:your )?(?:full )?potential|sky is the limit|carefully crafted|dynamic and fulfilling)\b/i;
const STRONG_WORDS = '(?:strong|powerful|excellent|exceptional|well[- ]placed|dominant)';
const MIX = /\b(mix\w*|blend\w*|both|alongside|combin\w*|balanc\w*|as well as|hybrid|between|either)\b/i;
const RECOMMEND = /\b(recommend\w*|ideal|best|pursue|go for|well suited|strong choice|excellent choice|promising)\b/i;
const QUALIFIED = /\b(not|less|weak\w*|limited|unlikely|caution|avoid|only if|secondary)\b/i;

/** A planet placed in a house in prose must match the calculated house (the chart named in the claim, else D1). */
export function houseClaimProblems(text: string, evidence: CareerReportFacts, defaultChart: 'D1' | 'D10' = 'D1'): string[] {
  const problems: string[] = [];
  const planets = GRAHAS.join('|');
  const claim = new RegExp(`\\b(${planets})\\b(?:['’]s?)?((?:(?!\\b(?:${planets})\\b)[^.!?;]){0,60}?)\\b(?:the\\s+)?(?:D(?:1|10)(?:['’]s)?\\s+)?(?:(\\d{1,2})(?:st|nd|rd|th)|(${ORDINALS.join('|')}))\\s+house`, 'gi');
  for (const sentence of text.split(SENTENCES)) {
    for (const m of Array.from(sentence.matchAll(claim))) {
      if (!/\b(?:in|into|occup\w*|placed|placement|posited|position\w*|situated|located|sits?|resid\w*|holding)\b/i.test(m[2])) continue;
      if (/\b(?:rul\w*|lord\w*|own\w*|govern\w*|roles?|aspect\w*|influence\w*|over|from|points?|bindus?|score|tally)\b/i.test(m[2])) continue;
      const house = m[3] ? Number(m[3]) : ORDINALS.indexOf(m[4].toLowerCase()) + 1;
      const planet = GRAHAS.find((g) => g.toLowerCase() === m[1].toLowerCase())!;
      // A chart named earlier in the sentence counts only when no other planet comes first.
      const before = sentence.slice(0, m.index!);
      const span = (new RegExp(`\\b(?:${planets})\\b`, 'i').test(before) ? '' : before) + sentence.slice(m.index!, m.index! + m[0].length + 25);
      const charts = Array.from(new Set(Array.from(span.matchAll(/\bD(1|10)\b|\b(Dasamsa)\b/gi)).map((c) => (c[1] === '1' ? 'D1' : 'D10'))));
      const scope = charts.length ? charts : [defaultChart];
      const actual = (c: string) => (c === 'D1' ? evidence.chart.planets.find((p) => p.name === planet)?.house : evidence.chart.vargas.D10.placements.find((p) => p.planet === planet)?.house);
      if (!scope.some((c) => actual(c) === house)) problems.push(`${planet} is in house ${scope.map((c) => `${actual(c)} in ${c}`).join(' and ')}, not house ${house}`);
    }
  }
  return problems;
}

/**
 * Problems with one piece of model text, judged against the facts it explains. The vocabulary is closed:
 * any planet, sign, house number, year, month, yoga or degree must already be in those facts; the shared
 * guard then checks the text against the whole chart.
 */
export function slotProblems(text: string, kind: keyof typeof LENGTH, facts: CareerFact[], evidence: CareerReportFacts): string[] {
  const problems: string[] = [];
  const factText = facts.map((f) => f.text).join('\n');
  const allowed = namesIn(factText);
  const n = countWords(text);
  if (n < LENGTH[kind][0]) problems.push(`too short (${n} words; at least ${LENGTH[kind][0]})`);
  if (n > LENGTH[kind][1]) problems.push(`too long (${n} words; at most ${LENGTH[kind][1]})`);
  for (const g of GRAHAS) if (new RegExp(`\\b${g}\\b`).test(text) && !allowed.planets.includes(g)) problems.push(`names ${g}, which these facts do not mention`);
  for (const s of SIGN_NAMES) if (new RegExp(`\\b${s}\\b`).test(text) && !allowed.signs.includes(s)) problems.push(`names ${s}, which these facts do not mention`);
  for (const m of Array.from(text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/g))) if (!factText.includes(ord(Number(m[1])))) problems.push(`mentions the ${m[0]}, which these facts do not`);
  for (const m of Array.from(text.matchAll(new RegExp(`\\b(${ORDINALS.join('|')})\\s+house`, 'gi')))) if (!factText.includes(ord(ORDINALS.indexOf(m[1].toLowerCase()) + 1))) problems.push(`mentions the ${m[0]}, which these facts do not`);
  for (const y of text.match(/\b(?:19|20|21)\d{2}\b/g) ?? []) if (!factText.includes(y)) problems.push(`mentions ${y}, which these facts do not`);
  for (const m of Array.from(text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/g))) if (!factText.includes(m[0])) problems.push(`mentions ${m[0]}, which these facts do not`);
  for (const m of Array.from(text.matchAll(/\b((?:[A-Z][a-z]+[ -])*[A-Z][a-z]+) Yoga\b/g))) if (!factText.includes(m[0]) && !/^(This|The|That|A|Each|Any|No|Its|Your|Such)\b/.test(m[1])) problems.push(`names ${m[0]}, which these facts do not`);
  if (DEGREE.test(text)) problems.push('states degrees, which the facts do not');
  if (PROMISE.test(text)) problems.push('states an outcome as certain; describe it as a tendency (may, can, tends to)');
  if (REMEDY.test(text)) problems.push('suggests a remedy');
  if (INTERNAL.test(text)) problems.push('uses an internal term');
  if (STOCK.test(text)) problems.push(`uses a stock phrase ("${text.match(STOCK)![0]}"); say something specific to these facts`);
  // Restating the fact: the fact is printed just before, so "Jupiter in Capricorn in your 11th house" adds nothing.
  for (const m of Array.from(factText.matchAll(/\b(?:in )?(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces) in (?:your|the D10's|the) (\d+\w\w) house/g))) {
    if (new RegExp(`\\b${m[1]}\\b[^.!?]{0,15}\\b${m[2]}\\b`).test(text)) { problems.push(`restates the fact (${m[1]}, ${m[2]} house); explain what it means instead`); break; }
  }
  // Strength claims: a planet may be called strong only when its fact's chart gives it a strong dignity.
  const d10 = facts.every((f) => f.chart === 'D10');
  for (const g of GRAHAS) {
    const claim = new RegExp(`\\b(?:the\\s+)?${g}(?:['’]s)?\\s+(?:${STRONG_WORDS}\\s+(?:position|placement|influence|presence)|is\\s+(?:very\\s+|particularly\\s+)?${STRONG_WORDS})|\\b${STRONG_WORDS}\\s+(?:the\\s+)?${g}\\b`, 'i');
    if (!claim.test(text)) continue;
    const dignity = d10 ? signDignity(g, evidence.chart.vargas.D10.placements.find((p) => p.planet === g)!.signIndex) : evidence.chart.strength.dignities.find((d) => d.planet === g)?.dignity;
    if (!['Exalted', 'Moolatrikona', 'Own sign'].includes(dignity ?? '')) problems.push(`overstates ${g}'s strength (${(dignity ?? 'no special dignity').toLowerCase()} in the ${d10 ? 'D10' : 'birth chart'})`);
  }
  for (const s of text.split(SENTENCES)) {
    if (FAVOUR.test(s) && !MIX.test(s)) {
      const job = EMPLOYED.test(s), own = INDEPENDENT.test(s);
      if ((evidence.workStyle === 'employment' && own && !job) || (evidence.workStyle === 'independent' && job && !own) || (evidence.workStyle === 'mixed' && job !== own)) problems.push(`contradicts the work-style conclusion (${evidence.workStyleSentence})`);
    }
    for (const id of evidence.weakFields) if (FIELDS[id].words.test(s) && RECOMMEND.test(s) && !QUALIFIED.test(s)) problems.push(`recommends ${FIELDS[id].label.toLowerCase()}, which is weakly supported`);
  }
  problems.push(...houseClaimProblems(text, evidence, d10 ? 'D10' : 'D1'));
  // The guard reads an unnamed chart as D1; explanations of D10 facts are about the D10 unless they say otherwise.
  const scoped = d10 ? text.split(SENTENCES).map((x) => (/\bD1\b|\bD10\b|Dasamsa|birth chart|natal/i.test(x) ? x : `In the D10, ${x.charAt(0).toLowerCase()}${x.slice(1)}`)).join(' ') : text;
  problems.push(...textProblems(scoped, { chart: evidence.chart, factsText: factText, asOf: evidence.asOf }, 0));
  return Array.from(new Set(problems));
}

/**
 * Checks a reply for one section (or, in a correction, only the slots in `only`). Returns the accepted text by
 * slot and problems: a required slot's make the section fail; an optional slot's are recorded and it is dropped.
 */
export function checkSectionReply(section: CareerSectionFacts, reply: SectionReply, evidence: CareerReportFacts, only?: string[]) {
  const accepted: SectionText = new Map();
  const required = new Map<string, string[]>();
  const dropped = new Map<string, string[]>();
  const want = (id: string) => !only || only.includes(id);
  for (const fact of section.facts.filter((f) => f.explain && want(f.id))) {
    const text = reply.explanations[fact.id]?.trim();
    const problems = text ? slotProblems(text, 'explanation', [fact], evidence) : ['missing'];
    if (!problems.length) accepted.set(fact.id, { text: text! });
    else (fact.required ? required : dropped).set(fact.id, problems);
  }
  if (want(SYNTHESIS)) {
    const text = reply.synthesis?.trim();
    const problems = text ? slotProblems(text, 'synthesis', section.facts, evidence) : ['missing'];
    if (!problems.length) accepted.set(SYNTHESIS, { text: text! });
    else required.set(SYNTHESIS, problems);
  }
  if (section.steps && want('steps')) {
    const good: Array<{ text: string; factIds: string[] }> = [];
    reply.steps.slice(0, MAX_STEPS).forEach((step, i) => {
      const facts = step.factIds.map((id) => section.facts.find((f) => f.id === id));
      const problems = !facts.length ? ['cites no fact'] : facts.some((f) => !f) ? ['cites an id that is not in this section'] : slotProblems(step.text.trim(), 'step', facts as CareerFact[], evidence);
      if (problems.length) dropped.set(stepId(i), problems); else good.push({ text: step.text.trim(), factIds: step.factIds });
    });
    good.forEach((s, i) => accepted.set(stepId(i), s));
    const strongFields = section.facts.filter((f) => f.id.startsWith('field.') && /: well supported\./.test(f.text)).map((f) => f.id);
    const stepProblems = [
      good.length < MIN_STEPS && `${good.length} valid next steps; at least ${MIN_STEPS} required`,
      strongFields.length && !good.some((g) => g.factIds.some((id) => strongFields.includes(id))) && `no valid next step acts on a well-supported field (${strongFields.join(', ')})`,
    ].filter(Boolean) as string[];
    if (stepProblems.length) required.set('steps', [...stepProblems, ...Array.from(dropped).filter(([id]) => id.startsWith('step.')).map(([id, p]) => `${id}: ${p[0]}`)]);
  }
  return { accepted, required, dropped };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export function careerSectionPrompt(evidence: CareerReportFacts, section: CareerSectionFacts, correction?: Map<string, string[]>): string {
  const whole = !correction || correction.has(SYNTHESIS) || correction.has('steps');
  const explain = section.facts.filter((f) => f.explain && (!correction || correction.has(f.id)));
  // A correction of the synthesis or steps still needs every fact of the section for reference.
  const facts = whole ? section.facts : explain;
  const others = CAREER_HEADINGS.filter((h) => h !== section.heading).join('; ');
  const wantsSynthesis = !correction || correction.has(SYNTHESIS);
  const wantsSteps = section.steps && (!correction || correction.has('steps'));
  const shape = [
    `"explanations": {${explain.map((f) => `"${f.id}": "<text>"`).join(', ')}}`,
    wantsSynthesis && '"synthesis": "<text>"',
    wantsSteps && '"steps": [{"factIds": ["<id of a fact below>"], "text": "<one concrete action>"}]',
  ].filter(Boolean).join(', ');
  return `You are writing part of "${section.heading}", one section of a personalised Career & Profession Report. The application has already written every chart fact below and shows each one to the reader; your explanation is printed directly after it.
Write warm, plain, specific English addressed to "you", for a reader who knows no astrology. Explain what each fact means for this person's work: the kind of work, environment or approach it points to, and its limits. Be concrete and practical; avoid stock phrases.
Rules:
- The fact is printed just before your text: do not repeat its placement, explain what it means. Add no chart facts. Name a planet, sign, house number, yoga, month or year only if the fact you are explaining states it (for the synthesis and steps: only if a fact in this section states it). Never mention degrees.
- Describe tendencies, not certainties: use may, can, tends to. Never promise an outcome (success, promotion, wealth, status) and never write "will" about a result. No remedies, gemstones, mantras or rituals.
- Describe a planet's strength only as its fact does: a planet in a friendly or neutral sign is moderate, not strong.
- When you mention a house in a D10 fact, it is the D10's house; say "in your birth chart" if you mean the D1.
- Avoid stock phrases such as "natural leader", "inspire others", "shine", "great candidate" or "unlock your potential"; say what this chart specifically suggests.
- The report's conclusion on employment versus independent work is fixed: ${evidence.workStyleSentence}. Never contradict it.
${evidence.weakFields.length ? `- Never recommend these weakly supported fields: ${evidence.weakFields.map((id) => FIELDS[id].label.toLowerCase()).join('; ')}.\n` : ''}- ${section.purpose}
- The other sections (${others}) are written separately; do not repeat them.
Lengths: each explanation 1–3 sentences, 30–70 words${wantsSynthesis ? '; the synthesis 100–160 words, drawing the facts together into what they mean for you' : ''}${wantsSteps ? `; ${MIN_STEPS}–${MAX_STEPS} next steps, each one concrete action of 20–50 words citing the fact ids it rests on` : ''}.
Return JSON exactly in this shape: {${shape}}
FACTS
${JSON.stringify(facts.map((f) => ({ id: f.id, fact: f.text })))}${correction ? `\nCORRECTION\nYour previous text for these items was rejected; rewrite only them so none of the problems recurs:\n${JSON.stringify(Object.fromEntries(Array.from(correction).map(([id, p]) => [id, p.slice(0, 6).map((x) => x.slice(0, 160))])))}` : ''}`;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

export const CAREER_DEFINITIONS: Record<string, string> = {
  Lagna: 'the rising sign at birth, the starting point of the chart', D10: 'the Dasamsa, a divisional chart traditionally read for profession',
  Mahadasha: 'a major planetary period in the Vimshottari system', Antardasha: 'a sub-period within a Mahadasha',
  Sarvashtakavarga: 'a traditional tally of support for each house (about 28 points is average)', Moolatrikona: 'a sign where a planet is strong, close to its own sign',
  'Neecha Bhanga': 'the cancellation of a debilitation, which softens the weakness', combust: 'too close to the Sun, which traditionally weakens a planet',
  retrograde: 'apparently moving backwards as seen from Earth', debilitated: 'in the sign where a planet is traditionally weakest', exalted: 'in the sign where a planet is traditionally strongest',
};
const glossary = (text: string) => Object.entries(CAREER_DEFINITIONS).filter(([term]) => new RegExp(`\\b${term}\\b`, 'i').test(text)).map(([term, meaning]) => `${term}: ${meaning}.`).join('\n');

/** One section's text: each fact followed by its explanation, the synthesis, next steps and the terms used. */
export function renderCareerSection(section: CareerSectionFacts, text: SectionText): string {
  const paragraphs = section.facts.map((f) => (text.get(f.id) ? `${f.text} ${text.get(f.id)!.text}` : f.text));
  const steps = Array.from(text).filter(([id]) => id.startsWith('step.')).map(([, s], i) => `${i + 1}. ${s.text}`);
  const body = [...paragraphs, `What this means for you\n${text.get(SYNTHESIS)!.text}`, ...(steps.length ? [`Next steps\n${steps.join('\n')}`] : [])].join('\n\n');
  const terms = glossary(body);
  return terms ? `${body}\n\nTerms used in this section\n${terms}` : body;
}

/** Deterministic report summary: the work-style conclusion, the strongest fields and the running periods. */
export function careerSummary(evidence: CareerReportFacts): string {
  const fact = (id: string) => evidence.sections.flatMap((s) => s.facts).find((f) => f.id === id)?.text;
  const first = (id: string) => fact(id)?.split(/(?<=\.)\s/)[0];
  return [fact('overview.workStyle'), first('overview.fields'), first('current.mahadasha'), first('current.antardasha'),
    'Dates describe calculated periods, not promised events. The D10 reading depends on an accurate birth time, and your actual skills, experience and circumstances should guide every decision.'].filter(Boolean).join(' ');
}

/** PDF/UI tables from the canonical chart, never from legacy projections. */
export function careerMetadata({ chart, asOf }: CareerReportFacts, kundli: any) {
  const positions = chart.planets.map((p) => ({ planet: p.name, sign: p.sign, house: p.house, degree: p.degreeInSign, retrograde: p.retrograde }));
  const status = (p: { start: string; end: string }): 'past' | 'current' | 'upcoming' => Date.parse(p.start) > +asOf ? 'upcoming' : Date.parse(p.end) <= +asOf ? 'past' : 'current';
  return {
    birthDetails: { name: typeof kundli?.name === 'string' ? kundli.name : undefined, dateOfBirth: chart.birth.localDate, timeOfBirth: chart.birth.localTime, placeOfBirth: chart.birth.place, ascendant: chart.ascendant.sign, moonSign: chart.planets.find((p) => p.name === 'Moon')!.sign, sunSign: chart.planets.find((p) => p.name === 'Sun')!.sign, timeAccuracy: 'exact' as const },
    planetaryPositions: positions,
    chartData: { houses: chart.houses.map((h) => ({ house: h.house, sign: h.sign, planets: h.occupants })), planetaryPositions: positions.map((p) => ({ ...p, isRetrograde: p.retrograde })) },
    dashaTimeline: chart.dashas.vimshottari.mahadashas.map((p) => {
      const ad = p.antardashas.find((a) => status(a) === 'current');
      return { planet: p.lord, startDate: p.start.slice(0, 10), endDate: p.end.slice(0, 10), status: status(p), currentAntardasha: ad ? { planet: ad.lord, startDate: ad.start.slice(0, 10), endDate: ad.end.slice(0, 10) } : null };
    }),
  };
}
