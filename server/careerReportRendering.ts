/**
 * Career report text: the prompt for one part, the checks on what the model returns, and the assembled sections.
 * The plan and evidence come from careerReportEvidence.ts; the model writes one paragraph per slot and cites the
 * ledger items it rests on. A paragraph may name only what its cited items state (with the items a cited
 * conclusion was built from), and a paragraph that combines or compares must cite each thing it combines.
 */
import { z } from 'zod';
import { GRAHAS, SIGN_NAMES } from '@shared/v3/canonical';
import { FIELDS, type FieldId } from './careerReport';
import { signDignity } from './astroEngine/dignity';
import { textProblems } from './reportQuality';
import { CAREER_RULES } from './careerLedger';
import { CAREER_SYNTHESIS_RULES } from './careerSynthesis';
import { FIELD_JOB, PERIOD_JOB, factsOf, type CareerFact, type CareerHeading, type CareerReportFacts, type CareerSectionFacts, type CareerSlot } from './careerReportEvidence';

export const stepId = (i: number) => `step.${i + 1}`;
export interface Cited { text: string; cites: string[] }
export interface SectionReply { slots: Record<string, Cited>; steps: Cited[] }
/** Accepted text per slot id (slot ids and `step.N`). */
export type SectionText = Map<string, Cited>;

export const countWords = (s: string) => (s.match(/[A-Za-z0-9'’-]+/g) ?? []).length;
const SENTENCES = /(?<=[.!?])\s+/;
const LENGTH = { explanation: [20, 90], synthesis: [80, 200], paragraph: [35, 130], step: [12, 70] } as const;
export const MIN_STEPS = 3, MAX_STEPS = 5;

// ── Reply ────────────────────────────────────────────────────────────────────

const prose = z.union([z.string(), z.array(z.string()).transform((xs) => xs.join(' '))]);
const ids = z.union([z.array(z.string()), z.string().transform((x) => x.split(/[,\s]+/).filter(Boolean))]).default([]);
const cited = z.union([
  z.object({ text: prose, cites: ids.optional(), evidence: ids.optional() }).transform((x) => ({ text: x.text, cites: x.cites ?? x.evidence ?? [] })),
  prose.transform((text) => ({ text, cites: [] as string[] })),
]);
const replySchema = z.object({
  slots: z.union([
    z.record(z.string(), cited),
    z.array(z.object({ id: z.string(), text: prose, cites: ids.optional(), evidence: ids.optional() }))
      .transform((xs) => Object.fromEntries(xs.map((x) => [x.id, { text: x.text, cites: x.cites ?? x.evidence ?? [] }]))),
  ]).default({}),
  steps: z.array(cited).default([]),
});

/** Paths and codes only, never the model's text. */
export const schemaIssues = (error: z.ZodError) => error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(root)'} ${i.code}`).join(', ');

export function parseSectionReply(content: string | null | undefined): { reply?: SectionReply; problem?: string } {
  let raw: unknown;
  try { raw = JSON.parse(content ?? ''); } catch { return { problem: 'invalid-json' }; }
  // "paragraphs" is the model's other name for the slots.
  if (raw && typeof raw === 'object' && !('slots' in raw) && 'paragraphs' in raw) raw = { ...(raw as object), slots: (raw as { paragraphs: unknown }).paragraphs };
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return { problem: `malformed output (${schemaIssues(parsed.error)})` };
  return { reply: parsed.data as SectionReply };
}

// ── Checks ───────────────────────────────────────────────────────────────────

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
// A tendency may be stated; an outcome may not be promised. Only affirmative promises are refused, tied to
// who or what is promised: "you will succeed", "will bring you success", "this ensures", "is guaranteed".
// Negations ("no guarantee", "not guaranteed"), purposes ("to ensure clarity") and ordinary futures
// ("adaptability will become important", "you will need to") pass.
const PROMISE = new RegExp([
  String.raw`\b(?:you|your career|your work|your business)\s+will\s+(?:definitely\s+|certainly\s+|surely\s+)?(?:succeed|thrive|flourish|prosper|excel|achieve|get|earn|receive|land|win|rise|gain|attract|enjoy|be (?:successful|promoted|recogni[sz]ed|rewarded|prosperous))\b`,
  String.raw`\bwill\s+(?:bring|give|grant)\s+(?:you\s+)?(?:success|wealth|fame|status|promotion|recognition|prosperity)\b`,
  String.raw`\bwill\s+(?:favou?r|come to the fore|guarantee|ensure)\b`,
  String.raw`\b(?:this|that|it|which|these|they|the period|the placement|the yoga|your chart)\s+(?:guarantees|ensures)\b`,
  String.raw`\b(?:is|are)\s+guaranteed\b|\b(?:destined|is bound to|are bound to)\b`,
  String.raw`\b(?:brings?|promis\w*|confers?|grants?)\b[^.!?]{0,40}\b(?:success|fame|wealth|prosperity|status)\b`,
  String.raw`\b(?:indicat\w*|signal\w*|mean\w*)\s+(?:a\s+|an\s+)?(?:favou?rable|strong|great|certain|assured)\b[^.!?]{0,40}\b(?:success|fame|wealth|prosperity|status)\b`,
].join('|'), 'i');
/** "work chart", "career chart" and "professional chart" are the model's names for the D10. */
const D10_NAMES = /\b(?:work|career|professional) chart\b/gi;
const REMEDY = /\b(gemstones?|sapphire|ruby|emerald|pearl|coral|wear (?:a|an) \w+|mantras?|pujas?|poojas?|rituals?|fasting)\b/i;
const INTERNAL = /\bwork_?style\b|\bfact ?ids?\b|\bJSON\b|\bledger\b/i;
/** An evidence id written into the prose ("E12", "T.verdict", "F.finance"). */
const ID_IN_PROSE = /\b(?:E\d+|[TFCRP]\.[a-z][\w.]*)\b/;
const DEGREE = /\d\s*°|\bdegrees?\b/i;
// Preference between ways of working (not between fields: "business" as a field is not an arrangement).
const FAVOUR = /\b(favou?rs?|better suited|best suited|recommend\w*|should (?:choose|pursue|aim for)|points? (?:clearly )?(?:to|towards)|more|better|best|mainly|primarily|chiefly|rather than|instead of)\b/i;
const EMPLOYED = /\b(employment|employed roles?|a job|salaried|working for an organi[sz]ation|organisational settings?|organizational settings?)\b/i;
const INDEPENDENT = /\b(self-employ\w*|self-directed|independent(?:,? \w+)? (?:work|settings?|roles?|ventures?|paths?|pursuits?|projects?|initiatives?)|working independently|working for yourself|your own (?:business|venture|firm|practice)|freelanc\w*)\b/i;
const STOCK = /\b(natural leader|inspire others|great candidate|shine in your career|unlock (?:your )?(?:full )?potential|sky is the limit|carefully crafted|dynamic and fulfilling)\b/i;
const GENERIC_ADVICE = /(?:^|[.!?]\s+)(?:(?:be|stay|remain) (?:patient|adaptable|flexible)|(?:develop|improve|strengthen) (?:your )?communication skills)(?=[.!?](?:$|\s)|$)/i;
const REPEATED_TEMPLATE = /\b(?:[A-Z][a-z]+ is the thread here|in practical terms,? (?:this|it) points you towards|treat it as a tendency rather than a fixed outcome)\b/i;
const UNRESOLVED_RECOMMENDATION = /\b(?:this|that|these|those) (?:field|profession|career(?: path)?|line of work|option)\b/i;
const PRACTICAL_CONCLUSION = /\b(?:work|career|job|role|setting|task|dut\w*|decision|responsibilit\w*|project|employment|business|profession\w*|team|organi[sz]ation|skill|client|colleague|management|administration|consult\w*|financ\w*|communicat\w*)\b/i;
const INTERPRETIVE_LINK = /\b(?:because|since|therefore|so|as a result|suggests?|indicates?|means?|connects?|supports?|points? to|makes? it|which (?:can|may|makes?|means?|suggests?|indicates?))\b/i;
const CAUTIOUS_LINK = /\b(?:supports? only a broad tendency|does not by itself identify|cannot by itself show|is not enough to identify|does not support a narrower conclusion)\b/i;
const CONNECTION_MARKERS: Array<[RegExp, RegExp]> = [
  [/\b(?:support\w*|in its favour|against it|points,? (?:above|below|well below) average)\b/i, /\b(?:support|balance|evidence|favour|constraint|mixed)\w*\b/i],
  [/\b(?:Mahadasha|Antardasha|period|sub-period)\b/i, /\b(?:period|timing|phase|Mahadasha|Antardasha)\b/i],
  [/\b(?:rules?|lord|governed)\b/i, /\b(?:rulership|rules?|lordship|govern\w*)\b/i],
  [/\b(?:exalt\w*|debilitat\w*|Moolatrikona|friendly sign|enemy's sign|own sign|combust\w*|retrograde|strong\w*|weak\w*)\b/i, /\b(?:exalt\w*|debilitat\w*|dignity|condition|strength|weakness|combust\w*|retrograde|friendly|enemy)\b/i],
  [/\b(?:house|D10|Lagna|placement|aspects?)\b/i, /\b(?:house|D10|Lagna|placement|aspect|position|structure)\b/i],
  [/\b(?:Yoga|together)\b/i, /\b(?:Yoga|combination|together)\b/i],
];
const STRONG_WORDS = '(?:strong|powerful|excellent|exceptional|well[- ]placed|dominant)';
const LINKING = '(?:\\s+(?:is|remains|appears|seems|looks|very|particularly|quite|also|still)){0,2}';
const MIX = /\b(mix\w*|blend\w*|both|alongside|combin\w*|balanc\w*|as well as|hybrid|between|either)\b/i;
const RECOMMEND = /\b(recommend\w*|ideal|best|pursue|go for|well suited|strong choice|excellent choice|promising)\b/i;
const QUALIFIED = /\b(not|less|weak\w*|limited|unlikely|caution|avoid|only if|secondary)\b/i;
const NAMES_D10 = /\bD10\b|\bDasamsa\b/i;
const NAMES_D1 = /\bD1\b|\bbirth chart\b|\bnatal\b|\bRasi\b/i;

/** A planet placed in a house in prose must match the calculated house (the chart named in the claim, else D1). */
export function houseClaimProblems(text: string, evidence: CareerReportFacts, defaultChart: 'D1' | 'D10' = 'D1'): string[] {
  const problems: string[] = [];
  const planets = GRAHAS.join('|');
  // Only a direct placement: "<planet> [up to three words] in (the|your) [Sign and the] Nth house". A house named
  // in another clause ("…position, and your 11th house support") or beside another noun ("…placement and a
  // weak 2nd house") is not placed by the planet.
  const claim = new RegExp(`\\b(${planets})\\b(?:['’]s?)?((?:\\s+[\\w'’-]+){0,3}?)\\s+(?:in|into|occupies|occupying|holding)\\s+(?:(?:the|your|its)\\s+)?(?:[A-Z][a-z]+\\s+(?:and|&)\\s+(?:the\\s+|your\\s+)?)?(?:D(?:1|10)(?:['’]s)?\\s+)?(?:(\\d{1,2})(?:st|nd|rd|th)|(${ORDINALS.join('|')}))\\s+house`, 'gi');
  for (const sentence of text.replace(D10_NAMES, 'D10').split(SENTENCES)) {
    for (const m of Array.from(sentence.matchAll(claim))) {
      if (/\b(?:rul\w*|lord\w*|govern\w*|roles?|aspect\w*|influence\w*)\b/i.test(m[2])) continue;
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
 * Problems with one piece of model text, judged against the facts it rests on. The vocabulary is closed:
 * any planet, sign, house number, year, month, yoga or degree must already be in those facts; the shared
 * guard then checks the text against the whole chart.
 */
export function slotProblems(text: string, kind: keyof typeof LENGTH, facts: CareerFact[], evidence: CareerReportFacts): string[] {
  return slotCheck(text, kind, facts, evidence).problems;
}

/** Problems block a slot; advisories (restating a placement) are recorded only. */
export function slotCheck(text: string, kind: keyof typeof LENGTH, facts: CareerFact[], evidence: CareerReportFacts): { problems: string[]; advisories: string[] } {
  const problems: string[] = [], advisories: string[] = [];
  const factText = facts.map((f) => f.text).join('\n');
  const allowed = namesOf(factText);
  const n = countWords(text);
  if (n < LENGTH[kind][0]) problems.push(`too short (${n} words; at least ${LENGTH[kind][0]})`);
  if (n > LENGTH[kind][1]) problems.push(`too long (${n} words; at most ${LENGTH[kind][1]})`);
  for (const g of GRAHAS) if (new RegExp(`\\b${g}\\b`).test(text) && !allowed.planets.includes(g)) problems.push(`names ${g}, which the cited evidence does not mention`);
  for (const s of SIGN_NAMES) if (new RegExp(`\\b${s}\\b`).test(text) && !allowed.signs.includes(s)) problems.push(`names ${s}, which the cited evidence does not mention`);
  for (const m of Array.from(text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/g))) if (!factText.includes(ord(Number(m[1])))) problems.push(`mentions the ${m[0]}, which the cited evidence does not`);
  for (const m of Array.from(text.matchAll(new RegExp(`\\b(${ORDINALS.join('|')})\\s+house`, 'gi')))) if (!factText.includes(ord(ORDINALS.indexOf(m[1].toLowerCase()) + 1))) problems.push(`mentions the ${m[0]}, which the cited evidence does not`);
  for (const y of text.match(/\b(?:19|20|21)\d{2}\b/g) ?? []) if (!factText.includes(y)) problems.push(`mentions ${y}, which the cited evidence does not`);
  for (const m of Array.from(text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/g))) if (!factText.includes(m[0])) problems.push(`mentions ${m[0]}, which the cited evidence does not`);
  // "Neecha Bhanga Yoga" names the fact's "Neecha Bhanga": a yoga is known if its name, with or without "Yoga", is.
  for (const m of Array.from(text.matchAll(/\b((?:[A-Z][a-z]+[ -])*[A-Z][a-z]+) Yoga\b/g))) if (!factText.includes(m[0]) && !factText.includes(m[1]) && !/^(This|The|That|A|Each|Any|No|Its|Your|Such)\b/.test(m[1])) problems.push(`names ${m[0]}, which the cited evidence does not`);
  if (DEGREE.test(text)) problems.push('states degrees, which the facts do not');
  if (PROMISE.test(text)) problems.push('states an outcome as certain; describe it as a tendency (may, can, tends to)');
  if (REMEDY.test(text)) problems.push('suggests a remedy');
  if (INTERNAL.test(text) || ID_IN_PROSE.test(text)) problems.push('uses an internal term or evidence id in the prose');
  if (STOCK.test(text)) problems.push(`uses a stock phrase ("${text.match(STOCK)![0]}"); say something specific to these facts`);
  if (GENERIC_ADVICE.test(text)) problems.push('uses generic advice; tie it to a concrete decision or action supported by the facts');
  if (REPEATED_TEMPLATE.test(text)) problems.push('uses a repeated writing template; explain this fact in its own terms');
  if (UNRESOLVED_RECOMMENDATION.test(text) && !Object.values(FIELDS).some((field) => field.words.test(text) || text.toLowerCase().includes(field.label.toLowerCase()))) {
    problems.push('uses an unresolved recommendation reference; name the specific professional field');
  }
  if (kind === 'explanation') {
    const matchingMarkers = CONNECTION_MARKERS.filter(([factPattern]) => factPattern.test(factText)).map(([, explanationPattern]) => explanationPattern);
    const cautious = CAUTIOUS_LINK.test(text);
    if (!cautious && (!PRACTICAL_CONCLUSION.test(text) || !INTERPRETIVE_LINK.test(text) || !matchingMarkers.some((marker) => marker.test(text)))) {
      problems.push('does not explain how the verified fact supports the practical conclusion; add the connection or state a cautious limit');
    }
  }
  // Restating the fact: "Jupiter in Capricorn in your 11th house" adds nothing.
  for (const m of Array.from(factText.matchAll(/\b(?:in )?(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces) in (?:your|the D10's|the) (\d+\w\w) house/g))) {
    if (new RegExp(`\\b${m[1]}\\b[^.!?]{0,15}\\b${m[2]}\\b`).test(text)) { advisories.push(`restates the fact (${m[1]}, ${m[2]} house)`); break; }
  }
  // Strength claims: a planet may be called strong only when the chart the sentence speaks of gives it a strong
  // dignity — the D10 when the sentence names it (or every fact is a D10 fact and it names no other chart), else D1.
  const allD10 = facts.length > 0 && facts.every((f) => f.chart === 'D10');
  for (const sentence of text.replace(D10_NAMES, 'D10').split(SENTENCES)) {
    const inD10 = NAMES_D10.test(sentence) ? !NAMES_D1.test(sentence) || /\bin the D10\b/i.test(sentence) : allD10 && !NAMES_D1.test(sentence);
    for (const g of GRAHAS) {
      // "the Sun well-placed", "Mercury's strong influence", "Saturn is strong", "a strong Venus"
      const claim = new RegExp(`\\b(?:the\\s+)?${g}(?:['’]s)?${LINKING}\\s+${STRONG_WORDS}\\b|\\b${STRONG_WORDS}\\s+(?:the\\s+)?${g}\\b`, 'i');
      if (!claim.test(sentence)) continue;
      const dignity = inD10 ? signDignity(g, evidence.chart.vargas.D10.placements.find((p) => p.planet === g)!.signIndex) : evidence.chart.strength.dignities.find((d) => d.planet === g)?.dignity;
      if (!['Exalted', 'Moolatrikona', 'Own sign'].includes(dignity ?? '')) problems.push(`overstates ${g}'s strength (${(dignity ?? 'no special dignity').toLowerCase()} in the ${inD10 ? 'D10' : 'birth chart'})`);
    }
  }
  // A period running now is never "upcoming".
  const now = (p: { start: string; end: string }) => Date.parse(p.start) <= +evidence.asOf && +evidence.asOf < Date.parse(p.end);
  const md = evidence.chart.dashas.vimshottari.mahadashas.find(now), ad = md?.antardashas.find(now);
  for (const [lord, level] of [[md?.lord, 'Mahadasha'], [ad?.lord, 'Antardasha|sub-?period']] as const) {
    if (!lord) continue;
    // Also in a list: "upcoming Mercury and Ketu sub-periods", "the coming Ketu and Mercury periods".
    const other = `(?:[A-Z][a-z]+(?:['’]s)?\\s+(?:and|&)\\s+)?`;
    const period = `${other}${lord}(?:['’]s)?\\s+(?:(?:and|&)\\s+[A-Z][a-z]+(?:['’]s)?\\s+)?(?:${level}|period|phase)s?`;
    if (new RegExp(`\\b(?:upcoming|approaching|forthcoming|coming|next)\\s+(?:the\\s+)?${period}\\b|\\b${period}\\b[^.!?]{0,25}\\b(?:approaches|approach|is approaching|will begin|is about to begin|begins soon|is coming)\\b`, 'i').test(text)) problems.push(`calls the ${lord} ${level.split('|')[0]} upcoming, but it is running now`);
  }
  for (const s of text.split(SENTENCES)) {
    if (FAVOUR.test(s) && !MIX.test(s)) {
      const job = EMPLOYED.test(s), own = INDEPENDENT.test(s);
      const ws = evidence.workStyle;
      if ((ws === 'employment' && own && !job) || (ws === 'independent' && job && !own) || ((ws === 'mixed' || ws === 'unresolved') && job !== own)) problems.push(`contradicts the work-style conclusion (${evidence.workStyleSentence})`);
    }
    for (const id of evidence.weakFields) if (FIELDS[id].words.test(s) && RECOMMEND.test(s) && !QUALIFIED.test(s)) problems.push(`recommends ${FIELDS[id].label.toLowerCase()}, which is weakly supported`);
  }
  problems.push(...houseClaimProblems(text, evidence, allD10 ? 'D10' : 'D1'));
  // The guard reads an unnamed chart as D1; text about D10 facts only is about the D10 unless it says otherwise.
  const named = text.replace(D10_NAMES, 'D10');
  const scoped = allD10 ? named.split(SENTENCES).map((x) => (/\bD1\b|\bD10\b|Dasamsa|birth chart|natal/i.test(x) ? x : `In the D10, ${x.charAt(0).toLowerCase()}${x.slice(1)}`)).join(' ') : named;
  problems.push(...textProblems(scoped, { chart: evidence.chart, factsText: factText, asOf: evidence.asOf, factsFirst: true }, 0));
  return { problems: Array.from(new Set(problems)), advisories };
}

const namesOf = (text: string) => ({
  planets: GRAHAS.filter((g) => new RegExp(`\\b${g}\\b`).test(text)),
  signs: SIGN_NAMES.filter((s) => new RegExp(`\\b${s}\\b`).test(text)),
});
// Words that set one piece of evidence against another. Ordinary comparatives ("slower than you would like",
// "agreed in advance") are not claims about how evidence interacts, so they need no second citation.
const COMPARISON = /\b(?:whereas|unlike|compared (?:with|to)|by contrast|in contrast|agrees? with|disagree\w*|contradict\w*|reinforc\w*|outweigh\w*|offset\w*|counterbalanc\w*)\b/i;
/** A field named as a field, not a word it covers ("mentor", "sales"): comparing two fields must cite both. */
const FIELD_NAMES: Record<FieldId, RegExp> = {
  administration: /\badministrat\w*/i, government: /\bgovernment\b|\bpublic sector\b|\bcivil service\b|\binstitutional roles?\b/i,
  business: /\bentrepreneur\w*|\bbusiness and entrepreneurship\b/i, advisory: /\badvisory\b|\bconsulting roles?\b|\bconsultancy\b/i,
  finance: /\bfinance\b|\bfinancial (?:roles?|work|management)\b/i, communication: /\bcommunication and public-facing\b|\bpublic-facing (?:roles?|professions?|work)\b/i,
};
const fieldsNamed = (text: string) => (Object.keys(FIELDS) as FieldId[]).filter((id) => FIELD_NAMES[id].test(text));

/**
 * Fields can appear together without being compared: period evidence, for example, deterministically lists every
 * field a lord brings forward. Assessment citations are required only when the prose ranks or weighs those fields.
 * Keep this sentence-scoped so a comparison elsewhere in a paragraph does not turn an ordinary field list into one.
 */
const FIELD_COMPARISON = new RegExp([
  COMPARISON.source,
  String.raw`\b(?:rank\w*|lead\w*|trail\w*|outpace\w*|exceed\w*|lag\w*|prefer\w*|favou?r\w*)\b`,
  String.raw`\b(?:versus|vs\.?|against)\b`,
  String.raw`\b(?:more|less|better|worse|stronger|weaker|firmer|higher|lower)\b[^.!?]{0,50}\bthan\b`,
  String.raw`\b(?:more|less|better|worse|stronger|weaker|firmer|higher|lower)\b[^.!?]{0,30}\b(?:support\w*|rank\w*|reading|balance)\b`,
  String.raw`\b(?:ahead of|behind|above|below|rather than)\b`,
  String.raw`\bshare\w*\b[^.!?]{0,30}\b(?:rank|reading|support|tier)\b`,
].join('|'), 'i');

const comparedFields = (text: string): FieldId[] => Array.from(new Set(text.split(SENTENCES).flatMap((sentence) => {
  const named = fieldsNamed(sentence);
  return named.length >= 2 && FIELD_COMPARISON.test(sentence) ? named : [];
})));

/** The cited items and those a cited conclusion was built from (one level): what the paragraph may draw on. */
export function citedEvidence(evidence: CareerReportFacts, cites: string[]): string[] {
  return Array.from(new Set(cites.flatMap((id) => [id, ...(evidence.ledger.byId.get(id)?.derivedFrom ?? [])])));
}

/** Citation problems: unknown or out-of-scope ids, a required item missing, a combined claim resting on one item. */
export function citationProblems(text: string, cites: string[], scope: string[], mustCite: string[], evidence: CareerReportFacts): string[] {
  const problems: string[] = [];
  if (!cites.length) return ['cites no evidence'];
  const unknown = cites.filter((id) => !evidence.ledger.byId.has(id));
  if (unknown.length) problems.push(`cites ${unknown.slice(0, 3).join(', ')}, which ${unknown.length > 1 ? 'are' : 'is'} not in the evidence`);
  const outside = cites.filter((id) => evidence.ledger.byId.has(id) && !scope.includes(id));
  if (outside.length) problems.push(`cites ${outside.slice(0, 3).join(', ')}, outside this paragraph's evidence`);
  const missing = mustCite.filter((id) => !cites.includes(id));
  if (missing.length) problems.push(`must cite ${missing.join(', ')}`);
  const all = citedEvidence(evidence, cites.filter((id) => evidence.ledger.byId.has(id)));
  // A D1–D10 relation (R.*, T.d10) is itself evidence from both charts.
  const sides = all.map((id) => evidence.ledger.byId.get(id)!).map((x) => (x.ruleId === 'd1-d10' ? 'both' : x.chart));
  const t = text.replace(D10_NAMES, 'D10');
  if (NAMES_D10.test(t) && NAMES_D1.test(t) && !(sides.some((c) => c === 'D10' || c === 'both') && sides.some((c) => c === 'D1' || c === 'timing' || c === 'both'))) problems.push('relates the birth chart and the D10 without citing evidence from both');
  const compared = comparedFields(text);
  if (compared.length >= 2) {
    const uncited = compared.filter((f) => !all.includes(`F.${f}`));
    const unavailable = uncited.filter((f) => !scope.includes(`F.${f}`));
    if (unavailable.length) problems.push('compares field support or rank outside this paragraph\'s evidence; describe only which fields the period emphasises, without ranking them');
    const available = uncited.filter((f) => scope.includes(`F.${f}`));
    if (available.length) problems.push(`compares fields without citing the assessment of ${available.map((f) => FIELDS[f].label.toLowerCase()).join(', ')}`);
  }
  const combines = namesOf(text).planets.length >= 2 || compared.length >= 2 || COMPARISON.test(text) || (NAMES_D10.test(t) && NAMES_D1.test(t));
  if (combines && all.length < 2) problems.push('combines or compares evidence but cites one item; cite each item it draws on');
  return problems;
}

/** Every check on one paragraph or step: its citations, then the shared text checks against what it cites. */
export function checkCitedText(text: string, cites: string[], kind: 'paragraph' | 'step', scope: string[], mustCite: string[], evidence: CareerReportFacts) {
  const citation = citationProblems(text, cites, scope, mustCite, evidence);
  const known = cites.filter((id) => evidence.ledger.byId.has(id));
  const c = slotCheck(text, kind, factsOf(evidence, citedEvidence(evidence, known)), evidence);
  return { problems: Array.from(new Set([...citation, ...c.problems])), advisories: c.advisories };
}

/**
 * Checks a reply for one part (or, in a correction, only the slots in `only`). Returns the accepted text by slot
 * and problems: a required slot's make the part fail; an optional slot's are recorded and it is dropped.
 */
export function checkSectionReply(section: CareerSectionFacts, reply: SectionReply, evidence: CareerReportFacts, only?: string[]) {
  const accepted: SectionText = new Map();
  const required = new Map<string, string[]>();
  const dropped = new Map<string, string[]>();
  const advisories = new Map<string, string[]>();
  const want = (id: string) => !only || only.includes(id);
  for (const slot of section.slots.filter((s) => want(s.id))) {
    const got = reply.slots[slot.id];
    const text = got?.text?.trim();
    let problems = ['missing'];
    if (text) {
      const c = checkCitedText(text, got.cites, 'paragraph', slot.scope, slot.mustCite, evidence);
      if (c.advisories.length) advisories.set(slot.id, c.advisories);
      problems = c.problems;
    }
    if (!problems.length) accepted.set(slot.id, { text: text!, cites: got.cites });
    else (slot.required ? required : dropped).set(slot.id, problems);
  }
  if (section.steps && want('steps')) {
    const good: Cited[] = [];
    reply.steps.slice(0, MAX_STEPS).forEach((step, i) => {
      const c = checkCitedText(step.text.trim(), step.cites, 'step', section.stepScope, [], evidence);
      if (c.problems.length) dropped.set(stepId(i), c.problems); else good.push({ text: step.text.trim(), cites: step.cites });
    });
    good.forEach((s, i) => accepted.set(stepId(i), s));
    const strong = evidence.strongFields.map((f) => `F.${f}`);
    const stepProblems = [
      good.length < MIN_STEPS && `${good.length} valid next steps; at least ${MIN_STEPS} required`,
      strong.length && !good.some((g) => g.cites.some((id) => strong.includes(id))) && `no valid next step acts on a well-supported field (cite ${strong.join(', ')})`,
    ].filter(Boolean) as string[];
    if (stepProblems.length) required.set('steps', [...stepProblems, ...Array.from(dropped).filter(([id]) => id.startsWith('step.')).map(([id, p]) => `${id}: ${p[0]}`)]);
  }
  return { accepted, required, dropped, advisories };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

/** "+S" supports/strong, "-W" strains/weak, "=M" neutral; "~" experimental; "·" context. */
const MARK = (x: { role: string; direction: string; strength: string }) => (x.role === 'context' ? '·' : x.role === 'experimental' ? '~' : `${x.direction === 'positive' ? '+' : x.direction === 'negative' ? '-' : '='}${x.strength[0].toUpperCase()}`);

/**
 * One part's request. Compact by design: every request reserves its worst-case cost against the report's fixed
 * ceiling before it is sent, so the plan, the evidence and the paragraphs are plain lines, not JSON.
 */
export function careerSectionPrompt(evidence: CareerReportFacts, section: CareerSectionFacts, correction?: Map<string, string[]>): string {
  const slots = section.slots.filter((s) => !correction || correction.has(s.id));
  const wantsSteps = section.steps && (!correction || correction.has('steps'));
  const { theses, briefs } = evidence.synthesis;
  const scope = Array.from(new Set([...slots.flatMap((s) => s.scope), ...(wantsSteps ? section.stepScope : [])]));
  const thesisIds = Object.values(theses);
  const item = (id: string) => evidence.ledger.byId.get(id)!;
  // The whole plan in every part: in full where this part may cite a thesis, in one line where it may not.
  const plan = (Object.keys(theses) as Array<keyof typeof theses>).map((k) => (scope.includes(theses[k]) ? `${theses[k]}: ${item(theses[k]).text}` : `(${briefs[k]})`));
  const shape = `{"slots": {"<id>": {"text": "…", "cites": ["<id>", …]}, …}${wantsSteps ? ', "steps": [{"cites": ["<id>", …], "text": "…"}]' : ''}}`;
  const jobs = Array.from(new Set(slots.map((s) => s.job)));
  return `Write part of a paid, personalised Vedic astrology Career Report: ${section.purpose} Plain, warm, specific English to "you"; the reader knows no astrology.
PLAN (shared; never contradict):
${plan.join('\n')}
EVIDENCE (+ supports, - strains, = neutral; weight S > M > W; ~ traditional, uncounted: cautious; · placement or link):
${scope.filter((id) => !thesisIds.includes(id)).map((id) => `${id} ${MARK(item(id))} ${item(id).brief ?? item(id).text}`).join('\n')}
WRITE, in order (id: job [citable ids, * must cite]):
${jobs.includes(FIELD_JOB) ? `field.*: ${FIELD_JOB}\n` : ''}${jobs.includes(PERIOD_JOB) ? `timing.(mahadasha|antardasha|next): ${PERIOD_JOB}\n` : ''}${slots.map((s) => `${s.id}${s.job === FIELD_JOB || s.job === PERIOD_JOB ? '' : `: ${s.job}`} [${s.scope.map((id) => (s.mustCite.includes(id) ? `${id}*` : id)).join(' ')}]`).join('\n')}${wantsSteps ? `\nsteps: ${MIN_STEPS}–${MAX_STEPS} concrete actions, 20–50 words, one on a best-supported field [${slots.length && section.stepScope.every((id) => slots[slots.length - 1].scope.includes(id)) ? `as ${slots[slots.length - 1].id}` : section.stepScope.join(' ')}]` : ''}
RULES: Interpret, don't list: how items bear on each other, which way the balance falls, how firm (say if thin or split); strong over weak. Cite every item used; a sentence joining two planets, both charts or comparing two fields' support or rank cites each. A period may bring several fields forward without ranking their support. No ids in prose. Name only planets, signs, houses, yogas, dates, years from cited items; no degrees; no calculation. may/can/tends to; promise nothing; no remedies. Friendly/neutral signs are moderate. Say "in the D10" for D10 placements. Fixed: ${evidence.workStyleSentence}.${evidence.weakFields.length ? ` Never recommend: ${evidence.weakFields.map((id) => FIELDS[id].label.toLowerCase()).join('; ')}.` : ''} Define terms briefly. No filler or generic advice; don't repeat other sections. 60–110 words a paragraph.
Return JSON exactly: ${shape}${correction ? `\nCORRECTION\nYour previous text for these items was rejected; rewrite only them so none of the problems recurs. Use only the citable ids shown for that item. If a field comparison needs assessment ids not shown there, remove the support/rank comparison and describe only the period's emphasis:\n${JSON.stringify(Object.fromEntries(Array.from(correction).map(([id, p]) => [id, p.slice(0, 6).map((x) => x.slice(0, 160))])))}` : ''}`;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

export const CAREER_DEFINITIONS: Record<string, string> = {
  Lagna: 'the rising sign at birth, the starting point of the chart', D10: 'the Dasamsa, a divisional chart traditionally read for profession',
  Mahadasha: 'a major planetary period in the Vimshottari system', Antardasha: 'a sub-period within a Mahadasha',
  Sarvashtakavarga: 'a traditional tally of support for each house (about 28 points is average)', Moolatrikona: 'a sign where a planet is strong, close to its own sign',
  'Neecha Bhanga': 'the cancellation of a debilitation, which softens the weakness', combust: 'too close to the Sun, which traditionally weakens a planet',
  retrograde: 'apparently moving backwards as seen from Earth', debilitated: 'in the sign where a planet is traditionally weakest', exalted: 'in the sign where a planet is traditionally strongest',
  'Dig Bala': 'directional strength, one component of planetary strength', Yoga: 'a recognised combination of planets',
};

/** One part's sections: each slot's paragraph (after its code-written lead), then (Career Strategy) the next steps. */
export function renderCareerSection(section: CareerSectionFacts, text: SectionText): Array<{ heading: CareerHeading; body: string }> {
  return section.headings.map((heading) => {
    const paragraphs = section.slots.filter((s) => s.heading === heading && text.has(s.id)).map((s: CareerSlot) => `${s.lead ? `${s.lead} ` : ''}${text.get(s.id)!.text}`);
    const steps = heading === 'Career Strategy' ? Array.from(text).filter(([id]) => id.startsWith('step.')).map(([, s], i) => `${i + 1}. ${s.text}`) : [];
    return { heading, body: [...paragraphs, ...(steps.length ? [`Next steps\n${steps.join('\n')}`] : [])].join('\n\n') };
  });
}

export const CAREER_GLOSSARY_HEADING = 'Glossary';
export const CAREER_APPENDIX_HEADING = 'Evidence Appendix';

/** One deterministic glossary for the whole report; definitions are never delegated to the model. */
export function careerGlossarySection(sections: Array<{ heading: string; body: string }>): { heading: string; body: string } | null {
  const reportText = sections.map((section) => section.body).join('\n');
  const definitions = Object.entries(CAREER_DEFINITIONS)
    .filter(([term]) => new RegExp(`\\b${term}\\b`, 'i').test(reportText))
    .map(([term, meaning]) => `${term}: ${meaning}.`);
  return definitions.length ? { heading: CAREER_GLOSSARY_HEADING, body: definitions.join('\n') } : null;
}

/** The evidence the report's paragraphs cite, grouped, with the method and its limits. Deterministic. */
export function careerAppendixSection(evidence: CareerReportFacts, texts: SectionText[]): { heading: string; body: string } {
  const cited = new Set(texts.flatMap((t) => Array.from(t.values()).flatMap((c) => citedEvidence(evidence, c.cites))));
  const items = evidence.ledger.items.filter((x) => cited.has(x.id) && /^E\d+$/.test(x.id));
  const group = (title: string, xs: typeof items) => (xs.length ? [`${title}\n${xs.map((x) => `- ${x.text}${x.role === 'experimental' ? ' (traditional indication, not counted)' : ''}`).join('\n')}`] : []);
  const rules = [...Object.values(CAREER_RULES).map((r) => `${r.rule} Limits: ${r.limits}`), ...Object.values(CAREER_SYNTHESIS_RULES)];
  return {
    heading: CAREER_APPENDIX_HEADING,
    body: [
      ...group('Birth chart (D1)', items.filter((x) => x.chart === 'D1')),
      ...group('Dasamsa (D10)', items.filter((x) => x.chart === 'D10')),
      ...group('Periods', items.filter((x) => x.chart === 'timing')),
      `How this report reads the chart\n${rules.map((r) => `- ${r}`).join('\n')}`,
    ].join('\n\n'),
  };
}

/** Deterministic reading note shown above the report. */
export function careerSummary(evidence: CareerReportFacts): string {
  void evidence;
  return 'This report reads your career from the birth chart (D1) and the Dasamsa (D10), compares six professional fields on the same evidence, and follows the timing through your Vimshottari periods. Every conclusion rests on calculated chart facts listed in the Evidence Appendix; dates describe calculated periods, not promised events, and your own skills and circumstances should guide every decision.';
}

/** PDF/UI tables from the canonical chart, never from legacy projections, and the report's structured analysis. */
export function careerMetadata(evidence: CareerReportFacts, kundli: any) {
  const { chart, asOf, synthesis: s, ledger } = evidence;
  const positions = chart.planets.map((p) => ({ planet: p.name, sign: p.sign, house: p.house, degree: p.degreeInSign, retrograde: p.retrograde }));
  const status = (p: { start: string; end: string }): 'past' | 'current' | 'upcoming' => Date.parse(p.start) > +asOf ? 'upcoming' : Date.parse(p.end) <= +asOf ? 'past' : 'current';
  const text = (id: string) => ledger.byId.get(id)!.text;
  return {
    birthDetails: { name: typeof kundli?.name === 'string' ? kundli.name : undefined, dateOfBirth: chart.birth.localDate, timeOfBirth: chart.birth.localTime, placeOfBirth: chart.birth.place, ascendant: chart.ascendant.sign, moonSign: chart.planets.find((p) => p.name === 'Moon')!.sign, sunSign: chart.planets.find((p) => p.name === 'Sun')!.sign, timeAccuracy: 'exact' as const },
    planetaryPositions: positions,
    chartData: {
      houses: chart.houses.map((h) => ({ house: h.house, sign: h.sign, planets: h.occupants })),
      planetaryPositions: positions.map((p) => ({ ...p, isRetrograde: p.retrograde })),
      dasamsa: {
        houses: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: SIGN_NAMES[(chart.vargas.D10.ascendantSignIndex + i) % 12] })),
        planetaryPositions: chart.vargas.D10.placements.map((p) => ({ planet: p.planet, sign: p.sign, house: p.house })),
      },
    },
    dashaTimeline: chart.dashas.vimshottari.mahadashas.map((p) => {
      const ad = p.antardashas.find((a) => status(a) === 'current');
      return { planet: p.lord, startDate: p.start.slice(0, 10), endDate: p.end.slice(0, 10), status: status(p), currentAntardasha: ad ? { planet: ad.lord, startDate: ad.start.slice(0, 10), endDate: ad.end.slice(0, 10) } : null };
    }),
    careerAnalysis: {
      verdict: { career: ledger.career.verdict, confidence: ledger.career.confidence, leadership: ledger.leadership.verdict },
      theses: Object.fromEntries(Object.entries(s.theses).map(([k, id]) => [k, text(id)])),
      workStyle: s.workStyle,
      fields: s.order.map((id) => { const f = s.fields.find((x) => x.id === id)!; return { id, label: f.label, verdict: f.verdict, supporting: f.supporting.map((x) => ledger.byId.get(x)!.label), conflicting: f.conflicting.map((x) => ledger.byId.get(x)!.label) }; }),
      comparisons: s.comparisons.map((c) => ({ higher: c.higher, lower: c.lower, relation: c.relation, text: text(c.itemId) })),
      d1d10: s.relations.map((r) => ({ planet: r.planet, roles: r.roles, relation: r.relation, text: text(r.itemId) })),
      d10: { relation: s.d10.relation, sensitivity: text(s.d10.sensitivityId) },
      periods: s.periods.map((p) => ({ level: p.level, lord: p.lord, within: p.within ?? null, start: p.start.slice(0, 10), end: p.end.slice(0, 10), tone: p.tone, current: p.key !== 'next', text: text(p.itemId), links: text(p.activationId) })),
      // For the PDF: everything below is read from the canonical chart or restates the synthesis; nothing new is judged.
      reportDate: asOf.toISOString().slice(0, 10),
      lords: { ...ledger.lords, d10LagnaSign: SIGN_NAMES[chart.vargas.D10.ascendantSignIndex] },
      strengths: s.strengths.map((id) => ({ label: ledger.byId.get(id)!.label, text: text(id), strength: ledger.byId.get(id)!.strength })),
      challenges: s.challenges.map((id) => ({ label: ledger.byId.get(id)!.label, text: text(id), strength: ledger.byId.get(id)!.strength })),
      placements: s.relations.map((r) => {
        const p = chart.planets.find((x) => x.name === r.planet)!, x = chart.vargas.D10.placements.find((q) => q.planet === r.planet)!;
        const dg = chart.strength.dignities.find((d) => d.planet === r.planet);
        return { planet: r.planet, d1: { sign: p.sign, house: p.house, dignity: dg ? `${dg.dignity}${dg.dignity === 'Debilitated' && dg.neechaBhanga ? ', cancelled (Neecha Bhanga)' : ''}` : null }, d10: { sign: x.sign, house: x.house, dignity: signDignity(r.planet, x.signIndex) } };
      }),
      timeline: (() => {
        const from = Date.parse(asOf.toISOString()), to = new Date(asOf); to.setUTCFullYear(to.getUTCFullYear() + 10);
        const within = (p: { start: string; end: string }) => Date.parse(p.end) > from && Date.parse(p.start) < +to;
        const mds = chart.dashas.vimshottari.mahadashas.filter(within);
        return { from: asOf.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
          mahadashas: mds.map((m) => ({ lord: m.lord, start: m.start.slice(0, 10), end: m.end.slice(0, 10) })),
          antardashas: mds.flatMap((m) => m.antardashas.filter(within).map((a) => ({ lord: a.lord, within: m.lord, start: a.start.slice(0, 10), end: a.end.slice(0, 10) }))) };
      })(),
      yogas: chart.yogas.filter((y) => !y.cancelled).map((y) => ({ name: y.name === 'Neecha Bhanga Raja Yoga' ? 'Neecha Bhanga (cancelled debilitation)' : y.name, planets: y.planets, configuration: y.description.split(' — ')[0].replace(/\.$/, '') })),
    },
  };
}
