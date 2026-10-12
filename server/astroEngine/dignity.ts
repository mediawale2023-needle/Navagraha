/**
 * Planetary dignity, avastha and states — what actually "delivers".
 * Exaltation/debilitation (with Neecha-bhanga), Moolatrikona, own/friend/enemy
 * (Naisargika Maitri), combustion (Asta), planetary war (Graha Yuddha),
 * retrogression and Baladi avastha.
 */
import { SIGNS } from './vedic.js';
import { lonOf } from './lon.js';

const DIGNITY_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

// sign index: 0=Aries … 11=Pisces
const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBIL: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };
const OWN: Record<string, number[]> = { Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10] };
// Degree ranges within a sign are half-open, [lo, hi). Source: BPHS ch. 3 (Graha Guna Svarupa,
// R. Santhanam's translation): the Moon is exalted in the first 3° of Taurus and Moolatrikona in the
// rest; Mercury is exalted in the first 15° of Virgo, Moolatrikona in the next 5° and in its own sign
// in the last 10°. Only the Moon and Mercury share their exaltation sign with Moolatrikona or own
// sign, so for every other planet exaltation is the whole sign, as before.
const EXALT_RANGE: Record<string, { lo: number; hi: number }> = { Moon: { lo: 0, hi: 3 }, Mercury: { lo: 0, hi: 15 } };
const MOOLA: Record<string, { s: number; lo: number; hi: number }> = {
  Sun: { s: 4, lo: 0, hi: 20 }, Moon: { s: 1, lo: 3, hi: 30 }, Mars: { s: 0, lo: 0, hi: 12 },
  Mercury: { s: 5, lo: 15, hi: 20 }, Jupiter: { s: 8, lo: 0, hi: 10 }, Venus: { s: 6, lo: 0, hi: 15 }, Saturn: { s: 10, lo: 0, hi: 20 },
};
const FRIENDS: Record<string, string[]> = {
  Sun: ['Moon', 'Mars', 'Jupiter'], Moon: ['Sun', 'Mercury'], Mars: ['Sun', 'Moon', 'Jupiter'],
  Mercury: ['Sun', 'Venus'], Jupiter: ['Sun', 'Moon', 'Mars'], Venus: ['Mercury', 'Saturn'], Saturn: ['Mercury', 'Venus'],
};
const ENEMIES: Record<string, string[]> = {
  Sun: ['Venus', 'Saturn'], Moon: [], Mars: ['Mercury'], Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'], Venus: ['Sun', 'Moon'], Saturn: ['Sun', 'Moon', 'Mars'],
};
const COMBUST_ORB: Record<string, number> = { Moon: 12, Mars: 17, Mercury: 14, Jupiter: 11, Venus: 10, Saturn: 15 };
const WAR_PLANETS = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const AVASTHA = ['Bala (infant)', 'Kumara (youth)', 'Yuva (adult)', 'Vriddha (old)', 'Mrita (dead)'];

/** Naisargika (natural) relationship of `planet` towards `other`, for the seven grahas. */
export function naturalRelation(planet: string, other: string): 'friend' | 'neutral' | 'enemy' {
  if (FRIENDS[planet]?.includes(other)) return 'friend';
  if (ENEMIES[planet]?.includes(other)) return 'enemy';
  return 'neutral';
}

export interface PlanetDignity {
  planet: string;
  sign: string;
  degree: number;
  dignity: string;       // Exalted | Debilitated | Moolatrikona | Own sign | Friend's sign | Enemy's sign | Neutral sign
  retrograde: boolean;
  combust: boolean;
  planetaryWar?: string; // name of the planet it is at war with
  avastha: string;
  neechaBhanga?: boolean;
}

const norm = (lon: number) => ((lon % 360) + 360) % 360;
const signOf = (lon: number) => Math.floor(norm(lon) / 30) % 12;
const degOf = (lon: number) => norm(lon) % 30;
function angSep(a: number, b: number): number {
  let d = Math.abs(norm(a) - norm(b));
  if (d > 180) d = 360 - d;
  return d;
}

/** Dignity of one of the seven grahas at `degree` (0–30) within the sign `signIndex`. */
export function dignityAt(planet: string, signIndex: number, degree: number): PlanetDignity['dignity'] {
  const ex = EXALT_RANGE[planet];
  const moola = MOOLA[planet];
  if (EXALT[planet] === signIndex && (!ex || (degree >= ex.lo && degree < ex.hi))) return 'Exalted';
  if (DEBIL[planet] === signIndex) return 'Debilitated';
  if (moola.s === signIndex && degree >= moola.lo && degree < moola.hi) return 'Moolatrikona';
  if (OWN[planet].includes(signIndex)) return 'Own sign';
  const lord = SIGN_LORDS[signIndex];
  if (FRIENDS[planet].includes(lord)) return "Friend's sign";
  if (ENEMIES[planet].includes(lord)) return "Enemy's sign";
  return 'Neutral sign';
}

export function computeDignities(
  sidereal: Record<string, number>,
  ascSignIndex: number,
  retro: Record<string, boolean> = {},
): PlanetDignity[] {
  const sunLon = lonOf(sidereal, 'Sun');
  const houseFromLagna = (s: number) => ((s - ascSignIndex + 12) % 12) + 1;
  const planetHouse: Record<string, number> = {};
  for (const p of DIGNITY_PLANETS) planetHouse[p] = houseFromLagna(signOf(lonOf(sidereal, p)));

  return DIGNITY_PLANETS.map((p) => {
    const lon = lonOf(sidereal, p);
    const s = signOf(lon);
    const d = degOf(lon);

    const dignity = dignityAt(p, s, d);

    const combust = p !== 'Sun' && angSep(lon, sunLon) <= (COMBUST_ORB[p] ?? 0);

    let planetaryWar: string | undefined;
    if (WAR_PLANETS.includes(p)) {
      for (const q of WAR_PLANETS) {
        if (q !== p && angSep(lon, lonOf(sidereal, q)) <= 1) { planetaryWar = q; break; }
      }
    }

    // Baladi avastha: odd signs run infant→dead with degree; even signs reverse.
    const oddSign = s % 2 === 0; // index 0 (Aries) = 1st sign = odd
    const seg = Math.min(4, Math.floor(d / 6));
    const avastha = oddSign ? AVASTHA[seg] : AVASTHA[4 - seg];

    let neechaBhanga: boolean | undefined;
    if (dignity === 'Debilitated') {
      const inKendra = (pl?: string) => !!pl && [1, 4, 7, 10].includes(planetHouse[pl]);
      const dispositor = SIGN_LORDS[s];
      const exaltedHere = Object.keys(EXALT).find((pl) => EXALT[pl] === s);
      neechaBhanga = inKendra(dispositor) || inKendra(exaltedHere);
    }

    return {
      planet: p,
      sign: SIGNS[s],
      degree: parseFloat(d.toFixed(2)),
      dignity,
      retrograde: !!retro[p],
      combust,
      planetaryWar,
      avastha,
      neechaBhanga,
    };
  });
}

/** Dignity of a planet placed in a sign (no degree-dependent Moolatrikona), e.g. for a varga placement. */
export function signDignity(planet: string, signIndex: number): 'Exalted' | 'Debilitated' | 'Own sign' | "Friend's sign" | "Enemy's sign" | 'Neutral sign' | null {
  if (!DIGNITY_PLANETS.includes(planet)) return null;
  if (EXALT[planet] === signIndex) return 'Exalted';
  if (DEBIL[planet] === signIndex) return 'Debilitated';
  if (OWN[planet].includes(signIndex)) return 'Own sign';
  const lord = SIGN_LORDS[signIndex];
  if (FRIENDS[planet].includes(lord)) return "Friend's sign";
  if (ENEMIES[planet].includes(lord)) return "Enemy's sign";
  return 'Neutral sign';
}
