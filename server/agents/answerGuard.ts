/**
 * Answer guard v2: every checkable astrological claim in an AI answer is
 * compared with the deterministic chart. A claim that is wrong, or that the
 * engine never produced (an invented yoga, dosha, period, date), is an issue.
 * The guard is deliberately conservative: an unverifiable affirmative claim
 * counts as an issue, because the fallback is a correct deterministic answer.
 */
import { SIGN_NAMES, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { NAKSHATRAS } from '../astroEngine/vedic.js';
import { signDignity } from '../astroEngine/dignity.js';
import { birthDayStability, yogaTimeStable } from '../astroEngine/canonical/birthDay.js';
import { buildInsights } from '../astroEngine/evidence/insights.js';
import { DOMAIN_LABELS, type LifeDomain, type Verdict } from '@shared/v3/evidence';

export interface GuardContext {
  chart: CanonicalChart;
  /** Packet text given to the model: dates/years it may repeat. */
  packetText: string;
  running: { mahadasha: Graha; antardasha: Graha | null } | null;
  timing: { mahadashaReliable: boolean; antardashaReliable: boolean };
  transits?: string;
  asOf: Date;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const ORD = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const PLANET_ALIASES: Record<string, Graha> = {
  sun: 'Sun', surya: 'Sun', moon: 'Moon', chandra: 'Moon', mars: 'Mars', mangal: 'Mars', kuja: 'Mars', mercury: 'Mercury', budh: 'Mercury', budha: 'Mercury',
  jupiter: 'Jupiter', guru: 'Jupiter', brihaspati: 'Jupiter', venus: 'Venus', shukra: 'Venus', saturn: 'Saturn', shani: 'Saturn', rahu: 'Rahu', ketu: 'Ketu',
};
const PLANET = `(${Object.keys(PLANET_ALIASES).join('|')})`;
const planetOf = (w: string) => PLANET_ALIASES[w.toLowerCase()];
const SIGN = `(${SIGN_NAMES.join('|')})`;
const NAK = `(${NAKSHATRAS.map((n) => n.name.replace(' ', '[ -]?')).join('|')})`;
const NEGATION = /\b(no|not|never|without|free (?:of|from)|absent|cancel+ed|isn['’]t|aren['’]t|doesn['’]t|don['’]t|does not|do not|lacks?|neither|nor|unknown|uncertain|cannot|can['’]t|unclear|not known)\b/i;
const TRANSIT_CONTEXT = /\b(transit|transiting|gochar|currently|right now|these days|this year|today|at present)\b/i;
// "present" only in its time sense: the verb ("could present challenges") says nothing about which period runs now.
const CURRENT = /\b(current(?:ly)?|running|now|presently|at present|(?:the|this|your) present|present (?:period|phase|time|stage|cycle|dasha|mahadasha|antardasha|maha\s?dasha|antar\s?dasha|sub-?period|bhukti)|ongoing|you are (?:in|going through|under)|you['’]re (?:in|going through|under)|at the moment|these days)\b/i;

function sentences(text: string): string[] {
  return text.replace(/\n+/g, '. ').split(/(?<=[.!?])\s+/).filter(Boolean);
}
/** True when a negation word appears before `index` in the same sentence. */
function negatedBefore(sentence: string, index: number): boolean {
  return NEGATION.test(sentence.slice(0, index));
}

// ── Named yogas and doshas ───────────────────────────────────────────────────
// Catalogue of names the model might use; each maps to the engine's name (or null:
// the engine never computes it, so an affirmative claim is unsupported).
const YOGA_CATALOGUE: Array<[RegExp, string | null]> = [
  [/\bneecha[ -]?bhanga(?: raja?)? yoga\b/i, 'Neecha Bhanga Raja Yoga'],
  [/\b(?:harsha|sarala|vimala)? ?vipa?reeta? raja? yoga\b/i, 'Vipreeta Raja Yoga'],
  [/\braja?(?:j)? yoga\b/i, 'Raja Yoga'],
  [/\bdhana yoga\b/i, 'Dhana Yoga'],
  [/\bgaja[ -]?kesari yoga\b/i, 'Gajakesari Yoga'],
  [/\bbudh(?:a)?[ -]?aditya yoga\b/i, 'Budha-Aditya Yoga'],
  [/\bchandra[ -]?mangala? yoga\b/i, 'Chandra-Mangala Yoga'],
  [/\bruchaka yoga\b/i, 'Ruchaka Yoga'],
  [/\bbhadra yoga\b/i, 'Bhadra Yoga'],
  [/\bhamsa yoga\b/i, 'Hamsa Yoga'],
  [/\bmalavya yoga\b/i, 'Malavya Yoga'],
  [/\bsh?asha? yoga\b/i, 'Sasa Yoga'],
  [/\bkemadruma(?: yoga)?\b/i, 'Kemadruma Yoga'],
  [/\b(lakshmi|saraswati|parivartana|adhi|amala|sunapha|anapha|durudhura|shakata|kahala|parvata|chamara|mahabhagya|vasumati|pushkala|kalanidhi|akhanda samrajya|veshi|vashi|ubhayachari|kalpadruma|chatussagara|srinatha|shankha|bheri|mridanga|gauri|dharma[ -]karmadhipati|guru[ -]?chandala?|grahan|shrapit) yoga\b/i, null],
];
const DOSHA_CATALOGUE: Array<[RegExp, 'mangal' | 'kaalSarp' | 'pitru' | 'vishaYoga' | 'sadeSati' | null]> = [
  [/\b(mangal(?:ik)?|manglik|kuja|bhauma) dosh(?:a|am)?\b|\bmanglik\b/i, 'mangal'],
  [/\bkaa?la?[ -]?sarpa?(?: dosh(?:a|am)?| yoga)\b/i, 'kaalSarp'],
  [/\bpit(?:r|ru|ra) dosh(?:a|am)?\b/i, 'pitru'],
  [/\bvisha yoga\b/i, 'vishaYoga'],
  [/\bsade[ -]?sati\b/i, 'sadeSati'],
  [/\b(guru[ -]?chandal(?:a)?|grahan|shrapit|nadi|bhakoot|angarak|kalathra) dosh(?:a|am)?\b/i, null],
];

function presentYogas(chart: CanonicalChart): Set<string> {
  const names = new Set<string>();
  for (const y of chart.yogas) {
    if (y.cancelled) continue;
    names.add(y.name);
    if (/Vipreeta Raja Yoga$/.test(y.name)) names.add('Vipreeta Raja Yoga');
  }
  return names;
}

// ── Approximate birth time ───────────────────────────────────────────────────
// Claims an approximate birth time can never support: they depend on the Lagna, a degree, or
// a date the unknown time moves. Checked only when the birth time is approximate.
const SPELLED_HOUSE = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+house\b/i;
const BINDUS = /\b\d{1,2}\s*bindus?\b|\b(?:sav|sarvashtakavarga|ashtakavarga)\b[^.]{0,40}?\b\d{1,2}\b/i;
const DEGREES = /\b\d{1,2}(?:\.\d+)?\s?(?:°|degrees?\b)/i;
const PADA = /\bpada\s*\d|\b(?:first|second|third|fourth|[1-4](?:st|nd|rd|th))\s+pada\b/i;
const VARGA = /\b(navamsa|navamsha|navansh|d-?9|dasamsa|dashamsha|dasamsha|d-?10|d-?60|shashtiamsa|vargottama|divisional chart)\b/i;
const JAIMINI_KARAKA = /\b(?:atma|amatya|bhratri|matri|pitri|putra|gnati|dara)[ -]?karaka\b/i;
const DASHA_TERM = /\b(maha\s?dasha|mahadasa|dasha|dasa|antar\s?dasha|antardasa|bhukti)\b/i;
const DATE_OR_CHANGE = new RegExp(`\\b(1[89]\\d{2}|2[01]\\d{2}|${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].join('|')}|begins?|began|starts?|started|ends?|ended|until|till|from|after|before|changes?|switch(?:es)?|next|upcoming|coming|later|following|years? (?:old|of age)|age \\d)\\b`, 'i');

// ── Exact-time facts: Sarvashtakavarga figures and Neecha Bhanga ────────────
const HOUSE_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
const HOUSE_REF = `(?:(\\d{1,2})(?:st|nd|rd|th)\\s+house|(${Object.keys(HOUSE_WORDS).join('|')})\\s+house|\\bH(\\d{1,2})\\b)`;
const houseOf = (m: RegExpMatchArray, i: number) => Number(m[i] ?? m[i + 2]) || HOUSE_WORDS[(m[i + 1] ?? '').toLowerCase()];
// A number quoted as a threshold ("32 or more bindus", "fewer than 25") describes the scale, not this chart.
const THRESHOLD_BEFORE = /\b(?:than|least|most|above|below|over|under|about|around|roughly|nearly|approximately|average(?: of)?|between|and|to|or)\s*$/i;
const THRESHOLD_AFTER = /^\s*(?:\+|or (?:more|fewer|less|above|below|higher|lower)|and (?:above|below|over|under)|(?:–|-|to)\s*\d)/i;
const FROM_MOON = /\bfrom (?:the |your )?(?:moon|chandra)\b/i;
const ANOTHER_HOUSE = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)\\b|\\b(?:${Object.keys(HOUSE_WORDS).join('|')})\\b|\\bH\\d{1,2}\\b`, 'i');

/** "the 10th house has 34 bindus", "34 bindus in the 10th house", "H10 (34 bindus)": [house, bindus, index of the number]. */
function houseBinduClaims(s: string): Array<{ house: number; bindus: number; at: number }> {
  const out: Array<{ house: number; bindus: number; at: number }> = [];
  for (const m of Array.from(s.matchAll(new RegExp(`${HOUSE_REF}([^.;]{0,60}?)\\b(\\d{1,2})\\s*bindus?\\b`, 'gi')))) {
    // The figure must belong to this house: no second house, and not a house counted from the Moon.
    if (FROM_MOON.test(m[4]) || ANOTHER_HOUSE.test(m[4])) continue;
    out.push({ house: houseOf(m, 1), bindus: Number(m[5]), at: m.index! + m[0].length - m[0].match(/\d{1,2}\s*bindus?$/i)![0].length });
  }
  for (const m of Array.from(s.matchAll(new RegExp(`\\b(\\d{1,2})\\s*bindus?\\b[^.;]{0,30}?\\b(?:in|for|of|to|at)\\s+(?:your\\s+|the\\s+|its\\s+)?${HOUSE_REF}`, 'gi')))) {
    if (FROM_MOON.test(s.slice(m.index! + m[0].length, m.index! + m[0].length + 25))) continue;
    out.push({ house: houseOf(m, 2), bindus: Number(m[1]), at: m.index! });
  }
  return out.filter((c) => c.house >= 1 && c.house <= 12 && !THRESHOLD_BEFORE.test(s.slice(0, c.at)) && !THRESHOLD_AFTER.test(s.slice(c.at).replace(/^\d{1,2}/, '')));
}

const NB_PHRASE = String.raw`(?:neecha[ -]?bhanga|debilitation\s+(?:is\s+|was\s+|gets\s+|stands\s+)?(?:cancel+ed|nullified|neutrali[sz]ed)|cancel+(?:ed|ation of)\s+(?:its\s+|his\s+|her\s+|the\s+)?debilitation)`;

// Words allowed between a planet and the phrase, so a planet named as the cause ("because Venus sits in a kendra") is not read as the subject.
const NB_LEAD = String.raw`(?:(?:has|have|had|gets|got|enjoys|receives|shows|with|without|is|was|isn['’]t|also|a|an|the|its|his|her|clear|full|partial|real|no|not|never|debilitated|and|but|lacks?)\s+){0,6}`;

// ── Life-area verdicts ───────────────────────────────────────────────────────
// Only a flat statement of an area's overall verdict is checked ("Your career is challenging",
// "Career: Strong"): the claim must be the whole sentence. Anything around it (a time, a period,
// a transit, a single technique, a condition) makes it interpretation, which is left alone.
const DOMAIN_TERMS: Array<[LifeDomain, string]> = [
  ['career', 'career|profession'], ['wealth', 'wealth|finances?|money matters'], ['relationships', 'relationships?|marriage|partnerships?|married life'],
  ['leadership', 'leadership'], ['property', 'property(?: (?:&|and) home)?|home and property'], ['foreign', 'foreign (?:&|and) travel|foreign travel|life abroad|foreign settlement'],
  ['education', 'education|studies'], ['children', 'children|progeny'], ['spirituality', 'spirituality|spiritual life'],
];
const VERDICT_WORDS = 'exceptional|very strong|strong|very challenging|challenging|very favou?rable|favou?rable|unfavou?rable|excellent|difficult';
const NEGATIVE_WORD = /^(very challenging|challenging|unfavou?rable|difficult)$/i;
const POSITIVE_VERDICTS: Verdict[] = ['Exceptional', 'Very Strong', 'Strong'];
const NEGATIVE_VERDICTS: Verdict[] = ['Challenging', 'Very Challenging'];
const QUALIFIED = /\b(but|although|though|while|whereas|yet|however|despite|except|at times|sometimes|in parts?|in some|during|when|whenever|until|till|after|before|early|later|phases?|periods?|can be|could|may|might|if|unless|some|partly|partially|mixed|aspects? of|side of)\b/i;
const VERDICT_CLAIM = new RegExp(`^\\s*(?:(?:overall|on balance|in (?:your|this) chart),?\\s+)?(?:your\\s+)?(${DOMAIN_TERMS.map(([, t]) => t).join('|')})(?:\\s+(?:prospects?|outlook|picture|area|matters))?\\s*(?::|\\b(?:is|are|looks?|appears?|reads?\\s+as|comes?\\s+out\\s+as|is\\s+rated(?:\\s+as)?|verdict\\s+is)\\b)\\s*(?:(?:very|highly|quite|clearly|overall|largely|rather|decidedly)\\s+)?(?:an?\\s+)?(${VERDICT_WORDS})(?:\\s+(?:overall|on balance|in (?:your|this) chart|for you))?\\s*[.!]?\\s*$`, 'i');

// ── Years and period boundaries ──────────────────────────────────────────────
// A year may be named when it lies inside a timing range the facts state in one of the forms the
// app writes: Ask's dasha lines ("2025-03-11 → 2042-03-11"), the dasha periods in the chart
// summary ("2025-03 – 2042-03"), Sade Sati ("~Apr 2025 to ~Jun 2027") and the Year Ahead window
// ("Report window: October 2026 to October 2027"). Dasha ranges count only for an exact birth time.
const YEAR = '((?:19|20|21)\\d{2})';
const DASHA_RANGES = [new RegExp(`\\b${YEAR}-\\d{2}-\\d{2} → ${YEAR}-\\d{2}-\\d{2}\\b`, 'g'), new RegExp(`\\b${YEAR}-\\d{2} – ${YEAR}-\\d{2}\\b`, 'g')];
const OTHER_RANGES = [new RegExp(`~[A-Z][a-z]{2} ${YEAR} to ~[A-Z][a-z]{2} ${YEAR}\\b`, 'g'), new RegExp(`Report window: [A-Z][a-z]+ ${YEAR} to [A-Z][a-z]+ ${YEAR}\\b`, 'g')];

function suppliedRanges(text: string, approximate: boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const re of approximate ? OTHER_RANGES : [...DASHA_RANGES, ...OTHER_RANGES]) {
    for (const m of Array.from(text.matchAll(re))) if (Number(m[1]) <= Number(m[2])) out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE = `(?:(${MONTH_NAMES.join('|')}|${MONTH_NAMES.map((m) => m.slice(0, 3)).join('|')})\\.?\\s+)?${YEAR}(?:-(\\d{2}))?(?:-\\d{2})?\\b`;
// "major/main period" is a Mahadasha, "minor/sub-period" an Antardasha; a bare "period" may be either.
const PERIOD_NAME = `\\b${PLANET}(?:['’]s)?\\s*[- ]?\\s*(maha\\s?dasha|mahadasa|antar\\s?dasha|antardasa|bhukti|(?:major|main)\\s+period|(?:minor\\s+|sub-?)period|dasha|dasa|period)\\b`;
const TAKES_OVER = `\\b${PLANET}\\s+(?:takes?|took|will\\s+take)\\s+over\\b`;
// For an approximate time: these name a period too, so a date or change with them is refused like "dasha".
const PERIOD_PARAPHRASE = new RegExp(`\\b${PLANET}(?:['’]s)?\\s+(?:(?:major|main|minor)\\s+|sub-?)?period\\b|${TAKES_OVER}`, 'i');
// A date or a change for those paraphrases. Month names are matched capitalised, so "may" (the verb) is not a date.
const PERIOD_DATE = /\b(?:1[89]\d{2}|2[01]\d{2}|begins?|began|starts?|started|ends?|ended|until|till|from|after|before|changes?|switch(?:es)?|next|upcoming|takes? over|took over)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i;
const START_WORD = '(?:begins?|began|starts?|started|commences?|commenced|opens?|from)';
const END_WORD = '(?:ends?|ended|finishes|finished|concludes?|concluded|closes?|lasts until|runs until|runs till|until|till|through)';
const AT = '\\s+(?:in\\s+|on\\s+|around\\s+|by\\s+|about\\s+)?';
const RANGE_VERB = '(?:runs?|ran|lasts?|lasted|spans?|spanned|extends?|extended|continues?|operates?|is|was|will\\s+(?:run|last|span|extend|continue))';
const RANGE_AFTER = new RegExp(`^\\s*[(,]?\\s*(?:${RANGE_VERB}\\s+)?(?:from\\s+|between\\s+)?${DATE}\\s*(?:–|—|-|→|to|until|till|through|and)\\s*${DATE}`, 'i');
const TAKEOVER_AFTER = new RegExp(`^[^.;]{0,25}?\\b${DATE}`, 'i');
const START_AFTER = new RegExp(`\\b${START_WORD}${AT}${DATE}`, 'i');
const END_AFTER = new RegExp(`\\b${END_WORD}${AT}${DATE}`, 'i');
const DENIED = /\b(?:not|never|no longer|n['’]t)\b[^.]{0,12}$/i;

type Claim = { lord: Graha; level: 'maha' | 'antar' | 'any'; edge: 'start' | 'end'; year: number; month: number | null };
const monthOf = (name?: string, mm?: string) => (mm ? Number(mm) - 1 : name ? MONTH_NAMES.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3))) : null);

/** Explicit start/end assertions about a named Mahadasha or Antardasha ("Venus Mahadasha begins in 2031", "Saturn Antardasha (2027–2030)"). */
function periodBoundaryClaims(s: string): Claim[] {
  const out: Claim[] = [];
  for (const m of Array.from(s.matchAll(new RegExp(PERIOD_NAME, 'gi')))) {
    const lord = planetOf(m[1]);
    const level = /antar|bhukti|sub|minor/i.test(m[2]) ? 'antar' : /^period$/i.test(m[2]) ? 'any' : 'maha';
    // "the Ketu Antardasha of the Mercury Mahadasha begins…": the Mahadasha only places the Antardasha.
    if (level === 'maha' && /\b(?:antar\s?dasha|antardasa|bhukti|sub-?period|minor\s+period)\s+(?:of|within|in|inside)\s+(?:the\s+|your\s+)?$/i.test(s.slice(0, m.index!))) continue;
    const tail = s.slice(m.index! + m[0].length, m.index! + m[0].length + 70);
    const range = tail.match(RANGE_AFTER);
    if (range) {
      out.push({ lord, level, edge: 'start', year: Number(range[2]), month: monthOf(range[1], range[3]) });
      out.push({ lord, level, edge: 'end', year: Number(range[5]), month: monthOf(range[4], range[6]) });
      continue;
    }
    for (const [re, edge] of [[START_AFTER, 'start'], [END_AFTER, 'end']] as const) {
      const b = tail.match(re);
      if (b && !DENIED.test(tail.slice(0, b.index!))) out.push({ lord, level, edge, year: Number(b[2]), month: monthOf(b[1], b[3]) });
    }
  }
  // "Venus takes over in 2031": the start of a Venus Mahadasha or Antardasha.
  for (const m of Array.from(s.matchAll(new RegExp(TAKES_OVER, 'gi')))) {
    if (DENIED.test(s.slice(0, m.index! + m[0].length))) continue;
    const d = s.slice(m.index! + m[0].length).match(TAKEOVER_AFTER);
    if (d) out.push({ lord: planetOf(m[1]), level: 'any', edge: 'start', year: Number(d[2]), month: monthOf(d[1], d[3]) });
  }
  return out;
}

/** The calculated dates a boundary claim may refer to (an Antardasha within the named, or else the previous, current or next, Mahadasha). */
function boundaryDates(chart: CanonicalChart, c: Claim, s: string, asOf: Date): string[] {
  const mds = chart.dashas.vimshottari.mahadashas;
  const birth = chart.birth.birthUTC;
  // The birth Mahadasha began before birth; the timeline shows it from the birth date.
  const maha = mds.filter((m) => m.lord === c.lord).flatMap((m) => (c.edge === 'end' ? [m.end] : m.start < birth ? [m.start, birth] : [m.start]));
  if (c.level === 'maha') return maha;
  const named = Array.from(s.matchAll(new RegExp(`\\b${PLANET}(?:['’]s)?\\s*[- ]?\\s*(?:maha\\s?dasha|mahadasa)\\b`, 'gi'))).map((m) => planetOf(m[1]));
  const t = asOf.getTime();
  const i = mds.findIndex((m) => Date.parse(m.start) <= t && t < Date.parse(m.end));
  const scope = named.length ? mds.filter((m) => named.includes(m.lord)) : mds.slice(Math.max(0, i - 1), i + 2);
  const antar = scope.flatMap((m) => m.antardashas.filter((a) => a.lord === c.lord).map((a) => (c.edge === 'end' ? a.end : a.start)));
  return c.level === 'any' ? [...maha, ...antar] : antar;
}

const matchesDate = (iso: string, c: Claim) => {
  const year = Number(iso.slice(0, 4)), month = Number(iso.slice(5, 7)) - 1;
  // A stated month may differ by one from the UTC date near a month boundary.
  return c.month === null ? year === c.year : Math.abs(year * 12 + month - (c.year * 12 + c.month)) <= 1;
};

// Chart attribution: each sign, house, Lagna or dignity claim is checked against one chart only — the chart named
// nearest to it in its clause, else the last chart named earlier in the sentence, else D1. A claim about the D10 is
// never accepted because it happens to be true in D1, and the reverse. Equally near charts must all agree.
type ChartRef = 'D1' | keyof CanonicalChart['vargas'];
const VARGA_NAMES: Array<[RegExp, keyof CanonicalChart['vargas']]> = [
  [/\b(?:navamsa|navamsha|navansh|d-?9)\b/gi, 'D9'], [/\b(?:dasamsa|dashamsha|dasamsha|d-?10)\b/gi, 'D10'], [/\b(?:shashtiamsa|d-?60)\b/gi, 'D60'],
  [/\b(?:saptamsa|saptamsha|d-?7)\b/gi, 'D7'], [/\b(?:drekkana|drekkan|d-?3)\b/gi, 'D3'], [/\b(?:chaturthamsa|chaturthamsha|d-?4)\b/gi, 'D4'], [/\b(?:dwadasamsa|dwadashamsha|d-?12)\b/gi, 'D12'],
];
const D1_MARKER = /\b(?:d-?1|rasi chart|rashi chart|birth chart|natal chart|lagna chart)\b/gi;
const CLAUSE_BREAK = /[,;:()\u2013\u2014]|\b(?:but|while|whereas|although|though|and|unlike|versus|vs|compared (?:with|to)|than)\b/gi;
type ChartMarker = { start: number; end: number; chart: ChartRef };

function chartMarkers(s: string): ChartMarker[] {
  const at = (re: RegExp, chart: ChartRef) => Array.from(s.matchAll(re)).map((m) => ({ start: m.index!, end: m.index! + m[0].length, chart }));
  return [...at(D1_MARKER, 'D1'), ...VARGA_NAMES.flatMap(([re, d]) => at(re, d))].sort((a, b) => a.start - b.start);
}

function chartsOf(s: string, markers: ChartMarker[], start: number, end: number): ChartRef[] {
  if (!markers.length) return ['D1'];
  let lo = 0, hi = s.length;
  for (const b of Array.from(s.matchAll(CLAUSE_BREAK))) {
    const i = b.index!, j = i + b[0].length;
    if (j <= start) lo = Math.max(lo, j);
    else if (i >= end) hi = Math.min(hi, i);
  }
  const inClause = markers.filter((m) => m.start >= lo && m.end <= hi);
  if (inClause.length) {
    const dist = (m: ChartMarker) => (m.end <= start ? start - m.end : m.start >= end ? m.start - end : 0);
    const nearest = Math.min(...inClause.map(dist));
    return Array.from(new Set(inClause.filter((m) => dist(m) === nearest).map((m) => m.chart)));
  }
  const before = markers.filter((m) => m.end <= start);
  return before.length ? [before[before.length - 1].chart] : ['D1'];
}

// ── The validator ────────────────────────────────────────────────────────────

export function validateAnswer(answer: string, ctx: GuardContext): string[] {
  const { chart } = ctx;
  const issues: string[] = [];
  const approx = chart.birth.timeAccuracy === 'approximate';
  const planet = (g: Graha) => chart.planets.find((p) => p.name === g)!;
  const dignity = (g: Graha) => chart.strength.dignities.find((d) => d.planet === g);
  const yogas = presentYogas(chart);
  const st = birthDayStability(chart);
  let verdicts: Map<LifeDomain, Verdict> | undefined;
  const sadeSatiActive = !ctx.transits || /Sade Sati undetermined/.test(ctx.transits) ? null : /Sade Sati ACTIVE/.test(ctx.transits);

  for (const s of sentences(answer)) {
    const transitSentence = TRANSIT_CONTEXT.test(s) && !/\b(birth|natal|born|chart)\b/i.test(s);
    // With an approximate time divisional placements are refused outright (below), so every claim is read as D1.
    const markers = approx ? [] : chartMarkers(s).filter((m) => m.chart === 'D1' || chart.vargas[m.chart]);
    const chartsAt = (start: number, end: number) => chartsOf(s, markers, start, end);
    const placementIn = (ref: ChartRef, g: Graha) => ref === 'D1' ? { sign: planet(g).sign as string, house: planet(g).house, signIndex: planet(g).signIndex } : chart.vargas[ref].placements.find((p) => p.planet === g)!;
    const lagnaIn = (ref: ChartRef) => (ref === 'D1' ? chart.ascendant.sign : SIGN_NAMES[chart.vargas[ref].ascendantSignIndex]) as string;
    const inChart = (ref: ChartRef) => (ref === 'D1' ? '' : ` in the ${ref}`);

    // Planet in sign (natal). Transit sentences are about the sky today, not the chart.
    if (!transitSentence) {
      for (const m of Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b(?:['’]s)?\\s+(?:(?:is\\s+|sits\\s+|placed\\s+|posited\\s+|located\\s+|was\\s+)?(?:in|into)\\s+|occupies\\s+)(?:the\\s+sign\\s+(?:of\\s+)?)?${SIGN}\\b`, 'gi')))) {
        const g = planetOf(m[1]); const claimed = cap(m[2]);
        if (approx && !st.planets[g].sign) { if (!negatedBefore(s, m.index!)) issues.push(`${g}'s sign is uncertain: it changes during the birth date and the birth time is approximate`); continue; }
        if (negatedBefore(s, m.index!)) continue;
        for (const ref of chartsAt(m.index!, m.index! + m[0].length)) {
          const actual = placementIn(ref, g).sign;
          if (actual !== claimed) issues.push(`${g} is in ${actual}${inChart(ref)}, not ${claimed}`);
        }
      }
    }

    if (approx && !NEGATION.test(s)) {
      const moonSign = s.match(new RegExp(`\\b(?:moon sign|rashi|rasi)\\b(?:\\s+is|:)?\\s+${SIGN}|\\b${SIGN}\\s+(?:moon sign|rashi|rasi)\\b`, 'i'));
      if (moonSign) {
        if (!st.planets.Moon.sign) issues.push("the Moon's sign is uncertain: it changes during the birth date and the birth time is approximate");
        else if (cap(moonSign[1] ?? moonSign[2]) !== planet('Moon').sign) issues.push(`the Moon sign is ${planet('Moon').sign}, not ${cap(moonSign[1] ?? moonSign[2])}`);
      }
      if (SPELLED_HOUSE.test(s)) issues.push('the birth time is approximate, so houses and the Lagna must not be stated');
      if (BINDUS.test(s)) issues.push('Ashtakavarga bindus depend on the Lagna, so they are not stated with an approximate birth time');
      if (DEGREES.test(s)) issues.push('planet degrees change through the birth date, so they are not stated with an approximate birth time');
      if (PADA.test(s)) issues.push('nakshatra padas change through the birth date, so they are not stated with an approximate birth time');
      if (VARGA.test(s) && (new RegExp(`\\b${PLANET}\\b|\\b${SIGN}\\b`, 'i').test(s))) issues.push('divisional-chart placements depend on the exact birth time');
      if (JAIMINI_KARAKA.test(s)) issues.push('Jaimini karakas are ranked by degree, which changes through the birth date');
      if (/\bneecha[ -]?bhanga\b/i.test(s)) issues.push('Neecha Bhanga is judged from the Lagna, so it cannot be stated with an approximate birth time');
      if ((DASHA_TERM.test(s) && DATE_OR_CHANGE.test(s)) || (PERIOD_PARAPHRASE.test(s) && PERIOD_DATE.test(s))) issues.push('dasha dates depend on the exact birth time, so no period start, end or change can be stated');
    }

    // Houses and Lagna.
    const houseMatches = Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b\\s+(?:is\\s+|sits\\s+|placed\\s+|was\\s+)?in\\s+(?:your\\s+|the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\s+house`, 'gi')));
    const lagnaClaims = Array.from(s.matchAll(new RegExp(`\\b(?:lagna|ascendant|rising sign)\\b(?:\\s+is|\\s+in|:)?\\s+${SIGN}`, 'gi')));
    if (approx) {
      if ((houseMatches.length || /\b\d{1,2}(?:st|nd|rd|th) house\b/i.test(s) || /\b(lagna|ascendant|rising sign)\b/i.test(s)) && !NEGATION.test(s)) {
        issues.push('the birth time is approximate, so houses and the Lagna must not be stated');
      }
    } else if (!transitSentence) {
      for (const m of houseMatches) {
        const g = planetOf(m[1]);
        for (const ref of chartsAt(m.index!, m.index! + m[0].length)) {
          const actual = placementIn(ref, g).house;
          if (actual !== Number(m[2])) issues.push(`${g} is in the ${ORD(actual)} house${inChart(ref)}, not the ${ORD(Number(m[2]))}`);
        }
      }
      for (const lagnaClaim of lagnaClaims) {
        for (const ref of chartsAt(lagnaClaim.index!, lagnaClaim.index! + lagnaClaim[0].length)) {
          if (cap(lagnaClaim[1]) !== lagnaIn(ref)) issues.push(`the${ref === 'D1' ? '' : ` ${ref}`} Lagna is ${lagnaIn(ref)}, not ${cap(lagnaClaim[1])}`);
        }
      }
    }

    // Nakshatra.
    const moonNakStable = !approx || chart.uncertainty.moonNakshatraStableAcrossBirthDate;
    for (const m of Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b[^.]{0,25}?\\b(?:in|occupies)\\s+(?:the\\s+)?${NAK}\\b`, 'gi')))) {
      if (transitSentence) continue;
      const g = planetOf(m[1]); const claimed = m[2].replace(/[ -]?(Phalguni|Ashadha|Bhadrapada)/i, ' $1').trim().toLowerCase();
      if (g === 'Moon' && !moonNakStable) { issues.push("the Moon's nakshatra is uncertain with an approximate birth time"); continue; }
      if (approx && !st.planets[g].nakshatra) { issues.push(`${g}'s nakshatra changes during the birth date, so it is uncertain`); continue; }
      if (planet(g).nakshatra.name.toLowerCase() !== claimed) issues.push(`${g} is in ${planet(g).nakshatra.name} nakshatra, not ${m[2]}`);
    }
    const birthStar = s.match(new RegExp(`\\b(?:birth star|janma nakshatra|your nakshatra|moon nakshatra)\\b[^.]{0,20}?\\b${NAK}\\b|\\b${NAK}\\s+(?:is\\s+)?(?:your\\s+)?(?:birth star|janma nakshatra)`, 'i'));
    if (birthStar) {
      const claimed = (birthStar[1] ?? birthStar[2]).replace(/[ -]?(Phalguni|Ashadha|Bhadrapada)/i, ' $1').trim().toLowerCase();
      if (!moonNakStable) issues.push("the Moon's nakshatra is uncertain with an approximate birth time");
      else if (planet('Moon').nakshatra.name.toLowerCase() !== claimed) issues.push(`the birth nakshatra is ${planet('Moon').nakshatra.name}, not ${claimed}`);
    }

    // Retrograde, dignity, combustion (natal).
    if (!transitSentence) {
      for (const m of Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b(?:['’]s)?\\s+(?:is\\s+|was\\s+|being\\s+)?(not\\s+)?(retrograde|exalted|debilitated|combust|in (?:its|his|her) own sign)`, 'gi')))) {
        const g = planetOf(m[1]); const negated = Boolean(m[2]) || negatedBefore(s, m.index!); const what = m[3].toLowerCase();
        if (approx) {
          const ps = st.planets[g];
          const known = what === 'retrograde' ? ps.retrograde : what === 'combust' ? ps.combust : ps.dignity && ps.sign;
          if (!known) { if (!negated) issues.push(`${g}'s ${what === 'retrograde' || what === 'combust' ? what : 'dignity'} state changes during the birth date, so it is uncertain`); continue; }
        }
        // Retrograde and combustion are states of the planet, the same in every chart; dignity is by the sign in the
        // chart the claim refers to (a divisional sign's dignity is judged by sign alone).
        for (const ref of what === 'retrograde' || what === 'combust' ? ['D1' as ChartRef] : chartsAt(m.index!, m.index! + m[0].length)) {
          let actual: boolean | null;
          if (what === 'retrograde') actual = g === 'Rahu' || g === 'Ketu' ? true : planet(g).retrograde;
          else if (g === 'Rahu' || g === 'Ketu') actual = null; // the engine assigns no dignity to the nodes
          else if (what === 'combust') actual = dignity(g)?.combust === true;
          else {
            const d = ref === 'D1' ? dignity(g)?.dignity : signDignity(g, placementIn(ref, g).signIndex);
            actual = what === 'exalted' ? d === 'Exalted' : what === 'debilitated' ? d === 'Debilitated' : d === 'Own sign' || d === 'Moolatrikona';
          }
          if (actual === null) { if (!negated) issues.push(`no ${what} status is calculated for ${g}`); }
          else if (actual === negated) issues.push(`${g} is ${actual ? '' : 'not '}${what}${inChart(ref)}`);
        }
      }
    }

    // Yogas.
    // The generic Raja Yoga name must not match inside Neecha Bhanga / Vipreeta Raja Yoga.
    const withoutCompoundRaja = s.replace(/\b(neecha[ -]?bhanga|(?:harsha|sarala|vimala)? ?vipa?reeta?) raja? yoga\b/gi, (x) => ' '.repeat(x.length));
    for (const [re, engineName] of YOGA_CATALOGUE) {
      const m = (engineName === 'Raja Yoga' ? withoutCompoundRaja : s).match(re);
      if (!m) continue;
      const negated = negatedBefore(s, m.index!);
      if (approx && engineName && !yogaTimeStable(engineName, st)) {
        if (!negated) issues.push(`${engineName} depends on the Lagna or a sign that changes during the birth date, so it cannot be stated with an approximate birth time`);
        continue;
      }
      if (engineName === 'Kemadruma Yoga') {
        const k = chart.yogas.find((y) => y.name === 'Kemadruma Yoga');
        if (!negated && (!k || k.cancelled)) issues.push('Kemadruma Yoga is not present (or is cancelled) in this chart');
        if (negated && k && !k.cancelled) issues.push('Kemadruma Yoga is present in this chart');
        continue;
      }
      if (!negated && (!engineName || !yogas.has(engineName))) issues.push(`${engineName ?? m[0]} is not among this chart's calculated yogas`);
    }

    // Doshas.
    for (const [re, id] of DOSHA_CATALOGUE) {
      const m = s.match(re);
      if (!m) continue;
      const negated = negatedBefore(s, m.index!);
      let present: boolean | null;
      if (id === 'sadeSati') present = sadeSatiActive;
      else if (id) present = chart.doshas.find((d) => d.id === id)?.present ?? null;
      else present = null;
      if (id === 'mangal' && approx) { if (!negated) issues.push('Mangal Dosha depends on the houses, which an approximate birth time cannot support'); continue; }
      if (approx && (id === 'kaalSarp' || id === 'pitru' || id === 'vishaYoga') && !st.doshas[id]) { if (!negated) issues.push(`${m[0]} changes during the birth date, so it cannot be stated with an approximate birth time`); continue; }
      if (id === 'sadeSati' && ctx.transits && present === null) { issues.push('Sade Sati cannot be determined: the natal Moon sign is uncertain'); continue; }
      if (present === null) { if (!negated) issues.push(`${m[0]} is not calculated for this chart`); continue; }
      if (id === 'mangal' && chart.doshas.find((d) => d.id === 'mangal')?.cancelledBy?.length && /\b(cancel(?:led|ed|s|lation)?|neutrali[sz]ed|nullified|bhanga)\b/i.test(s)) continue;
      if (present === negated) issues.push(`${m[0]} is ${present ? 'present' : 'not present'} in this chart`);
    }

    if (!approx) {
      // Sarvashtakavarga figures stated for a house must be the chart's own.
      for (const c of houseBinduClaims(s)) {
        const actual = chart.strength.ashtakavarga.savByHouse[c.house - 1];
        if (actual !== c.bindus && !negatedBefore(s, c.at)) issues.push(`the ${ORD(c.house)} house has ${actual} Sarvashtakavarga bindus, not ${c.bindus}`);
      }
      // Neecha Bhanga: only for a debilitated planet whose debilitation the engine found cancelled.
      const nbRe = new RegExp(NB_PHRASE, 'gi');
      const phrases = Array.from(s.matchAll(nbRe)).map((m) => m.index!);
      if (phrases.length) {
        const cancelled = (g: Graha) => dignity(g)?.dignity === 'Debilitated' && !!dignity(g)?.neechaBhanga;
        const deniedAt = (at: number) => /\b(?:no|not|never|without|lacks?|isn['’]t|wasn['’]t|doesn['’]t|does not|nor)\b[^.]{0,12}$/i.test(s.slice(Math.max(0, at - 30), at));
        const named = [
          ...Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b(?:['’]s)?\\s+${NB_LEAD}(?=${NB_PHRASE})`, 'gi'))).map((m) => ({ g: planetOf(m[1]), at: m.index! + m[0].length })),
          ...Array.from(s.matchAll(new RegExp(`${NB_PHRASE}\\s+(?:of|for|on)\\s+(?:the\\s+)?${PLANET}\\b`, 'gi'))).map((m) => ({ g: planetOf(m[1]), at: m.index! })),
        ];
        for (const { g, at } of named) {
          const claimed = !deniedAt(at);
          if (cancelled(g) !== claimed) {
            issues.push(cancelled(g) ? `${g}'s debilitation is cancelled (Neecha Bhanga) in this chart`
              : dignity(g)?.dignity === 'Debilitated' ? `${g}'s debilitation is not cancelled (no Neecha Bhanga) in this chart`
                : `${g} is not debilitated, so there is no Neecha Bhanga for it`);
          }
        }
        const anyCancelled = chart.strength.dignities.some((d) => d.dignity === 'Debilitated' && d.neechaBhanga);
        // A sentence about this chart (not a definition of the term) must not claim a cancellation the engine did not find.
        if (!named.length && !anyCancelled && /\b(?:your|you have|this chart|the chart)\b/i.test(s) && phrases.some((at) => !deniedAt(at))) issues.push('no planet in this chart has a cancelled debilitation (Neecha Bhanga)');
      }
    }

    // A flat statement of a life area's verdict must not reverse the engine's.
    const plain = s.replace(/[*_`#]/g, '');
    if (!QUALIFIED.test(plain)) {
      const m = plain.match(VERDICT_CLAIM);
      const domain = m && !NEGATION.test(m[0]) ? DOMAIN_TERMS.find(([, t]) => new RegExp(`^(?:${t})$`, 'i').test(m[1]))?.[0] : undefined;
      if (m && domain) {
        verdicts ??= new Map(buildInsights(chart, ctx.asOf).domains.map((d) => [d.domain, d.verdict]));
        const v = verdicts.get(domain)!;
        const claimedNegative = NEGATIVE_WORD.test(m[2]);
        if ((claimedNegative && POSITIVE_VERDICTS.includes(v)) || (!claimedNegative && NEGATIVE_VERDICTS.includes(v))) {
          issues.push(`the calculated verdict for ${DOMAIN_LABELS[domain]} is ${v}, not ${m[2].toLowerCase()}`);
        }
      }
    }

    // Running periods.
    const periodClaims = [
      ...Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b(?:['’]s)?\\s*[- ]?\\s*(maha\\s?dasha|mahadasa|dasha|dasa|antar\\s?dasha|antardasa|bhukti|sub-?period)`, 'gi'))).map((m) => ({ index: m.index!, end: m.index! + m[0].length, planet: m[1], level: m[2] })),
      ...Array.from(s.matchAll(new RegExp(`\\b(maha\\s?dasha|dasha|antar\\s?dasha|bhukti)\\s+of\\s+${PLANET}\\b`, 'gi'))).map((m) => ({ index: m.index!, end: m.index! + m[0].length, planet: m[2], level: m[1] })),
    ].sort((a, b) => a.index - b.index);
    for (let i = 0; i < periodClaims.length; i++) { const m = periodClaims[i];
      // "current" belongs to the period it sits beside: in "use the current Saturn Antardasha to prepare for
      // the Mercury Antardasha" only Saturn is claimed to run now. Each claim's span runs from the previous
      // period mention to the next.
      const span = s.slice(i ? periodClaims[i - 1].end : 0, periodClaims[i + 1]?.index ?? s.length);
      if (!CURRENT.test(span) || negatedBefore(s, m.index)) continue;
      const g = planetOf(m.planet);
      const antar = /antar|bhukti|sub/i.test(m.level);
      if (!ctx.running) { issues.push('no running period is available for this chart'); continue; }
      if (antar) {
        if (!ctx.timing.antardashaReliable) issues.push('the current Antardasha is uncertain with an approximate birth time');
        else if (ctx.running.antardasha !== g) issues.push(`the running Antardasha is ${ctx.running.antardasha ?? 'not available'}, not ${g}`);
      } else {
        if (!ctx.timing.mahadashaReliable) issues.push('the current Mahadasha is uncertain with an approximate birth time');
        else if (ctx.running.mahadasha !== g) issues.push(`the running Mahadasha is ${ctx.running.mahadasha}, not ${g}`);
      }
    }
  }

  // Period boundaries (exact time): a stated start or end of a Mahadasha or Antardasha must be the
  // calculated one, checked against the dasha calculation itself, not against the years in the text.
  // With an approximate time no dasha date may be stated at all (the rule above).
  const verifiedYears = new Set<string>();
  if (!approx) {
    for (const s of sentences(answer)) {
      for (const c of periodBoundaryClaims(s)) {
        const dates = boundaryDates(chart, c, s, ctx.asOf);
        if (!dates.length) continue;
        if (dates.some((d) => matchesDate(d, c))) verifiedYears.add(String(c.year));
        else issues.push(`the ${c.lord} ${c.level === 'antar' ? 'Antardasha' : c.level === 'maha' ? 'Mahadasha' : 'period'} ${c.edge === 'start' ? 'begins' : 'ends'} in ${Array.from(new Set(dates.map((d) => d.slice(0, 4)))).join(' or ')}, not ${c.year}`);
      }
    }
  }

  // Calendar years: a year the answer names must be one the facts state, or lie inside a timing
  // range they state. Naming a year is not a claim that anything is timed to it.
  const allowedYears = new Set(Array.from(ctx.packetText.matchAll(/\b(1[89]\d{2}|2[01]\d{2})\b/g)).map((m) => m[1]));
  allowedYears.add(String(ctx.asOf.getUTCFullYear()));
  const ranges = suppliedRanges(ctx.packetText, approx);
  for (const m of Array.from(answer.matchAll(/\b(1[89]\d{2}|2[01]\d{2})\b/g))) {
    const y = Number(m[1]);
    if (!allowedYears.has(m[1]) && !verifiedYears.has(m[1]) && !ranges.some(([a, b]) => a <= y && y <= b)) issues.push(`the year ${m[1]} is not in the calculated timing`);
  }

  return Array.from(new Set(issues));
}
