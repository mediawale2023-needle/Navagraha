/**
 * Career & Profession Report: the deterministic career evidence the model must build on, the career-only checks
 * its sections must pass, and the remedy safeguards. Every fact here is read from the canonical chart and the
 * engine's own derived data (house lords, aspects, dignities, vargas, Vimshottari, detected yogas); nothing is
 * calculated anew except the D10 Lagna's sensitivity to the birth time, which re-runs the engine's own angles.
 */
import { SIGN_NAMES, isCurrentCanonicalChart, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { savReading } from '@shared/v3/ashtakavargaPolicy';
import { julianDayUT, siderealAngles } from './astroEngine/canonical/compute.js';
import { dasamsaSign } from './astroEngine/vedic.js';
import { signDignity } from './astroEngine/dignity.js';
import { DOMAIN_SPECS } from './astroEngine/evidence/engine.js';

const SIGN_LORDS: Graha[] = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const EXALTATION_SIGN: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const KENDRA = [1, 4, 7, 10];
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export interface CareerFacts {
  tenthLord: Graha;
  tenthSign: string;
  d10LagnaSign: string;
  d10LagnaLord: Graha;
  d10TenthSign: string;
  d10TenthLord: Graha;
  mahadasha: Graha | null;
  antardasha: Graha | null;
  /** Planets a career remedy may address: the 10th lord, the D10 Lagna and 10th lords, the running period lords and the engine's career significators. */
  remedyPlanets: Graha[];
  /** The engine's detected yoga names; a section may name no other yoga. */
  yogaNames: string[];
  /** Family names of the detected yogas ("Pancha Mahapurusha Yoga" for Sasa Yoga). */
  yogaFamilies?: string[];
  /** Professional fields by the chart's indicator tally (traditional significations; see FIELDS). */
  fields?: Array<{ id: FieldId; label: string; rating: 'well supported' | 'mixed' | 'weakly supported' }>;
  /** Yogas with a link to the 10th house, its lord, the D10 or the career significators. */
  careerYogas?: string[];
  nextAntardasha?: Graha | null;
  /** The D10 Lagna changes within 10 minutes of birth time either way. */
  d10Sensitive?: boolean;
  /** Every date the engine gives for the periods named in the evidence (YYYY-MM-DD). */
  periodDates?: string[];
}

/**
 * The six professional fields the report may evaluate, with their traditional significators (karakas) and houses.
 * These are textbook significations, not an engine rule: the tally below only collects the chart facts that bear on
 * each field so the report recommends nothing the chart does not speak to.
 */
export type FieldId = 'administration' | 'government' | 'business' | 'advisory' | 'finance' | 'communication';
export const FIELDS: Record<FieldId, { label: string; planets: Graha[]; houses: number[]; words: RegExp }> = {
  administration: { label: 'Administration', planets: ['Saturn', 'Sun'], houses: [10, 6], words: /\badministrat\w*/i },
  government: { label: 'Government and institutional roles', planets: ['Sun', 'Jupiter'], houses: [10, 9], words: /\bgovernment\w*|\bpublic sector\b|\bcivil service\w*|\binstitution\w*/i },
  business: { label: 'Business and entrepreneurship', planets: ['Mercury', 'Mars'], houses: [7, 3, 11], words: /\bentrepreneur\w*|\bself-employ\w*|\bown (?:business|venture|firm)\b|\bstart(?:ing)? a business\b/i },
  advisory: { label: 'Advisory and consulting roles', planets: ['Jupiter', 'Mercury'], houses: [9, 5], words: /\badvis(?:ory|er|or|ing)\b|\bconsult\w*|\bcounsel\w*|\bmentor\w*|\bteach\w*/i },
  finance: { label: 'Finance and management', planets: ['Jupiter', 'Venus', 'Mercury'], houses: [2, 11], words: /\bfinanc\w*|\baccount(?:ing|ancy|ant)s?\b|\bbanking\b|\binvestment\w*/i },
  communication: { label: 'Communication and public-facing professions', planets: ['Mercury', 'Moon', 'Venus'], houses: [3, 7], words: /\bcommunicat\w*|\bmedia\b|\bjournalis\w*|\bwriting\b|\bsales\b|\bmarketing\b|\bpublic-facing\b|\bpublic relations\b/i },
};

export interface CareerBrief { text: string; facts: CareerFacts }

/** Birth-time sensitivity of the D10 Lagna: minutes earlier/later at which it would change (searched to ±60 min). */
function d10LagnaWindow(chart: CanonicalChart): { earlier: number | null; later: number | null } {
  const t0 = Date.parse(chart.birth.birthUTC);
  const at = (min: number) => dasamsaSign(siderealAngles(julianDayUT(new Date(t0 + min * 60_000)), chart.birth.latitude, chart.birth.longitude).ascendant);
  const base = chart.vargas.D10.ascendantSignIndex;
  const scan = (dir: 1 | -1) => { for (let m = 1; m <= 60; m++) if (at(dir * m) !== base) return m; return null; };
  return { earlier: scan(-1), later: scan(1) };
}

function dignityText(d: any | undefined): string {
  if (!d) return '';
  return `${d.dignity}${d.dignity === 'Debilitated' ? (d.neechaBhanga ? ', debilitation cancelled (Neecha Bhanga)' : ', no cancellation of the debilitation') : ''}${d.combust ? ', combust' : ''}${d.retrograde ? ', retrograde' : ''}`;
}

/**
 * The career evidence for an exact-time V3 chart, or null when the chart cannot support it (approximate time,
 * missing data). The text goes into the report prompt and the guard's facts; `facts` drives the section checks.
 */
export function careerBrief(kundli: any, asOf = new Date()): CareerBrief | null {
  const cd = kundli?.chartData ?? {};
  const chart = cd.canonical as CanonicalChart | undefined;
  if (!isCurrentCanonicalChart(chart) || chart.birth.timeAccuracy !== 'exact') return null;
  const houseLords: any[] = cd.bhava?.houseLords ?? [];
  const aspects: any[] = cd.bhava?.aspects ?? [];
  const dig = new Map<string, any>((chart.strength.dignities as any[]).map((d) => [d.planet, d]));
  const planet = (g: string) => chart.planets.find((p) => p.name === g)!;
  const lordOf = (h: number) => houseLords.find((x) => x.house === h);
  const lordships = (g: string) => houseLords.filter((x) => x.lord === g).map((x) => x.house);
  const d10 = chart.vargas.D10;
  const d10Of = (g: string) => d10.placements.find((p) => p.planet === g)!;
  const d10Sign = (h: number) => (d10.ascendantSignIndex + h - 1) % 12;
  const sav: number[] = chart.strength.ashtakavarga.savByHouse;
  const today = asOf.toISOString().slice(0, 10);
  const running = (x: any) => x?.startDate && x?.endDate && x.startDate <= today && today < x.endDate;

  const tenth = lordOf(10);
  if (!tenth || !Array.isArray(kundli.dashas)) return null;
  const tenthLord = tenth.lord as Graha;
  const occupants = (h: number) => chart.planets.filter((p) => p.house === h).map((p) => p.name);
  const aspecting10 = aspects.filter((a) => a.aspectsHouses?.includes(10)).map((a) => a.planet as string);
  const karakas = DOMAIN_SPECS.career.karakas;
  const describe = (g: string) => {
    const p = planet(g);
    const ls = lordships(g);
    const d10p = d10Of(g);
    return `${g}: ${p.sign}, ${ord(p.house)} house${dig.get(g) ? ` (${dignityText(dig.get(g))})` : ''}${ls.length ? `; lord of the ${listOf(ls.map(ord))}` : ''}; in D10 ${d10p.sign}, D10 ${ord(d10p.house)} house${signDignity(g, d10p.signIndex) ? ` (${signDignity(g, d10p.signIndex)} in D10)` : ''}`;
  };

  const d10LagnaLord = SIGN_LORDS[d10.ascendantSignIndex];
  const d10TenthLord = SIGN_LORDS[d10Sign(10)];
  const d10Occ = (h: number) => d10.placements.filter((p) => p.house === h).map((p) => p.planet);
  const sameSign = chart.planets.filter((p) => d10Of(p.name).signIndex === p.signIndex).map((p) => p.name);
  const window = d10LagnaWindow(chart);

  const md = kundli.dashas.find(running);
  const ad = md?.antardashas?.find(running);
  const nextAds = (md?.antardashas ?? []).filter((a: any) => a.startDate > today);
  const nextMd = kundli.dashas.find((d: any) => d.startDate >= (md?.endDate ?? '9999'));

  const yogaLines = chart.yogas.map((y) => yogaLine(y, chart, { tenthLord, d10LagnaLord, d10TenthLord, karakas, aspecting10, houseLords }));

  const L: string[] = [];
  L.push('CAREER EVIDENCE (deterministic, from the calculation engine; build every career claim on these facts and name them):');
  L.push('', 'D1 — the 10th house of career:');
  L.push(`- 10th house: ${tenth.sign}; its lord ${describe(tenthLord)}.`);
  L.push(`- Planets in the 10th: ${occupants(10).length ? occupants(10).map(describe).join(' | ') : 'none'}.`);
  L.push(`- Planets aspecting the 10th (engine graha drishti): ${aspecting10.length ? listOf(aspecting10) : 'none'}.`);
  L.push(`- 10th house Sarvashtakavarga: ${sav[9]} bindus (${savReading(sav[9]).label}).`);
  L.push(`- Career significators used by the engine: ${karakas.map(describe).join(' | ')}.`);
  L.push('', 'D10 Dasamsa (signs and houses only; the engine does not calculate D10 degrees, so never state one):');
  L.push(`- D10 Lagna: ${SIGN_NAMES[d10.ascendantSignIndex]}; its lord ${d10LagnaLord} is in D10 ${d10Of(d10LagnaLord).sign}, the D10 ${ord(d10Of(d10LagnaLord).house)} house.`);
  L.push(`- D10 10th house: ${SIGN_NAMES[d10Sign(10)]}; its lord ${d10TenthLord} is in D10 ${d10Of(d10TenthLord).sign}, the D10 ${ord(d10Of(d10TenthLord).house)} house.`);
  L.push(`- Planets in the D10 1st house: ${d10Occ(1).length ? listOf(d10Occ(1)) : 'none'}; in the D10 10th house: ${d10Occ(10).length ? listOf(d10Occ(10)) : 'none'}.`);
  L.push(`- The D1 10th lord ${tenthLord} is in D10 ${d10Of(tenthLord).sign}, the D10 ${ord(d10Of(tenthLord).house)} house.`);
  L.push(`- Planets in the same sign in D1 and D10: ${sameSign.length ? listOf(sameSign) : 'none'}.`);
  L.push(`- Birth-time sensitivity: the D10 Lagna stays ${SIGN_NAMES[d10.ascendantSignIndex]} for a birth up to ${window.earlier ? `${window.earlier - 1} minute(s) earlier` : 'at least 60 minutes earlier'} and ${window.later ? `${window.later - 1} minute(s) later` : 'at least 60 minutes later'}. ${(window.earlier ?? 61) <= 10 || (window.later ?? 61) <= 10 ? 'That is close: say plainly that the D10 reading depends on an accurate birth time.' : ''}`.trim());
  L.push('', 'Job versus business (traditional indicators; compare them, and say so when they do not clearly favour one):');
  for (const h of [6, 7, 10]) {
    const l = lordOf(h);
    if (l) L.push(`- ${ord(h)} house (${h === 6 ? 'service and employment' : h === 7 ? 'partnership and trade' : 'profession'}): ${l.sign}, ${sav[h - 1]} bindus (${savReading(sav[h - 1]).label}); occupants ${occupants(h).length ? listOf(occupants(h)) : 'none'}; lord ${l.lord} in the ${ord(l.lordHouse)} house${dig.get(l.lord) ? ` (${dignityText(dig.get(l.lord))})` : ''}.`);
  }
  // Field tally: each significator's condition and link to the career houses, and each field house's strength.
  const STRONG = ['Exalted', 'Own sign', 'Moolatrikona'];
  const fieldRows = (Object.keys(FIELDS) as FieldId[]).map((id) => {
    const fd = FIELDS[id];
    const plus: string[] = [], minus: string[] = [];
    for (const g of fd.planets) {
      const d = dig.get(g), p = planet(g), dp = d10Of(g);
      if (d && STRONG.includes(d.dignity)) plus.push(`${g} ${d.dignity.toLowerCase()}`);
      if (d?.dignity === 'Debilitated' && !d.neechaBhanga) minus.push(`${g} debilitated`);
      if (d?.combust) minus.push(`${g} combust`);
      if (g === tenthLord || p.house === 10 || aspecting10.includes(g)) plus.push(`${g} ${g === tenthLord ? 'rules' : p.house === 10 ? 'occupies' : 'aspects'} the 10th`);
      if (g === d10LagnaLord || g === d10TenthLord || KENDRA.includes(dp.house)) plus.push(`${g} ${g === d10LagnaLord ? 'rules the D10 Lagna' : g === d10TenthLord ? 'rules the D10 10th' : `in a D10 kendra (${ord(dp.house)})`}`);
      if ([6, 8, 12].includes(p.house) && !(id === 'administration' && p.house === 6)) minus.push(`${g} in the ${ord(p.house)} (a dusthana)`);
    }
    for (const h of fd.houses) {
      const r = savReading(sav[h - 1]);
      if (r.direction === 'positive') plus.push(`${ord(h)} house ${sav[h - 1]} bindus`);
      if (r.direction === 'negative') minus.push(`${ord(h)} house ${sav[h - 1]} bindus`);
      const l = lordOf(h);
      if (l && [6, 8, 12].includes(l.lordHouse) && h !== 6) minus.push(`${ord(h)} lord ${l.lord} in the ${ord(l.lordHouse)}`);
    }
    const net = plus.length - minus.length;
    const rating = (plus.length >= 3 && net >= 2 ? 'well supported' : plus.length >= 1 && net >= 0 ? 'mixed' : 'weakly supported') as 'well supported' | 'mixed' | 'weakly supported';
    return { id, label: fd.label, rating, plus, minus, fd };
  });
  L.push('', 'Professional fields (traditional significators and houses, tallied from the facts above; discuss "well supported" and "mixed" fields with these facts, and mention a "weakly supported" field only as less indicated, with its reason):');
  for (const r of fieldRows) L.push(`- ${r.label} [${r.rating}] — significators ${listOf(r.fd.planets)}, houses ${listOf(r.fd.houses.map(ord))}; for: ${r.plus.length ? r.plus.join('; ') : 'none'}; against: ${r.minus.length ? r.minus.join('; ') : 'none'}.`);
  L.push('', 'Vimshottari periods (engine dates; use no other dates):');
  if (md) L.push(`- Current Mahadasha: ${describe(md.planet)}; runs ${md.startDate} to ${md.endDate}.`);
  if (ad) L.push(`- Current Antardasha: ${ad.planet} (${ad.startDate} to ${ad.endDate}); ${ad.planet === md?.planet ? 'the same lord as the Mahadasha.' : describe(ad.planet) + '.'}`);
  if (!ad) L.push('- Current Antardasha: not available from the engine; do not name one.');
  for (const a of nextAds.slice(0, 2)) L.push(`- Next Antardasha: ${a.planet} (${a.startDate} to ${a.endDate}); ${describe(a.planet)}.`);
  if (nextMd) L.push(`- Next Mahadasha: ${nextMd.planet} (${nextMd.startDate} to ${nextMd.endDate}); ${describe(nextMd.planet)}.`);
  L.push('', 'Yogas detected by the engine (name no other yoga; describe each with its rule, how it is met and its limits):');
  L.push(...(yogaLines.length ? yogaLines : ['- none']));
  L.push('', 'Remedies: optional practices only; no gemstone; only for these planets, each with its reason from the facts above: ' + listOf(remedyPlanetsOf({ tenthLord, d10LagnaLord, d10TenthLord, md: md?.planet, ad: ad?.planet, karakas })) + '.');

  return {
    text: L.join('\n'),
    facts: {
      tenthLord, tenthSign: tenth.sign, d10LagnaSign: SIGN_NAMES[d10.ascendantSignIndex], d10LagnaLord,
      d10TenthSign: SIGN_NAMES[d10Sign(10)], d10TenthLord, mahadasha: md?.planet ?? null, antardasha: ad?.planet ?? null,
      remedyPlanets: remedyPlanetsOf({ tenthLord, d10LagnaLord, d10TenthLord, md: md?.planet, ad: ad?.planet, karakas }),
      yogaNames: chart.yogas.map((y) => y.name),
      yogaFamilies: chart.yogas.some((y) => y.category === 'Mahapurusha') ? ['Pancha Mahapurusha Yoga', 'Mahapurusha Yoga'] : [],
      fields: fieldRows.map((r) => ({ id: r.id, label: r.label, rating: r.rating })),
      careerYogas: chart.yogas.filter((_, i) => !/no direct link/.test(yogaLines[i])).map((y) => y.name),
      nextAntardasha: nextAds[0]?.planet ?? null,
      d10Sensitive: (window.earlier ?? 61) <= 10 || (window.later ?? 61) <= 10,
      periodDates: [md?.startDate, md?.endDate, ad?.startDate, ad?.endDate, ...nextAds.slice(0, 2).flatMap((a: any) => [a.startDate, a.endDate]), nextMd?.startDate, nextMd?.endDate].filter(Boolean),
    },
  };
}

function remedyPlanetsOf(x: { tenthLord: Graha; d10LagnaLord: Graha; d10TenthLord: Graha; md?: Graha; ad?: Graha; karakas: readonly Graha[] }): Graha[] {
  return Array.from(new Set([x.tenthLord, x.d10LagnaLord, x.d10TenthLord, x.md, x.ad, ...x.karakas].filter(Boolean) as Graha[]));
}

/** One engine yoga: the rule the engine applies, the configuration that meets it, its limits and its career link. */
function yogaLine(y: CanonicalChart['yogas'][number], chart: CanonicalChart, ctx: { tenthLord: Graha; d10LagnaLord: Graha; d10TenthLord: Graha; karakas: readonly Graha[]; aspecting10: string[]; houseLords: any[] }): string {
  const planet = (g: string) => chart.planets.find((p) => p.name === g);
  const dig = (g: string) => (chart.strength.dignities as any[]).find((d) => d.planet === g);
  const mods = y.planets.map((g) => { const d = dig(g); return d && (d.combust || d.retrograde || d.planetaryWar) ? `${g} is ${[d.combust && 'combust', d.retrograde && 'retrograde', d.planetaryWar && `in planetary war with ${d.planetaryWar}`].filter(Boolean).join(', ')}` : null; }).filter(Boolean) as string[];
  let rule = y.description, config = '', limits = '';
  if (y.category === 'Mahapurusha') {
    const g = y.planets[0], p = planet(g);
    rule = 'Pancha Mahapurusha: the planet in its own sign, Moolatrikona or exaltation in a kendra (1st, 4th, 7th or 10th) from the Lagna';
    const d = dig(g)?.dignity;
    config = `${g} is ${d === 'Own sign' ? 'in its own sign' : d === 'Exalted' ? 'exalted' : 'in Moolatrikona'} in ${p?.sign}, the ${ord(p?.house ?? 0)} house`;
    limits = 'the engine checks the kendra from the Lagna only';
  } else if (y.name === 'Neecha Bhanga Raja Yoga') {
    const g = y.planets[0], p = planet(g)!;
    const dispositor = SIGN_LORDS[p.signIndex];
    const exalted = Object.keys(EXALTATION_SIGN).find((x) => EXALTATION_SIGN[x] === p.signIndex);
    const met = [dispositor, exalted].filter((x) => x && KENDRA.includes(planet(x)?.house ?? 0)).map((x) => `${x} (${x === dispositor ? `lord of ${p.sign}` : `exalted in ${p.sign}`}) is in the ${ord(planet(x!)!.house)} house, a kendra`);
    rule = 'Neecha Bhanga (cancellation of debilitation), as the engine applies it: the lord of the debilitation sign, or the planet exalted in that sign, occupies a kendra from the Lagna';
    config = `${g} is debilitated in ${p.sign}; ${listOf(met)}`;
    limits = 'the engine names every cancelled debilitation "Neecha Bhanga Raja Yoga" but checks only the cancellation, not the further conditions some texts require before calling it a Raja Yoga — describe it as a cancelled debilitation (Neecha Bhanga), not as a separate Raja Yoga';
  } else if (/Vipreeta Raja Yoga$/.test(y.name)) {
    const g = y.planets[0], p = planet(g);
    const ls = ctx.houseLords.filter((x) => x.lord === g).map((x) => x.house);
    rule = 'Vipreeta Raja Yoga: the lord of a dusthana (6th, 8th or 12th) placed in another dusthana';
    config = `${g}, lord of the ${listOf(ls.map(ord))}, is in the ${ord(p?.house ?? 0)} house`;
    limits = ls.some((h) => ![6, 8, 12].includes(h)) ? `${g} also rules a house that is not a dusthana, which some astrologers take to qualify the yoga` : '';
  } else if (y.name === 'Raja Yoga') {
    rule = 'Raja Yoga: a kendra lord and a trikona lord (different planets) in the same house';
    config = y.description.split(' — ')[0];
  }
  const links = y.planets.flatMap((g) => [
    g === ctx.tenthLord && `${g} is the 10th lord`, planet(g)?.house === 10 && `${g} occupies the 10th`, ctx.aspecting10.includes(g) && `${g} aspects the 10th`,
    g === ctx.d10LagnaLord && `${g} rules the D10 Lagna`, g === ctx.d10TenthLord && `${g} rules the D10 10th house`, (ctx.karakas as string[]).includes(g) && `${g} is a career significator`,
  ]).filter(Boolean) as string[];
  const career = links.length ? `career link: ${listOf(Array.from(new Set(links)))}` : 'no direct link to the 10th house, its lord, the D10 or the career significators; do not present it as a career yoga';
  return `- ${y.name}${y.cancelled ? ' (cancelled)' : ''}: rule — ${rule}; configuration — ${config || y.description.split(' — ')[0]}; ${y.cancelled ? 'the engine marks it cancelled' : 'met by the engine\'s rule'}${limits ? `; limits — ${limits}` : ''}${mods.length ? `; modifying conditions — ${mods.join('; ')}` : ''}; ${career}.`;
}

/** One Career Report section: its heading, an editorial word range (a ceiling for depth, not a quota) and what it must explain. */
export interface CareerSection { heading: string; words: [number, number]; core: boolean; brief: string }
/**
 * The Career Report is written in three parallel parts that share one deterministic evidence block; each part is
 * validated on its own and only its failed sections are regenerated, then the whole report is checked for
 * repetition and contradictions. Ten sections of 300–550 words is roughly 4,000–5,000 words (6–7 PDF pages).
 */
export const CAREER_BATCHES: Array<{ id: string; summary: boolean; remedies: boolean; sections: CareerSection[] }> = [
  { id: 'foundations', summary: true, remedies: false, sections: [
    { heading: 'Birth Chart Overview', words: [250, 450], core: false, brief: 'The rising sign (Lagna) and its lord, the Moon, and the two or three chart themes that shape this person\'s working life; say briefly what the later sections examine. No career conclusions yet.' },
    { heading: 'Tenth House & Its Lord (D1)', words: [300, 550], core: true, brief: 'The 10th house sign, the planets in it and aspecting it, the 10th lord\'s house, sign and condition, and the 10th house bindus — what each traditionally signifies for work and status, and what they show together.' },
    { heading: 'Career Significators & Planetary Aspects', words: [300, 500], core: true, brief: 'The career significators (karakas) the evidence lists and the aspects on the 10th: condition, house, lordships and what each contributes or withholds. Do not repeat the 10th lord analysis.' },
  ] },
  { id: 'divisional', summary: false, remedies: false, sections: [
    { heading: 'Dasamsa (D10) Analysis', words: [300, 550], core: true, brief: 'Explain what the D10 is. The D10 Lagna and its lord, the D10 10th house and its lord, planets in the D10 1st and 10th, and the D1 10th lord\'s D10 placement. State the birth-time sensitivity given.' },
    { heading: 'Comparing the D1 and D10', words: [250, 450], core: true, brief: 'Where the birth chart (D1) and the D10 agree and where they differ — the 10th lord in both charts, planets in the same sign in both, strong or weak in one but not the other — and what that means in practice.' },
    { heading: 'Career Yogas', words: [200, 450], core: true, brief: 'Each career-linked yoga from the evidence: the traditional rule, how this chart meets it, what it signifies, its limits and its career relevance. Yogas with no career link get one sentence saying so. If none is career-linked, say so plainly in a few sentences and stop: do not pad this section.' },
    { heading: 'Suitable Professional Fields', words: [300, 550], core: true, brief: 'Evaluate only the fields the evidence marks "well supported" or "mixed", each with the specific facts for and against it, and say which fields are less indicated and why. Compare; do not list every field as suitable.' },
  ] },
  { id: 'decisions', summary: false, remedies: true, sections: [
    { heading: 'Job vs Business', words: [250, 450], core: true, brief: 'A reasoned comparison of the 6th (service), 7th (trade and partnership) and 10th house indicators given. Reach one conclusion, or explain the trade-offs when the chart is mixed; do not recommend both by default.' },
    { heading: 'Career Timeline (Dasha Periods)', words: [300, 550], core: true, brief: 'Explain what a Mahadasha and Antardasha are. The running Mahadasha and Antardasha lords — their house lordships, D1 and D10 placements and career implications, supporting and challenging — then the next periods, with the engine\'s dates only. No event dates, no guarantees.' },
    { heading: 'Strengths, Challenges & Practical Guidance', words: [250, 450], core: true, brief: 'The two or three clearest professional strengths and challenges from the sections above, each tied to its chart reason, and practical guidance that follows from them. Bring together; do not restate earlier paragraphs.' },
  ] },
];
export const CAREER_SECTIONS = CAREER_BATCHES.flatMap((b) => b.sections);

const GENERIC = /\b(leadership (?:potential|qualities|capabilities|roles?)|hard work|networking|success will come|bright future|great potential|strong potential|many opportunities|opportunities will|natural leader|challenges may arise|with patience|work hard|positive energy|cosmic)\b/i;
const ANCHOR = /\b(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu|lord|house|D1|D10|Dasamsa|Lagna|Ascendant|Mahadasha|Antardasha|dasha|bindus?|Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces|yoga|kendra|trikona|dusthana|significator|karaka|10th|tenth|chart)\b/i;
const YOGA_NAME = /\b((?:[A-Z][a-z]+[ -])*[A-Z][a-z]+) Yoga\b/g;
const NOT_A_NAME = new Set(['This', 'The', 'That', 'A', 'An', 'Such', 'Each', 'Every', 'Any', 'No', 'These', 'Those', 'Its', 'Your', 'One', 'Another', 'Which', 'What', 'Both']);
const CONTRAST = /\b(however|but|although|though|whereas|while|on the other hand|offset\w*|temper\w*|counter\w*|against|tension|mixed|contrast\w*|weaker|limits?|qualif\w*)\b/i;
const CONCLUSION = /\b(overall|taken together|on balance|in practice|this means|this suggests|so\b|therefore|the upshot|in short|practically|for your work|professionally)\b/i;
const CERTAINTY = /\b(?:will|shall)\s+(?:definitely\s+|certainly\s+|surely\s+|undoubtedly\s+)?(?:get|receive|achieve|be promoted|land|start|launch|become|earn|succeed|win|reach)\b/i;
const HEDGE = /\b(may|might|could|can|tends?|likely|possible|possibly|often|usually|if)\b/i;
const MONTH_YEAR = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+((?:19|20)\d{2})\b/g;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WORD_TOLERANCE = 0.1;
const words = (t: string) => (t.match(/[A-Za-z0-9'’-]+/g) ?? []).length;
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const paragraphsOf = (t: string) => t.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => words(x) >= 40);

/** Career-only problems in one section; [] when it passes. Run after the shared guard. */
export function careerSectionProblems(heading: string, body: string, f: CareerFacts): string[] {
  const out: string[] = [];
  const has = (re: RegExp) => re.test(body);
  const word = (x: string) => new RegExp(`\\b${x}\\b`);
  const def = CAREER_SECTIONS.find((x) => x.heading === heading);
  const n = words(body);
  // With no career-linked yoga the yoga section is a few sentences; its minimum must not invite padding.
  const noYogas = heading === 'Career Yogas' && !(f.careerYogas ?? []).length;
  // The prompt's word range is a target; a section up to 10% under its lower bound is accepted.
  const min = noYogas ? 40 : Math.floor((def?.words[0] ?? 0) * (1 - WORD_TOLERANCE));
  if (def && n < min) out.push(`too short: ${n} words; explain the configuration, its meaning, its career relevance, the indicators for and against, and the conclusion (about ${noYogas ? 40 : def.words[0]}–${def.words[1]} words, only as deep as the evidence supports)`);
  if (heading === 'Tenth House & Its Lord (D1)') {
    if (!has(/\b10th house\b|\btenth house\b/i)) out.push('must discuss the 10th house of the D1 chart');
    if (!has(word(f.tenthLord))) out.push(`must name the 10th lord, ${f.tenthLord}, and read its placement`);
  }
  if (heading === 'Dasamsa (D10) Analysis') {
    if (!has(/\bD10\b|\bDasamsa\b/i)) out.push('must discuss the D10 (Dasamsa) chart');
    if (!has(word(f.d10LagnaSign))) out.push(`must name the D10 Lagna, ${f.d10LagnaSign}`);
    if (!has(word(f.d10LagnaLord))) out.push(`must read the D10 Lagna lord, ${f.d10LagnaLord}`);
    if (!has(word(f.d10TenthLord))) out.push(`must name the D10 10th lord, ${f.d10TenthLord}`);
    if (f.d10Sensitive && !has(/\bbirth time\b|\btime of birth\b/i)) out.push('must say that the D10 Lagna depends on an accurate birth time (it changes within minutes)');
  }
  if (heading === 'Comparing the D1 and D10') {
    if (!has(/\bD1\b|\bbirth chart\b|\bRasi\b/i) || !has(/\bD10\b|\bDasamsa\b/i)) out.push('must compare the D1 (birth chart) with the D10 by name');
    if (!has(word(f.tenthLord))) out.push(`must compare the 10th lord, ${f.tenthLord}, in the D1 and the D10`);
    if (!has(/\b(agree\w*|confirm\w*|echo\w*|differ\w*|contrast\w*|whereas|while|both|neither|same sign|unlike)\b/i)) out.push('must say where the D1 and D10 agree or differ');
  }
  if (heading === 'Career Yogas') {
    for (const y of f.careerYogas ?? []) if (!body.toLowerCase().includes(y.toLowerCase().replace(/ yoga$/, ''))) out.push(`must explain ${y}, which the evidence links to career`);
    if (!(f.careerYogas ?? []).length && !has(/\b(no|none)\b/i)) out.push('must say that no detected yoga is linked to career');
  }
  if (heading === 'Suitable Professional Fields') {
    for (const fld of f.fields ?? []) {
      const fd = FIELDS[fld.id];
      for (const sentence of sentencesOf(body).filter((x) => fd.words.test(x))) {
        if (fld.rating === 'weakly supported' && !/\b(less|not|weak\w*|limited|fewer|unlikely|lower|harder|poorly)\b/i.test(sentence)) out.push(`recommends ${fld.label.toLowerCase()}, which the chart supports only weakly: "${sentence.slice(0, 140)}"`);
        if (fld.rating !== 'weakly supported' && !new RegExp(`\\b(${[...fd.planets, ...fd.houses.map((h) => `${h}(?:st|nd|rd|th)`)].join('|')})\\b`).test(sentence) && !/\b(this|these|that|it)\b/i.test(sentence)) out.push(`names ${fld.label.toLowerCase()} without the chart facts behind it: "${sentence.slice(0, 140)}"`);
      }
    }
    const supported = (f.fields ?? []).filter((x) => x.rating !== 'weakly supported');
    if (supported.length && !supported.some((x) => FIELDS[x.id].words.test(body) || body.toLowerCase().includes(x.label.toLowerCase()))) out.push(`must evaluate the supported fields: ${supported.map((x) => x.label).join(', ')}`);
  }
  if (heading === 'Job vs Business') {
    if (((body.match(/\b(6th|7th|10th|sixth|seventh|tenth) house\b/gi) ?? []).map((x) => x.toLowerCase()).filter((x, i, a) => a.indexOf(x) === i)).length < 2) out.push('must compare at least two of the 6th, 7th and 10th house indicators');
  }
  if (heading === 'Career Timeline (Dasha Periods)') {
    if (f.mahadasha && !has(word(f.mahadasha))) out.push(`must name the running Mahadasha lord, ${f.mahadasha}`);
    if (f.antardasha && !has(/\bAntardasha\b|\bsub-?period\b/i)) out.push(`must discuss the running Antardasha (${f.antardasha})`);
    if (f.nextAntardasha && !has(word(f.nextAntardasha))) out.push(`must discuss the next Antardasha, ${f.nextAntardasha}`);
  }
  if (def?.core && !noYogas && n >= min && (!CONTRAST.test(body) || !CONCLUSION.test(body))) out.push('must weigh the indicators for and against and end with a practical conclusion, not only state conclusions');
  const sents = sentencesOf(body);
  if (sents.length >= 6 && sents.filter((x) => ANCHOR.test(x)).length / sents.length < 0.3) out.push('mostly generic text: most sentences cite no chart fact');
  for (const x of sents) {
    if (GENERIC.test(x) && !ANCHOR.test(x)) out.push(`generic statement with no chart evidence: "${x.slice(0, 160)}"`);
    if (/\b(D10|Dasamsa)\b/i.test(x) && /\d+(?:\.\d+)?\s?°|\bdegrees?\b/i.test(x)) out.push('states a D10 degree; the engine calculates D10 signs and houses only');
    if (CERTAINTY.test(x) && !HEDGE.test(x)) out.push(`states an outcome as certain: "${x.slice(0, 140)}"`);
  }
  const known = new Set((f.periodDates ?? []).map((d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`));
  for (const m of Array.from(body.matchAll(MONTH_YEAR))) if (!known.has(`${m[1]} ${m[2]}`)) out.push(`names ${m[1]} ${m[2]}, which is not a period date from the engine`);
  const knownYogas = [...f.yogaNames, ...(f.yogaFamilies ?? [])].map((x) => x.toLowerCase().replace(/-/g, ' '));
  for (const m of Array.from(body.matchAll(YOGA_NAME))) {
    const ws = m[1].split(/[ -]/);
    while (ws.length && NOT_A_NAME.has(ws[0])) ws.shift();
    if (!ws.length) continue;
    const name = `${ws.join(' ')} Yoga`.toLowerCase();
    if (!knownYogas.some((k) => k === name || k.endsWith(` ${name}`))) out.push(`names ${ws.join(' ')} Yoga, which the engine did not detect`);
  }
  return Array.from(new Set(out));
}

const TERMS: Array<[string, RegExp]> = [
  ['Lagna', /\bLagna\b/], ['Dasamsa', /\bDasamsa\b/], ['Mahadasha', /\bMahadasha\b/], ['Antardasha', /\bAntardasha\b/],
  ['kendra', /\bkendras?\b/i], ['trikona', /\btrikonas?\b/i], ['dusthana', /\bdusthanas?\b/i], ['Sarvashtakavarga', /\bSarvashtakavarga\b/], ['karaka', /\bkarakas?\b/i], ['Neecha Bhanga', /\bNeecha Bhanga\b/],
];
const EXPLAINED = /\(|—|–|\bmeans?\b|\bmeaning\b|\brefers? to\b|\bwhich is\b|\bthat is\b|\bknown as\b|\bcalled\b|\bliterally\b|\bthe sign\b|\bthe period\b|\bthe (?:planetary )?period\b|\bthe divisional\b|\bthe chart\b|\bi\.e\./i;
const shingles = (t: string) => { const w = t.toLowerCase().match(/[a-z0-9]+/g) ?? []; const out = new Set<string>(); for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(' ')); return out; };
const jaccard = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of Array.from(a)) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); };
const JOB = /\b(favou?rs?|better suited to|leans? (?:towards?|to)|points? (?:towards?|to)|suits?|recommend\w*)\b[^.]{0,50}\b((?<!self-)employment|a job|salaried|service)\b/i;
const BUSINESS = /\b(favou?rs?|better suited to|leans? (?:towards?|to)|points? (?:towards?|to)|suits?|recommend\w*)\b[^.]{0,50}\b(business|entrepreneurship|self-employment)\b/i;

/**
 * Checks across the whole report, attributed to the later section: a repeated sentence, a near-duplicate paragraph,
 * a job/business conclusion that contradicts the Job vs Business section, and Sanskrit terms left unexplained on
 * first use (three or more).
 */
export function careerReportProblems(sections: Array<{ heading: string; body: string }>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (h: string, p: string) => out.set(h, [...(out.get(h) ?? []), p]);
  const order = CAREER_SECTIONS.map((x) => x.heading);
  const sorted = [...sections].sort((a, b) => order.indexOf(a.heading) - order.indexOf(b.heading));
  const seen = new Map<string, string>();
  const paras: Array<{ heading: string; sh: Set<string> }> = [];
  for (const s of sorted) {
    for (const x of sentencesOf(s.body)) {
      const key = x.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
      if (key.split(' ').length < 8) continue;
      const first = seen.get(key);
      if (first) add(s.heading, `repeats a sentence already used in "${first}": "${x.slice(0, 120)}"`);
      else seen.set(key, s.heading);
    }
    for (const p of paragraphsOf(s.body)) {
      const sh = shingles(p);
      const dup = paras.find((q) => jaccard(q.sh, sh) >= 0.35);
      if (dup) add(s.heading, `a paragraph largely repeats one in "${dup.heading}"; each section must add new information`);
      paras.push({ heading: s.heading, sh });
    }
  }
  const jvb = sorted.find((x) => x.heading === 'Job vs Business');
  if (jvb) {
    const job = JOB.test(jvb.body), biz = BUSINESS.test(jvb.body);
    if (job !== biz) for (const s of sorted) if (s !== jvb && (job ? BUSINESS.test(s.body) && !JOB.test(s.body) : JOB.test(s.body) && !BUSINESS.test(s.body))) add(s.heading, `contradicts the Job vs Business conclusion (${job ? 'employment' : 'business'})`);
  }
  const unexplained: Array<[string, string]> = [];
  for (const [term, re] of TERMS) {
    for (const s of sorted) {
      const first = sentencesOf(s.body).find((x) => re.test(x));
      if (!first) continue;
      if (!EXPLAINED.test(first)) unexplained.push([s.heading, term]);
      break;
    }
  }
  if (unexplained.length >= 3) for (const [h, t] of unexplained) add(h, `uses ${t} without explaining it on first use; the reader is not an astrologer`);
  for (const [h, ps] of Array.from(out)) out.set(h, Array.from(new Set(ps)));
  return out;
}

const GEM = /\b(gem(?:stone)?s?|sapphire|diamond|pearl|ruby|emerald|coral|gomed|hessonite|cat'?s[ -]eye|topaz|opal|zircon|wear (?:a|an|the)?\s?\w*\s?(?:ring|stone))\b/i;
const PLANET_WORD = /\b(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu)\b/g;

/**
 * Career remedies: optional practices tied to a career-relevant planet. Drops gemstones, remedies for planets
 * outside the career set, remedies naming no planet, and opposite instructions for one planet (strengthen and
 * pacify both).
 */
export function careerRemedies(remedies: string[], f: CareerFacts): string[] {
  const kept = remedies.filter((r) => typeof r === 'string' && r.trim()).filter((r) => {
    if (GEM.test(r)) return false;
    const planets = Array.from(new Set(r.match(PLANET_WORD) ?? []));
    return planets.length > 0 && planets.every((p) => (f.remedyPlanets as string[]).includes(p));
  });
  const stance = (r: string, p: string) => (new RegExp(`\\b(strengthen\\w*|boost\\w*)\\b[^.]*\\b${p}\\b|\\b${p}\\b[^.]*\\b(strengthen\\w*|boost\\w*)`, 'i').test(r) ? 'strengthen' : new RegExp(`\\b(pacif\\w*|appeas\\w*|calm\\w*)\\b[^.]*\\b${p}\\b|\\b${p}\\b[^.]*\\b(pacif\\w*|appeas\\w*)`, 'i').test(r) ? 'pacify' : null);
  const conflicted = new Set((f.remedyPlanets as string[]).filter((p) => { const s = new Set(kept.map((r) => stance(r, p)).filter(Boolean)); return s.size > 1; }));
  return kept.filter((r) => !(r.match(PLANET_WORD) ?? []).some((p) => conflicted.has(p)));
}
