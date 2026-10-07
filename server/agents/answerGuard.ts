/**
 * Answer guard v2: every checkable astrological claim in an AI answer is
 * compared with the deterministic chart. A claim that is wrong, or that the
 * engine never produced (an invented yoga, dosha, period, date), is an issue.
 * The guard is deliberately conservative: an unverifiable affirmative claim
 * counts as an issue, because the fallback is a correct deterministic answer.
 */
import { SIGN_NAMES, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { NAKSHATRAS } from '../astroEngine/vedic.js';

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
const CURRENT = /\b(current(?:ly)?|running|now|present(?:ly)?|ongoing|you are (?:in|going through|under)|you['’]re (?:in|going through|under)|at the moment|these days)\b/i;

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

// ── The validator ────────────────────────────────────────────────────────────

export function validateAnswer(answer: string, ctx: GuardContext): string[] {
  const { chart } = ctx;
  const issues: string[] = [];
  const approx = chart.birth.timeAccuracy === 'approximate';
  const planet = (g: Graha) => chart.planets.find((p) => p.name === g)!;
  const dignity = (g: Graha) => chart.strength.dignities.find((d) => d.planet === g);
  const yogas = presentYogas(chart);
  const sadeSatiActive = ctx.transits ? /Sade Sati ACTIVE/.test(ctx.transits) : null;

  for (const s of sentences(answer)) {
    const transitSentence = TRANSIT_CONTEXT.test(s) && !/\b(birth|natal|born|chart)\b/i.test(s);

    // Planet in sign (natal). Transit sentences are about the sky today, not the chart.
    if (!transitSentence) {
      for (const m of Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b(?:['’]s)?\\s+(?:is\\s+|sits\\s+|placed\\s+|posited\\s+|located\\s+|was\\s+)?(?:in|into)\\s+(?:the\\s+sign\\s+(?:of\\s+)?)?${SIGN}\\b`, 'gi')))) {
        const g = planetOf(m[1]); const claimed = cap(m[2]);
        if (planet(g).sign !== claimed && !negatedBefore(s, m.index!)) issues.push(`${g} is in ${planet(g).sign}, not ${claimed}`);
      }
    }

    // Houses and Lagna.
    const houseMatches = Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b\\s+(?:is\\s+|sits\\s+|placed\\s+|was\\s+)?in\\s+(?:your\\s+|the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\s+house`, 'gi')));
    const lagnaClaim = s.match(new RegExp(`\\b(?:lagna|ascendant|rising sign)\\b(?:\\s+is|\\s+in|:)?\\s+${SIGN}`, 'i'));
    if (approx) {
      if ((houseMatches.length || /\b\d{1,2}(?:st|nd|rd|th) house\b/i.test(s) || /\b(lagna|ascendant|rising sign)\b/i.test(s)) && !NEGATION.test(s)) {
        issues.push('the birth time is approximate, so houses and the Lagna must not be stated');
      }
    } else if (!transitSentence) {
      for (const m of houseMatches) {
        const g = planetOf(m[1]);
        if (planet(g).house !== Number(m[2])) issues.push(`${g} is in the ${ORD(planet(g).house)} house, not the ${ORD(Number(m[2]))}`);
      }
      if (lagnaClaim && cap(lagnaClaim[1]) !== chart.ascendant.sign) issues.push(`the Lagna is ${chart.ascendant.sign}, not ${cap(lagnaClaim[1])}`);
    }

    // Nakshatra.
    const moonNakStable = !approx || chart.uncertainty.moonNakshatraStableAcrossBirthDate;
    for (const m of Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b[^.]{0,25}?\\b(?:in|occupies)\\s+(?:the\\s+)?${NAK}\\b`, 'gi')))) {
      if (transitSentence) continue;
      const g = planetOf(m[1]); const claimed = m[2].replace(/[ -]?(Phalguni|Ashadha|Bhadrapada)/i, ' $1').trim().toLowerCase();
      if (g === 'Moon' && !moonNakStable) { issues.push("the Moon's nakshatra is uncertain with an approximate birth time"); continue; }
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
        let actual: boolean | null;
        if (what === 'retrograde') actual = g === 'Rahu' || g === 'Ketu' ? true : planet(g).retrograde;
        else if (g === 'Rahu' || g === 'Ketu') actual = null; // the engine assigns no dignity to the nodes
        else if (what === 'exalted') actual = dignity(g)?.dignity === 'Exalted';
        else if (what === 'debilitated') actual = dignity(g)?.dignity === 'Debilitated';
        else if (what === 'combust') actual = dignity(g)?.combust === true;
        else actual = dignity(g)?.dignity === 'Own sign' || dignity(g)?.dignity === 'Moolatrikona';
        if (actual === null) { if (!negated) issues.push(`no ${what} status is calculated for ${g}`); }
        else if (actual === negated) issues.push(`${g} is ${actual ? '' : 'not '}${what}`);
      }
    }

    // Yogas.
    // The generic Raja Yoga name must not match inside Neecha Bhanga / Vipreeta Raja Yoga.
    const withoutCompoundRaja = s.replace(/\b(neecha[ -]?bhanga|(?:harsha|sarala|vimala)? ?vipa?reeta?) raja? yoga\b/gi, (x) => ' '.repeat(x.length));
    for (const [re, engineName] of YOGA_CATALOGUE) {
      const m = (engineName === 'Raja Yoga' ? withoutCompoundRaja : s).match(re);
      if (!m) continue;
      const negated = negatedBefore(s, m.index!);
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
      if (present === null) { if (!negated) issues.push(`${m[0]} is not calculated for this chart`); continue; }
      if (present === negated) issues.push(`${m[0]} is ${present ? 'present' : 'not present'} in this chart`);
    }

    // Running periods.
    const periodClaims = [
      ...Array.from(s.matchAll(new RegExp(`\\b${PLANET}\\b(?:['’]s)?\\s*[- ]?\\s*(maha\\s?dasha|mahadasa|dasha|dasa|antar\\s?dasha|antardasa|bhukti|sub-?period)`, 'gi'))).map((m) => ({ index: m.index!, planet: m[1], level: m[2] })),
      ...Array.from(s.matchAll(new RegExp(`\\b(maha\\s?dasha|dasha|antar\\s?dasha|bhukti)\\s+of\\s+${PLANET}\\b`, 'gi'))).map((m) => ({ index: m.index!, planet: m[2], level: m[1] })),
    ];
    for (const m of periodClaims) {
      if (!CURRENT.test(s) || negatedBefore(s, m.index)) continue;
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

  // Dates: any year the answer names must come from the supplied facts.
  const allowedYears = new Set(Array.from(ctx.packetText.matchAll(/\b(1[89]\d{2}|2[01]\d{2})\b/g)).map((m) => m[1]));
  allowedYears.add(String(ctx.asOf.getUTCFullYear()));
  for (const m of Array.from(answer.matchAll(/\b(1[89]\d{2}|2[01]\d{2})\b/g))) {
    if (!allowedYears.has(m[1])) issues.push(`the year ${m[1]} is not in the calculated timing`);
  }

  return Array.from(new Set(issues));
}

