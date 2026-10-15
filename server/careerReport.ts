/**
 * Career & Profession Report: the career brief (field tally, yoga analysis, D10 birth-time sensitivity) that
 * careerReportEvidence.ts turns into the report's facts. Every value is read from the canonical chart and the
 * engine's own derived data; nothing is calculated anew except the D10 Lagna's sensitivity to the birth time,
 * which re-runs the engine's own angles.
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

export interface CareerBrief {
  text: string;
  facts: CareerFacts;
  fields: Array<{ id: FieldId; label: string; rating: 'well supported' | 'mixed' | 'weakly supported'; plus: string[]; minus: string[] }>;
  yogaEvidence: string[];
  birthTimeCaveat: string;
}

/** Birth-time sensitivity of the D10 Lagna: minutes earlier/later at which it would change (searched to ±60 min). */
export function d10LagnaWindow(chart: CanonicalChart): { earlier: number | null; later: number | null } {
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
  // Use one authority. Legacy projections may predate a canonical chart upgrade.
  const houseLords = chart.houses;
  const aspects = chart.aspects;
  const dig = new Map<string, any>((chart.strength.dignities as any[]).map((d) => [d.planet, d]));
  const planet = (g: string) => chart.planets.find((p) => p.name === g)!;
  const lordOf = (h: number) => houseLords.find((x) => x.house === h);
  const lordships = (g: string) => houseLords.filter((x) => x.lord === g).map((x) => x.house);
  const d10 = chart.vargas.D10;
  const d10Of = (g: string) => d10.placements.find((p) => p.planet === g)!;
  const d10Sign = (h: number) => (d10.ascendantSignIndex + h - 1) % 12;
  const sav: number[] = chart.strength.ashtakavarga.savByHouse;
  const today = asOf.toISOString().slice(0, 10);
  const running = (x: { start: string; end: string }) => x.start.slice(0, 10) <= today && today < x.end.slice(0, 10);

  const tenth = lordOf(10);
  if (!tenth) return null;
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

  const periods = chart.dashas.vimshottari.mahadashas;
  const md = periods.find(running);
  const ad = md?.antardashas.find(running);
  const nextAds = (md?.antardashas ?? []).filter((x) => x.start.slice(0, 10) > today);
  const nextMd = periods.find((x) => x.start >= (md?.end ?? '9999'));

  const yogaLines = chart.yogas.map((y) => yogaLine(y, chart, { tenthLord, d10LagnaLord, d10TenthLord, karakas, aspecting10, houseLords }));

  const L: string[] = [];
  L.push('CAREER EVIDENCE (deterministic, from the calculation engine; build every career claim on these facts and name them):');
  const lagnaLord = SIGN_LORDS[chart.ascendant.signIndex];
  L.push('', 'D1 — foundations (the rising sign and the planets the career sections do not otherwise list):');
  L.push(`- D1 Lagna (the rising sign): ${chart.ascendant.sign}; its lord ${describe(lagnaLord)}.`);
  for (const g of ['Moon', 'Rahu', 'Ketu'] as const) L.push(`- ${describe(g)}.`);
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
  if (md) L.push(`- Current Mahadasha: ${describe(md.lord)}; runs ${md.start.slice(0, 10)} to ${md.end.slice(0, 10)}.`);
  if (ad) L.push(`- Current Antardasha: ${ad.lord} (${ad.start.slice(0, 10)} to ${ad.end.slice(0, 10)}); ${ad.lord === md?.lord ? 'the same lord as the Mahadasha.' : describe(ad.lord) + '.'}`);
  if (!ad) L.push('- Current Antardasha: not available from the engine; do not name one.');
  for (const a of nextAds.slice(0, 2)) L.push(`- Next Antardasha: ${a.lord} (${a.start.slice(0, 10)} to ${a.end.slice(0, 10)}); ${describe(a.lord)}.`);
  if (nextMd) L.push(`- Next Mahadasha: ${nextMd.lord} (${nextMd.start.slice(0, 10)} to ${nextMd.end.slice(0, 10)}); ${describe(nextMd.lord)}.`);
  L.push('', 'Yogas detected by the engine (name no other yoga; describe each with its rule, how it is met and its limits):');
  L.push(...(yogaLines.length ? yogaLines : ['- none']));
  L.push('', 'Remedies: optional practices only; no gemstone; only for these planets, each with its reason from the facts above: ' + listOf(remedyPlanetsOf({ tenthLord, d10LagnaLord, d10TenthLord, md: md?.lord, ad: ad?.lord, karakas })) + '.');

  return {
    text: L.join('\n'),
    fields: fieldRows.map(({ id, label, rating, plus, minus }) => ({ id, label, rating, plus, minus })),
    yogaEvidence: yogaLines,
    birthTimeCaveat: L.find((line) => line.startsWith('- Birth-time sensitivity:'))!,
    facts: {
      tenthLord, tenthSign: tenth.sign, d10LagnaSign: SIGN_NAMES[d10.ascendantSignIndex], d10LagnaLord,
      d10TenthSign: SIGN_NAMES[d10Sign(10)], d10TenthLord, mahadasha: md?.lord ?? null, antardasha: ad?.lord ?? null,
      remedyPlanets: remedyPlanetsOf({ tenthLord, d10LagnaLord, d10TenthLord, md: md?.lord, ad: ad?.lord, karakas }),
      yogaNames: chart.yogas.map((y) => y.name),
      yogaFamilies: chart.yogas.some((y) => y.category === 'Mahapurusha') ? ['Pancha Mahapurusha Yoga', 'Mahapurusha Yoga'] : [],
      fields: fieldRows.map((r) => ({ id: r.id, label: r.label, rating: r.rating })),
      careerYogas: chart.yogas.filter((_, i) => !/no direct link/.test(yogaLines[i])).map((y) => y.name),
      nextAntardasha: nextAds[0]?.lord ?? null,
      d10Sensitive: (window.earlier ?? 61) <= 10 || (window.later ?? 61) <= 10,
      periodDates: [md?.start, md?.end, ad?.start, ad?.end, ...nextAds.slice(0, 2).flatMap((a) => [a.start, a.end]), nextMd?.start, nextMd?.end].filter(Boolean).map((x) => x!.slice(0, 10)),
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
