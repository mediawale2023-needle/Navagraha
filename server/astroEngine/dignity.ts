/**
 * Planetary dignity, avastha and states — what actually "delivers".
 * Exaltation/debilitation (with Neecha-bhanga), Moolatrikona, own/friend/enemy
 * (Naisargika Maitri), combustion (Asta), planetary war (Graha Yuddha),
 * retrogression and Baladi avastha.
 */
import { SIGNS } from './vedic.js';

const DIGNITY_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

// sign index: 0=Aries … 11=Pisces
const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const DEBIL: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };
const OWN: Record<string, number[]> = { Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10] };
const MOOLA: Record<string, { s: number; lo: number; hi: number }> = {
  Sun: { s: 4, lo: 0, hi: 20 }, Moon: { s: 1, lo: 3, hi: 30 }, Mars: { s: 0, lo: 0, hi: 12 },
  Mercury: { s: 5, lo: 16, hi: 20 }, Jupiter: { s: 8, lo: 0, hi: 10 }, Venus: { s: 6, lo: 0, hi: 15 }, Saturn: { s: 10, lo: 0, hi: 20 },
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

export function computeDignities(
  sidereal: Record<string, number>,
  ascSignIndex: number,
  retro: Record<string, boolean> = {},
): PlanetDignity[] {
  const sunLon = sidereal['Sun'] ?? 0;
  const houseFromLagna = (s: number) => ((s - ascSignIndex + 12) % 12) + 1;
  const planetHouse: Record<string, number> = {};
  for (const p of DIGNITY_PLANETS) planetHouse[p] = houseFromLagna(signOf(sidereal[p] ?? 0));

  return DIGNITY_PLANETS.map((p) => {
    const lon = sidereal[p] ?? 0;
    const s = signOf(lon);
    const d = degOf(lon);

    let dignity: string;
    if (EXALT[p] === s) dignity = 'Exalted';
    else if (DEBIL[p] === s) dignity = 'Debilitated';
    else if (MOOLA[p].s === s && d >= MOOLA[p].lo && d < MOOLA[p].hi) dignity = 'Moolatrikona';
    else if (OWN[p].includes(s)) dignity = 'Own sign';
    else {
      const lord = SIGN_LORDS[s];
      if (lord === p) dignity = 'Own sign';
      else if (FRIENDS[p].includes(lord)) dignity = "Friend's sign";
      else if (ENEMIES[p].includes(lord)) dignity = "Enemy's sign";
      else dignity = 'Neutral sign';
    }

    const combust = p !== 'Sun' && angSep(lon, sunLon) <= (COMBUST_ORB[p] ?? 0);

    let planetaryWar: string | undefined;
    if (WAR_PLANETS.includes(p)) {
      for (const q of WAR_PLANETS) {
        if (q !== p && angSep(lon, sidereal[q] ?? 0) <= 1) { planetaryWar = q; break; }
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
