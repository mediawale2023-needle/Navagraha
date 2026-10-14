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
}

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

const GENERIC = /\b(leadership (?:potential|qualities|capabilities|roles?)|hard work|networking|success will come|bright future|great potential|strong potential|many opportunities|opportunities will|natural leader)\b/i;
const ANCHOR = /\b(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu|lord|house|D10|Dasamsa|Lagna|Ascendant|Mahadasha|Antardasha|dasha|bindus?|Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)\b/;
const YOGA_NAME = /\b((?:[A-Z][a-z]+[ -])*[A-Z][a-z]+) Yoga\b/g;
const NOT_A_NAME = new Set(['This', 'The', 'That', 'A', 'An', 'Such', 'Each', 'Every', 'Any', 'No', 'These', 'Those', 'Its', 'Your', 'One', 'Another', 'Which', 'What', 'Its', 'Both']);

/** Career-only problems in one section; [] when it passes. Run after the shared guard. */
export function careerSectionProblems(heading: string, body: string, f: CareerFacts): string[] {
  const out: string[] = [];
  const has = (re: RegExp) => re.test(body);
  const word = (s: string) => new RegExp(`\\b${s}\\b`);
  if (heading === 'Tenth House & Its Lord (D1)') {
    if (!has(/\b10th house\b|\btenth house\b/i)) out.push('must discuss the 10th house of the D1 chart');
    if (!has(word(f.tenthLord))) out.push(`must name the 10th lord, ${f.tenthLord}, and read its placement`);
  }
  if (heading === 'Dasamsa (D10) Analysis') {
    if (!has(/\bD10\b|\bDasamsa\b/i)) out.push('must discuss the D10 (Dasamsa) chart');
    if (!has(word(f.d10LagnaSign))) out.push(`must name the D10 Lagna, ${f.d10LagnaSign}`);
    if (!has(word(f.d10TenthLord))) out.push(`must name the D10 10th lord, ${f.d10TenthLord}`);
  }
  if (heading === 'Growth Timing & Dashas') {
    if (f.mahadasha && !has(word(f.mahadasha))) out.push(`must name the running Mahadasha lord, ${f.mahadasha}`);
    if (f.antardasha && !has(/\bAntardasha\b|\bsub-?period\b/i)) out.push(`must discuss the running Antardasha (${f.antardasha})`);
  }
  for (const s of body.split(/(?<=[.!?])\s+/)) {
    if (GENERIC.test(s) && !ANCHOR.test(s)) out.push(`generic statement with no chart evidence: "${s.trim().slice(0, 160)}"`);
    if (/\b(D10|Dasamsa)\b/i.test(s) && /\d+(?:\.\d+)?\s?°|\bdegrees?\b/i.test(s)) out.push('states a D10 degree; the engine calculates D10 signs and houses only');
  }
  // A family name ("Pancha Mahapurusha Yoga", "Vipreeta Raja Yoga") is allowed when a yoga of that family was detected.
  const known = [...f.yogaNames, ...(f.yogaFamilies ?? [])].map((n) => n.toLowerCase());
  for (const m of Array.from(body.matchAll(YOGA_NAME))) {
    const words = m[1].split(/[ -]/);
    while (words.length && NOT_A_NAME.has(words[0])) words.shift();
    if (!words.length) continue;
    const name = `${words.join(' ')} Yoga`.toLowerCase();
    if (!known.some((k) => k === name || k.endsWith(` ${name}`))) out.push(`names ${words.join(' ')} Yoga, which the engine did not detect`);
  }
  return Array.from(new Set(out));
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
