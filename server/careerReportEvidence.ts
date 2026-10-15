/**
 * Career & Profession Report, facts-first: every astrological statement in the report is written here, in
 * plain English, from the canonical chart. The model only explains these facts (careerReportRendering.ts).
 */
import { GRAHAS, SIGN_NAMES, isCurrentCanonicalChart, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { savReading } from '@shared/v3/ashtakavargaPolicy';
import { careerBrief, d10LagnaWindow, type CareerBrief, type FieldId } from './careerReport';
import { ReportGenerationError } from './reportQuality';
import { computeCanonicalChart } from './astroEngine/canonical/compute';
import { DOMAIN_SPECS } from './astroEngine/evidence/engine';
import { signDignity } from './astroEngine/dignity';

export const CAREER_HEADINGS = ['Career Overview', 'Favourable & Difficult Periods', 'Your Birth Chart', 'Current Career Situation', 'Personalised Guidance'] as const;
export type SectionKey = 'overview' | 'periods' | 'chart' | 'current' | 'guidance';
export type WorkStyle = 'employment' | 'independent' | 'mixed';

export interface CareerFact {
  id: string;
  /** Reader-facing sentence(s), written by code from the chart. */
  text: string;
  /** Its explanation is mandatory; the report fails rather than omit it. */
  required: boolean;
  /** False for facts shown without an explanation (caveats, planning dates). */
  explain: boolean;
  /** A D10 fact: a house its explanation names is read in the D10 unless it says D1. */
  chart?: 'D10';
}
export interface CareerSectionFacts {
  key: SectionKey;
  heading: (typeof CAREER_HEADINGS)[number];
  /** What the section's interpretation is for (to the model). */
  purpose: string;
  facts: CareerFact[];
  /** Personalised Guidance also asks for 3–5 next steps. */
  steps: boolean;
}
export interface CareerReportFacts {
  chart: CanonicalChart;
  brief: CareerBrief;
  asOf: Date;
  workStyle: WorkStyle;
  /** The plain-words conclusion every section must agree with. */
  workStyleSentence: string;
  weakFields: FieldId[];
  sections: CareerSectionFacts[];
}

const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Engine boundaries are UTC instants; the report states their UTC calendar date. */
export const dateOf = (iso: string) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const DIGNITY_WORDS: Record<string, string> = {
  Exalted: 'exalted (its strongest sign)', Moolatrikona: 'in its Moolatrikona sign (a strong placement)', 'Own sign': 'in its own sign (a strong placement)',
  "Friend's sign": 'in a friendly sign', 'Neutral sign': 'in a neutral sign', "Enemy's sign": "in an enemy's sign", Debilitated: 'debilitated (its weakest sign)',
};
/** "the Sun", "the Moon"; other planets take no article. */
const the = (g: string) => (g === 'Sun' || g === 'Moon' ? `the ${g}` : g);
const The = (g: string) => (g === 'Sun' || g === 'Moon' ? `The ${g}` : g);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Jupiter rules your 10th house and rules the D10 Lagna": consecutive reasons about one planet share its name. */
const grouped = (reasons: string[]) => {
  const out: Array<{ subject: string | null; preds: string[] }> = [];
  for (const r of reasons) {
    const m = r.match(new RegExp(`^(?:the )?(${GRAHAS.join('|')}) (.+)$`));
    const last = out[out.length - 1];
    if (m && last?.subject === m[1]) last.preds.push(m[2]);
    else out.push(m ? { subject: m[1], preds: [m[2]] } : { subject: null, preds: [r] });
  }
  const parts = out.map((o) => (o.subject ? `${o.subject === 'Sun' || o.subject === 'Moon' ? `the ${o.subject}` : o.subject} ${listOf(o.preds)}` : o.preds[0]));
  // A group with its own "and" would run into the next: separate groups with semicolons then.
  return out.some((o) => o.preds.length > 1) && parts.length > 1 ? `${parts.slice(0, -1).join('; ')}; and ${parts[parts.length - 1]}` : listOf(parts);
};
const STRONG = ['Exalted', 'Moolatrikona', 'Own sign'];

/** Recompute with the same engine; a stored chart that differs is refused before any spending. */
export function verifiedCareerChart(kundli: any): CanonicalChart {
  const stored = kundli?.chartData?.canonical;
  if (!isCurrentCanonicalChart(stored) || stored.birth.timeAccuracy !== 'exact') throw new ReportGenerationError('Career requires a complete canonical chart and exact birth time');
  const chart = computeCanonicalChart(stored.birth);
  for (const key of ['planets', 'ascendant', 'houses', 'aspects', 'vargas', 'dashas', 'yogas', 'strength'] as const) {
    if (JSON.stringify(chart[key]) !== JSON.stringify(stored[key])) throw new ReportGenerationError(`Career canonical verification failed: ${key}`);
  }
  return chart;
}

export function buildCareerReportFacts(kundli: unknown, asOf: Date): CareerReportFacts {
  const chart = verifiedCareerChart(kundli);
  const brief = careerBrief({ chartData: { canonical: chart } }, asOf);
  if (!brief) throw new ReportGenerationError('Career evidence unavailable for this chart');
  const planet = (g: string) => chart.planets.find((p) => p.name === g)!;
  const dignity = (g: string) => chart.strength.dignities.find((d) => d.planet === g);
  const d10 = (g: string) => chart.vargas.D10.placements.find((p) => p.planet === g)!;
  const house = (h: number) => chart.houses[h - 1];
  const rules = (g: string) => chart.houses.filter((h) => h.lord === g).map((h) => h.house);
  const sav = chart.strength.ashtakavarga.savByHouse;
  const tenthLord = house(10).lord as Graha;
  const lagnaLord = house(1).lord as Graha;
  const d10LagnaLord = brief.facts.d10LagnaLord, d10TenthLord = brief.facts.d10TenthLord;
  const karakas = DOMAIN_SPECS.career.karakas as readonly Graha[];
  const aspecting10 = chart.aspects.filter((a) => a.aspectsHouses.includes(10)).map((a) => a.planet as Graha);

  // "in Capricorn in your 11th house, where it is debilitated, though the debilitation is cancelled (Neecha Bhanga)"
  const condition = (g: string) => {
    const p = planet(g), d = dignity(g);
    const state = d ? [d.dignity === 'Debilitated' && d.neechaBhanga ? 'debilitated (its weakest sign), though the debilitation is cancelled (Neecha Bhanga)' : DIGNITY_WORDS[d.dignity] ?? d.dignity.toLowerCase(),
      d.combust && 'combust (close to the Sun)', d.retrograde && 'retrograde'].filter(Boolean) as string[] : [];
    return `in ${p.sign} in your ${ord(p.house)} house${state.length ? `, where it is ${listOf(state)}` : ''}`;
  };
  const d10Condition = (g: string) => {
    const p = d10(g), d = signDignity(g, p.signIndex);
    return `in the D10 it is in ${p.sign} in the ${ord(p.house)} house${d && d !== 'Neutral sign' ? `, ${DIGNITY_WORDS[d]}` : ''}`;
  };
  const rulesText = (g: string) => (rules(g).length ? `rules your ${listOf(rules(g).map(ord))} house${rules(g).length > 1 ? 's' : ''}` : '');
  const savText = (h: number) => `${sav[h - 1]} points (${savReading(sav[h - 1]).label.toLowerCase()})`;
  const savBrief = (h: number) => `${house(h).sign}; ${sav[h - 1]} points, ${savReading(sav[h - 1]).label.toLowerCase()}`;
  // "the ruler of your 10th house of career and the D10 Lagna, and a natural significator of career"
  const roles = (g: Graha) => {
    const ruled = [g === tenthLord && 'your 10th house of career', g === lagnaLord && 'your Lagna', g === d10LagnaLord && 'the D10 Lagna', g === d10TenthLord && "the D10's 10th house"].filter(Boolean) as string[];
    return [ruled.length && `the ruler of ${listOf(ruled)}`, karakas.includes(g) && 'a natural significator of career'].filter(Boolean).join(ruled.length > 1 ? ', and ' : ' and ');
  };

  // ── Work style: the 6th house of service against the 7th of trade, with the business assessment. ──
  const direction = (h: number) => ({ positive: 1, neutral: 0, negative: -1 })[savReading(sav[h - 1]).direction];
  const business = brief.fields.find((f) => f.id === 'business')!;
  const service = direction(6), trade = direction(7) + (business.rating === 'well supported' ? 1 : business.rating === 'weakly supported' ? -1 : 0);
  const workStyle: WorkStyle = trade - service >= 2 ? 'independent' : service - trade >= 2 ? 'employment' : 'mixed';
  const workStyleSentence = { employment: 'the chart favours employment within an organisation over independent business', independent: 'the chart favours independent work or business over salaried employment', mixed: 'the chart supports a mix of employment and independent work rather than one alone' }[workStyle];

  // ── Overview ──
  const rank = (g: Graha) => { const d = dignity(g); const base = { Exalted: 5, Moolatrikona: 4, 'Own sign': 4, "Friend's sign": 2, 'Neutral sign': 1, "Enemy's sign": 0, Debilitated: d?.neechaBhanga ? 0 : -2 }[d?.dignity ?? 'Neutral sign'] ?? 1; return base - (d?.combust ? 1 : 0); };
  const careerPlanets = Array.from(new Set([tenthLord, d10LagnaLord, d10TenthLord, lagnaLord, ...karakas]));
  const byRank = careerPlanets.slice().sort((a, b) => rank(b) - rank(a) || careerPlanets.indexOf(a) - careerPlanets.indexOf(b));
  const strongest = byRank[0], weakest = byRank[byRank.length - 1];
  const RATING_ORDER = { 'well supported': 0, mixed: 1, 'weakly supported': 2 } as const;
  const fieldsRanked = brief.fields.slice().sort((a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating] || (b.plus.length - b.minus.length) - (a.plus.length - a.minus.length));
  const well = fieldsRanked.filter((f) => f.rating === 'well supported');
  const top = fieldsRanked.filter((f) => f.rating !== 'weakly supported').slice(0, 2);
  const NUMBERS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
  // Every well-supported field is acknowledged; the "strongest" are those with the most reasons for and fewest against.
  const fieldsSentence = () => {
    if (!top.length) return 'None of the six professional fields assessed is well supported in this chart; Personalised Guidance explains each one.';
    if (well.length > 2) return `${NUMBERS[well.length]} of the six professional fields assessed are well supported: ${listOf(well.map((f) => f.label.toLowerCase()))}. Of these, ${listOf(well.slice(0, 2).map((f) => f.label.toLowerCase()))} have the most in their favour and the least against them. Personalised Guidance compares all six.`;
    if (well.length) return `Of the six professional fields assessed, ${well.length === 2 ? `two are well supported: ${listOf(well.map((f) => f.label.toLowerCase()))}` : `one is well supported: ${well[0].label.toLowerCase()}`}. Personalised Guidance compares all six.`;
    return `None of the six professional fields assessed is well supported; the best are ${listOf(top.map((f) => f.label.toLowerCase()))}, rated mixed. Personalised Guidance compares all six.`;
  };
  const overview: CareerFact[] = [
    { id: 'overview.workStyle', required: true, explain: true, text: `Weighing your 6th house of service and employment (${savBrief(6)}) against your 7th house of partnership and trade (${savBrief(7)}), together with the business assessment (${business.rating}), ${workStyleSentence}.` },
    { id: 'overview.fields', required: true, explain: true, text: fieldsSentence() },
    { id: 'overview.strength', required: true, explain: true, text: `Of the planets that govern your career, the best placed is ${the(strongest)}, ${roles(strongest)}. It is ${condition(strongest)}.${STRONG.includes(dignity(strongest)?.dignity ?? '') ? '' : ' That is a moderate placement rather than a strong one: none of your career planets is in its own, Moolatrikona or exaltation sign.'}` },
  ];
  if (weakest !== strongest && rank(weakest) < rank(strongest)) overview.push({ id: 'overview.caution', required: true, explain: true, text: `The most challenged is ${the(weakest)}, ${roles(weakest)}. It is ${condition(weakest)}.` });

  // ── Periods in the next four years, each with a tone the code derives from its lord. ──
  const end = new Date(asOf); end.setUTCFullYear(end.getUTCFullYear() + 4);
  const overlaps = (p: { start: string; end: string }) => Date.parse(p.end) > +asOf && Date.parse(p.start) < +end;
  const tone = (g: Graha) => {
    const d = dignity(g), p = planet(g), x = d10(g), xd = signDignity(g, x.signIndex);
    const plus = [
      d && STRONG.includes(d.dignity) && `is ${DIGNITY_WORDS[d.dignity].split(' (')[0]} in your birth chart`,
      d?.dignity === "Friend's sign" && 'is in a friendly sign',
      ...[10, 1, 11].filter((h) => rules(g).includes(h)).map((h) => `rules your ${ord(h)} house${h === 10 ? ' of career' : h === 11 ? ' of gains' : ''}`),
      [10, 11, 1].includes(p.house) && `sits in your ${ord(p.house)} house`,
      [1, 4, 7, 10].includes(x.house) && `is in an angular house of the D10 (the ${ord(x.house)})`,
      xd && STRONG.includes(xd) && 'is strong in the D10',
    ].filter(Boolean) as string[];
    const minus = [
      d?.dignity === 'Debilitated' && !d.neechaBhanga && 'is debilitated',
      d?.dignity === "Enemy's sign" && "is in an enemy's sign",
      d?.combust && 'is combust',
      ...[8, 12].filter((h) => rules(g).includes(h) && !rules(g).some((r) => [1, 10].includes(r))).map((h) => `rules your ${ord(h)} house`),
      [8, 12].includes(p.house) && `sits in your ${ord(p.house)} house`,
      [6, 8, 12].includes(x.house) && `falls in the D10's ${ord(x.house)} house`,
      xd && ['Debilitated', "Enemy's sign"].includes(xd) && `is ${xd === 'Debilitated' ? 'debilitated' : "in an enemy's sign"} in the D10`,
    ].filter(Boolean) as string[];
    const net = plus.length - minus.length;
    const label = net >= 2 ? 'mainly supportive' : net <= -2 ? 'mainly demanding' : 'mixed';
    const favour = plus.length ? `In its favour, ${the(g)} ${listOf(plus)}.` : '';
    const against = minus.length ? `Against it, ${the(g)} ${listOf(minus)}.` : '';
    return [`On balance this reads as a ${label} period for career.`, favour, against].filter(Boolean).join(' ');
  };
  const periods: CareerFact[] = chart.dashas.vimshottari.mahadashas.filter(overlaps).flatMap((m) => [
    { id: `period.Mahadasha.${m.lord}.${m.start.slice(0, 10)}`, required: true, explain: true, text: `${m.lord} Mahadasha (major period), ${dateOf(m.start)} to ${dateOf(m.end)}. ${tone(m.lord as Graha)}` },
    ...m.antardashas.filter(overlaps).map((a) => ({ id: `period.Antardasha.${a.lord}.${a.start.slice(0, 10)}`, required: true, explain: true, text: `${a.lord} Antardasha (sub-period) within the ${m.lord} Mahadasha, ${dateOf(a.start)} to ${dateOf(a.end)}. ${tone(a.lord as Graha)}` })),
  ]);

  // ── Your Birth Chart ──
  // The engine's configuration in words, naming the planets; its one-line promise ("status and success") is not a chart fact.
  const yogaName = (y: CanonicalChart['yogas'][number]) => (y.name === 'Neecha Bhanga Raja Yoga' ? 'Neecha Bhanga (a cancelled debilitation)' : y.name);
  const yogaConfiguration = (y: CanonicalChart['yogas'][number]) => {
    const [g] = y.planets, p = planet(g), d = dignity(g);
    const raja = y.description.match(/(\d+\w\w) \(kendra\) and (\d+\w\w) \(trikona\) unite in the (\d+\w\w) house/);
    const dhana = y.description.match(/\((\d+\w\w) & (\d+\w\w)\) combine in the (\d+\w\w) house/);
    const vipreeta = y.description.match(/^(\d+\w\w) lord \((\w+)\) sits in the (\d+\w\w)/);
    if (y.category === 'Mahapurusha') return `${The(g)} is ${(DIGNITY_WORDS[d?.dignity ?? ''] ?? '').split(' (')[0]} in your ${ord(p.house)} house, an angular house`;
    if (y.name === 'Neecha Bhanga Raja Yoga') return `${The(g)}'s debilitation in ${p.sign} is cancelled, which softens that weakness`;
    if (raja) return `${listOf(y.planets.map(the))}, the lords of your ${raja[1]} house (angular) and ${raja[2]} house (trinal), are together in your ${raja[3]} house`;
    if (dhana) return `${listOf(y.planets.map(the))}, the lords of your ${dhana[1]} and ${dhana[2]} houses (traditionally linked with wealth), are together in your ${dhana[3]} house`;
    if (vipreeta) return `${vipreeta[2]}, the lord of your ${vipreeta[1]} house, sits in your ${vipreeta[3]} house; both are traditionally difficult houses`;
    if (y.planets.length === 2 && planet(y.planets[0]).house === planet(y.planets[1]).house) return `${The(y.planets[0])} and ${the(y.planets[1])} are together in your ${ord(p.house)} house`;
    return y.description.split(' — ')[0];
  };
  const occ = house(10).occupants;
  const window = d10LagnaWindow(chart);
  const d10Lagna = SIGN_NAMES[chart.vargas.D10.ascendantSignIndex];
  const d10TenthOcc = chart.vargas.D10.placements.filter((p) => p.house === 10).map((p) => p.planet);
  // At most four career-linked yogas, those with the most links first: one section must fit one reply.
  const yogaFacts = chart.yogas.filter((y) => !y.cancelled).flatMap((y, i) => {
    const links = Array.from(new Set(y.planets.flatMap((g) => [
      g === tenthLord && `${g} rules your 10th house`, planet(g).house === 10 && `${g} sits in your 10th house`, aspecting10.includes(g as Graha) && `${g} aspects your 10th house`,
      g === d10LagnaLord && `${g} rules the D10 Lagna`, g === d10TenthLord && `${g} rules the D10's 10th house`, karakas.includes(g as Graha) && `${g} is a natural significator of career`,
    ].filter(Boolean) as string[])));
    if (!links.length) return [];
    return [{ id: `chart.yoga.${i}`, required: false, explain: true, text: `${yogaName(y)}: ${cap(yogaConfiguration(y))}. It bears on your career because ${grouped(links)}.`, links: links.length }];
  }).sort((a, b) => b.links - a.links).slice(0, 4).sort((a, b) => Number(a.id.split('.')[2]) - Number(b.id.split('.')[2])).map(({ links: _links, ...f }) => f);
  const chartFacts: CareerFact[] = [
    // One planet's placement is stated once: a lord that rules several of these houses is described at the first.
    { id: 'chart.lagna', required: false, explain: true, text: lagnaLord === tenthLord
      ? `Your rising sign (Lagna) is ${chart.ascendant.sign}. Its lord, ${the(lagnaLord)}, also rules your 10th house of career, so how you present yourself and your career are governed by the same planet; its placement follows.`
      : `Your rising sign (Lagna) is ${chart.ascendant.sign}. Its lord, ${the(lagnaLord)}, is ${condition(lagnaLord)}.` },
    { id: 'chart.tenth', required: true, explain: true, text: `Your 10th house, the house of career and public standing, is ${house(10).sign}. ${occ.length ? `${cap(listOf(occ.map(the)))} ${occ.length > 1 ? 'occupy' : 'occupies'} it` : 'No planet occupies it'}${aspecting10.length ? `, and ${listOf(aspecting10.map(the))} ${aspecting10.length > 1 ? 'aspect' : 'aspects'} it` : ''}. Its Sarvashtakavarga score, a traditional tally of support, is ${savText(10)}.` },
    { id: 'chart.tenthLord', required: true, explain: true, text: `The lord of your 10th house, ${the(tenthLord)}, is ${condition(tenthLord)}. In the D10 it is ${d10Condition(tenthLord).replace(/^in the D10 it is /, '')}.` },
    { id: 'chart.d10Lagna', required: true, explain: true, chart: 'D10', text: `In the D10 (Dasamsa), the divisional chart read for profession, the rising sign is ${d10Lagna}. ${d10LagnaLord === tenthLord
      ? `Its lord is again ${the(d10LagnaLord)}, your 10th lord, whose D10 placement is given above.`
      : `Its lord, ${the(d10LagnaLord)}, is in ${d10(d10LagnaLord).sign} in the D10's ${ord(d10(d10LagnaLord).house)} house.`}` },
    { id: 'chart.d10Tenth', required: true, explain: true, chart: 'D10', text: `The D10's 10th house is ${brief.facts.d10TenthSign}, and its lord, ${the(d10TenthLord)}, ${d10TenthLord === tenthLord || d10TenthLord === d10LagnaLord
      ? `is the planet described above, in the D10's ${ord(d10(d10TenthLord).house)} house`
      : `is in ${d10(d10TenthLord).sign} in the D10's ${ord(d10(d10TenthLord).house)} house`}. ${d10TenthOcc.length ? `${cap(listOf(d10TenthOcc.map(the)))} ${d10TenthOcc.length > 1 ? 'occupy' : 'occupies'} the D10's 10th house.` : "No planet occupies the D10's 10th house."}` },
    ...karakas.filter((g) => ![tenthLord, d10LagnaLord, d10TenthLord].includes(g)).map((g) => ({ id: `chart.karaka.${g}`, required: false, explain: true, text: `${The(g)}, a natural significator of ${g === 'Saturn' ? 'work, duty and endurance' : 'authority and status'}, is ${condition(g)}. In the D10 it is ${d10Condition(g).replace(/^in the D10 it is /, '')}.` })),
    ...yogaFacts,
    { id: 'chart.caveat', required: false, explain: false, text: `The D10 depends on an accurate birth time: its rising sign stays ${d10Lagna} for a birth up to ${window.earlier ? `${window.earlier - 1} minute${window.earlier - 1 === 1 ? '' : 's'} earlier` : 'at least an hour earlier'} and ${window.later ? `${window.later - 1} minute${window.later - 1 === 1 ? '' : 's'} later` : 'at least an hour later'}.` },
  ];

  // ── Current Career Situation ──
  const now = (p: { start: string; end: string }) => Date.parse(p.start) <= +asOf && +asOf < Date.parse(p.end);
  const md = chart.dashas.vimshottari.mahadashas.find(now);
  if (!md) throw new ReportGenerationError('Career period coverage unavailable');
  const ad = md.antardashas.find(now);
  const nextAd = md.antardashas.find((a) => Date.parse(a.start) > +asOf) ?? chart.dashas.vimshottari.mahadashas.find((m) => m.start === md.end)?.antardashas[0];
  const lordText = (g: string) => `${The(g)} is ${condition(g)}.${rulesText(g) ? ` It ${rulesText(g)}.` : ''} In the D10 it is ${d10Condition(g).replace(/^in the D10 it is /, '')}.`;
  const current: CareerFact[] = [
    { id: 'current.mahadasha', required: true, explain: true, text: `You are in the ${md.lord} Mahadasha, the major period running from ${dateOf(md.start)} to ${dateOf(md.end)}. ${lordText(md.lord)}` },
    ...(ad ? [{ id: 'current.antardasha', required: true, explain: true, text: `Within it, the ${ad.lord} Antardasha (sub-period) runs from ${dateOf(ad.start)} to ${dateOf(ad.end)}. ${ad.lord === md.lord ? `It is ${the(md.lord)}'s own sub-period within its major period.` : lordText(ad.lord)}` }] : []),
    ...(nextAd ? [{ id: 'current.next', required: false, explain: true, text: `The next sub-period, the ${nextAd.lord} Antardasha, begins on ${dateOf(nextAd.start)}.` }] : []),
  ];

  // ── Personalised Guidance: the six field assessments, in words. ──
  const points = (h: string, n: string) => { const r = savReading(Number(n)); return `your ${h} house has ${r.direction === 'negative' ? 'only ' : ''}${n} points of support (${r.label.toLowerCase()})`; };
  const human = (s: string) => s
    .replace(/^(\w+) (exalted|moolatrikona|own sign)$/i, (_m, g, d) => `${g} is ${d.toLowerCase() === 'moolatrikona' ? 'in its Moolatrikona sign' : d.toLowerCase() === 'own sign' ? 'in its own sign' : 'exalted'}`)
    .replace(/^(\w+) (debilitated|combust)$/, '$1 is $2')
    .replace(/^(\w+) (rules|occupies|aspects) the 10th$/, '$1 $2 your 10th house')
    .replace(/^(\w+) rules the D10 Lagna$/, '$1 rules the D10 Lagna')
    .replace(/^(\w+) rules the D10 10th$/, "$1 rules the D10's 10th house")
    .replace(/^(\w+) in a D10 kendra \((\w+)\)$/, '$1 is in an angular house of the D10 (the $2)')
    .replace(/^(\d+\w\w) house (\d+) bindus$/, (_m, h, n) => points(h, n))
    .replace(/^(\d+\w\w) lord (\w+) in the (\d+\w\w)$/, 'the $1-house lord, $2, is in your $3 house')
    .replace(/^(\w+) in the (\d+\w\w) \(a dusthana\)$/, '$1 sits in your $2 house (a difficult house)')
    .replace(/^(Sun|Moon)\b/, 'the $1').replace(/, (Sun|Moon),/, ', the $1,');
  const fields: CareerFact[] = brief.fields.map((f) => ({
    id: `field.${f.id}`, required: f.rating !== 'weakly supported', explain: true,
    text: `${f.label}: ${f.rating}. ${f.plus.length ? `In its favour, ${grouped(f.plus.map(human))}.` : 'Nothing in the chart speaks clearly for it.'} ${f.minus.length ? `Against it, ${grouped(f.minus.map(human))}.` : 'No specific obstacle is indicated, which is not a guarantee.'}`,
  }));
  const planning = chart.dashas.vimshottari.mahadashas.flatMap((m) => m.antardashas.map((a) => ({ ...a, md: m.lord }))).filter(overlaps);
  const guidance: CareerFact[] = [
    ...fields,
    { id: 'guidance.timing', required: false, explain: false, text: `Planning dates: ${planning.map((a) => `the ${a.lord} Antardasha runs ${Date.parse(a.start) <= +asOf ? 'until' : `from ${dateOf(a.start)} to`} ${dateOf(a.end)}`).join('; ')}.` },
  ];

  // Each section has one job; what belongs to another is named so the model leaves it there.
  const sections: CareerSectionFacts[] = [
    { key: 'overview', heading: CAREER_HEADINGS[0], steps: false, facts: overview, purpose: 'Job: the big picture in plain terms: how this person is likely to work best (the arrangement), which fields stand out, and the one planet to lean on and the one to manage. Leave to other sections: what each field involves (Personalised Guidance), timing (Favourable & Difficult Periods) and chart detail (Your Birth Chart).' },
    { key: 'periods', heading: CAREER_HEADINGS[1], steps: false, facts: periods, purpose: 'Job: timing. For each period say what to do and when: push, consolidate, prepare or change, and what to watch, from the tone and reasons stated. Leave to other sections: the character of the running periods\' planets (Current Career Situation) and field choices (Personalised Guidance).' },
    { key: 'chart', heading: CAREER_HEADINGS[2], steps: false, facts: chartFacts, purpose: 'Job: the structure behind the career: what the 10th house, its lord, the D10 and the combinations say about the kind of work and working style that suit this person. Explain terms such as Lagna or D10 in passing. Leave to other sections: timing and field recommendations.' },
    { key: 'current', heading: CAREER_HEADINGS[3], steps: false, facts: current, purpose: 'Job: now. What the running Mahadasha and Antardasha mean for work at present, through the houses their lords rule and occupy and their D10 placement, and what changes at the next sub-period. Leave to other sections: the full four-year timeline and field choices.' },
    { key: 'guidance', heading: CAREER_HEADINGS[4], steps: true, facts: guidance, purpose: 'Job: decisions. For each field say what kinds of work it covers and why this chart supports or limits it. Then give 3 to 5 concrete, conditional next steps, each resting on the facts it cites; at least one must act on a well-supported field, and a step that names a date or year must cite the planning dates.' },
  ];
  return { chart, brief, asOf: new Date(asOf), workStyle, workStyleSentence, weakFields: brief.fields.filter((f) => f.rating === 'weakly supported').map((f) => f.id), sections };
}

/** Planet and sign names a fact mentions: the only ones an explanation of it may name. */
export const namesIn = (text: string) => ({
  planets: GRAHAS.filter((g) => new RegExp(`\\b${g}\\b`).test(text)),
  signs: SIGN_NAMES.filter((s) => new RegExp(`\\b${s}\\b`).test(text)),
});
