/**
 * Which chart facts an approximate birth time can support.
 *
 * An approximate chart is calculated at a placeholder time, but the person could have been
 * born at any moment of the local birth date. A fact is "stable" only when it is the same at
 * every instant of that day. Planets move in one direction except at a station, so a planet's
 * sign, nakshatra, dignity and combustion are compared at the day's first and last instants
 * (plus the placeholder and midday); a planet whose motion changes direction during the day
 * is treated as unstable in every respect. The Lagna, houses, house lords and everything
 * derived from them (Neecha Bhanga, house-based yogas, Mangal Dosha, vargas, Ashtakavarga)
 * are never stable with an approximate time.
 *
 * Read-time only: nothing is stored, the canonical chart is unchanged, and an exact chart
 * reports every fact as stable without any calculation.
 */
import { GRAHAS, SIGN_NAMES, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { computeDignities } from '../dignity.js';
import { hasKaalSarpDosha, hasPitraDosha, hasVishaYoga } from '../doshas.js';
import { NAKSHATRAS, nakshatraIndex } from '../vedic.js';
import { birthDayBounds, siderealPositions } from './compute.js';

export interface PlanetStability {
  sign: boolean;
  nakshatra: boolean;
  dignity: boolean;
  combust: boolean;
  retrograde: boolean;
  /** Every sign the planet occupies during the birth date, in order. */
  signs: string[];
}

export interface BirthDayStability {
  approximate: boolean;
  planets: Record<Graha, PlanetStability>;
  doshas: { kaalSarp: boolean; pitru: boolean; vishaYoga: boolean };
}

const signIdx = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;
const same = <T>(xs: T[]) => xs.every((x) => x === xs[0]);
const cache = new WeakMap<CanonicalChart, BirthDayStability>();

export function birthDayStability(chart: CanonicalChart): BirthDayStability {
  const hit = cache.get(chart);
  if (hit) return hit;
  const approximate = chart.birth.timeAccuracy === 'approximate';
  let result: BirthDayStability;
  if (!approximate) {
    const planets = Object.fromEntries(chart.planets.map((p) => [p.name, { sign: true, nakshatra: true, dignity: true, combust: true, retrograde: true, signs: [p.sign] }])) as Record<Graha, PlanetStability>;
    result = { approximate, planets, doshas: { kaalSarp: true, pitru: true, vishaYoga: true } };
  } else {
    const { dayStart, dayEnd } = birthDayBounds(chart.birth);
    const instants = [dayStart, Date.parse(chart.birth.birthUTC), (dayStart + dayEnd) / 2, dayEnd].sort((a, b) => a - b);
    const samples = instants.map((t) => {
      const { bodies } = siderealPositions(new Date(t));
      const lons = Object.fromEntries(GRAHAS.map((g) => [g, bodies[g].longitude])) as Record<Graha, number>;
      const retro = Object.fromEntries(GRAHAS.map((g) => [g, bodies[g].speed < 0])) as Record<string, boolean>;
      // The Ascendant argument only feeds Neecha Bhanga, which is never used from an approximate chart.
      const dig = Object.fromEntries(computeDignities(lons, 0, retro).map((d) => [d.planet, d]));
      return { lons, retro, dig };
    });
    const planets = {} as Record<Graha, PlanetStability>;
    for (const g of GRAHAS) {
      const retrograde = same(samples.map((s) => s.retro[g]));
      const signs = samples.map((s) => signIdx(s.lons[g]));
      const naks = samples.map((s) => nakshatraIndex(s.lons[g]));
      const dignity = g === 'Rahu' || g === 'Ketu' ? true : same(samples.map((s) => s.dig[g]?.dignity));
      const combust = g === 'Rahu' || g === 'Ketu' ? true : same(samples.map((s) => s.dig[g]?.combust));
      // A station during the day can carry a planet back over a boundary between samples.
      const ok = (stable: boolean) => retrograde && stable;
      planets[g] = {
        sign: ok(same(signs)),
        nakshatra: ok(same(naks.map((i) => NAKSHATRAS[i].name))),
        dignity: ok(dignity),
        combust: ok(combust),
        retrograde,
        signs: Array.from(new Set(signs)).map((i) => SIGN_NAMES[i]),
      };
    }
    // The Moon's flags come from the canonical chart, so every consumer agrees with it.
    planets.Moon = { ...planets.Moon, sign: chart.uncertainty.moonSignStableAcrossBirthDate && planets.Moon.sign, nakshatra: chart.uncertainty.moonNakshatraStableAcrossBirthDate && planets.Moon.nakshatra };
    result = {
      approximate,
      planets,
      doshas: {
        kaalSarp: same(samples.map((s) => hasKaalSarpDosha(s.lons))),
        pitru: same(samples.map((s) => hasPitraDosha(s.lons.Sun, s.lons.Rahu))),
        vishaYoga: same(samples.map((s) => hasVishaYoga(s.lons.Moon, s.lons.Saturn))),
      },
    };
  }
  cache.set(chart, result);
  return result;
}

// Yogas that need no Lagna, and the planets whose signs form them.
const SIGN_BASED_YOGAS: Record<string, Graha[]> = {
  'Gajakesari Yoga': ['Moon', 'Jupiter'],
  'Budha-Aditya Yoga': ['Sun', 'Mercury'],
  'Chandra-Mangala Yoga': ['Moon', 'Mars'],
};

/**
 * Whether a yoga's presence holds across the whole birth date. Every other yoga the engine
 * computes is formed from houses or house lords, or (Kemadruma) cancelled by the Moon's house.
 */
export function yogaTimeStable(name: string, st: BirthDayStability): boolean {
  if (!st.approximate) return true;
  const planets = SIGN_BASED_YOGAS[name];
  return !!planets && planets.every((g) => st.planets[g].sign);
}

/**
 * Whether a planet's dignity statement (dignity and combustion) holds across the birth date.
 * A debilitated planet's Neecha Bhanga is judged from the Lagna, so whether its debilitation
 * is cancelled is unknown with an approximate time.
 */
export function dignityStatementStable(chart: CanonicalChart, st: BirthDayStability, g: Graha): boolean {
  if (!st.approximate) return true;
  const p = st.planets[g];
  const d = chart.strength.dignities.find((x) => x.planet === g);
  return p.dignity && p.combust && d?.dignity !== 'Debilitated';
}
