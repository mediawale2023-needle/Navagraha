/**
 * Canonical chart engine: the ONLY place natal astronomy is calculated.
 *
 * Swiss Ephemeris (sweph, Moshier analytic mode — no data files; sub-arcsecond
 * for the planets and arcsecond-level for the Moon over historical dates),
 * Lahiri sidereal ayanamsa, mean lunar node, whole-sign houses from the
 * sidereal Lagna. Every Jyotish layer below is derived from these longitudes
 * by the pure rule modules in astroEngine/.
 */
import sweph from 'sweph';
import {
  assertCanonicalChart, CALCULATION_ENGINE, CALCULATION_VERSION, CANONICAL_SCHEMA, CANONICAL_SCHEMA_VERSION,
  GRAHAS, SIGN_NAMES, type CanonicalChart, type Graha, type VargaDivision,
} from '@shared/v3/canonical';
import type { ResolvedBirth } from '../birthResolver.js';
import {
  nakshatraIndex, nakshatraPada, NAKSHATRAS, navamsaSign, dasamsaSign, shashtiamsaSign,
  drekkanaSign, chaturthamsaSign, saptamsaSign, dwadasamsaSign,
} from '../vedic.js';
import { computeDignities } from '../dignity.js';
import { computeBhava } from '../bhava.js';
import { computeAshtakavarga } from '../ashtakavarga.js';
import { detectYogas } from '../yogas.js';
import { mangalDosha, hasKaalSarpDosha, hasPitraDosha, hasVishaYoga } from '../doshas.js';
import { vimshottariDasha, yoginiDasha } from '../dasha.js';
import { computeCharKarakas, computeKarakamsha, calculateCharaDasha } from '../jaimini.js';
import { partialShadbala } from './shadbala.js';

const C = sweph.constants;
const FLAGS = C.SEFLG_SIDEREAL | C.SEFLG_MOSEPH | C.SEFLG_SPEED;
const SWEPH_IDS: Record<Exclude<Graha, 'Rahu' | 'Ketu'>, number> = {
  Sun: C.SE_SUN, Moon: C.SE_MOON, Mars: C.SE_MARS, Mercury: C.SE_MERCURY,
  Jupiter: C.SE_JUPITER, Venus: C.SE_VENUS, Saturn: C.SE_SATURN,
};

let sidModeSet = false;
function ensureLahiri() {
  if (!sidModeSet) { sweph.set_sid_mode(C.SE_SIDM_LAHIRI, 0, 0); sidModeSet = true; }
}

const norm = (x: number) => ((x % 360) + 360) % 360;
const signIdx = (lon: number) => Math.floor(norm(lon) / 30) % 12;

export class CalculationError extends Error {}

/** Julian day (UT) for an instant, via Swiss Ephemeris' own calendar conversion. */
export function julianDayUT(instant: Date): number {
  const r = sweph.utc_to_jd(
    instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate(),
    instant.getUTCHours(), instant.getUTCMinutes(),
    instant.getUTCSeconds() + instant.getUTCMilliseconds() / 1000, C.SE_GREG_CAL,
  );
  if (r.flag < 0 || r.error) throw new CalculationError(`Julian day conversion failed: ${r.error}`);
  return r.data[1];
}

export interface SiderealPositions {
  jdUT: number;
  ayanamsa: number;
  bodies: Record<Graha, { longitude: number; latitude: number; speed: number }>;
}

/** Sidereal (Lahiri) geocentric positions of the nine grahas at an instant. Fails loudly. */
export function siderealPositions(instant: Date): SiderealPositions {
  ensureLahiri();
  const jdUT = julianDayUT(instant);
  const bodies = {} as SiderealPositions['bodies'];
  for (const [name, id] of Object.entries(SWEPH_IDS)) {
    const r = sweph.calc_ut(jdUT, id, FLAGS);
    // A missing MOSEPH bit means sweph silently switched ephemeris; refuse.
    if (r.flag < 0 || r.error || (r.flag & C.SEFLG_MOSEPH) === 0) {
      throw new CalculationError(`Swiss Ephemeris failed for ${name}: ${r.error || `flag ${r.flag}`}`);
    }
    bodies[name as Graha] = { longitude: norm(r.data[0]), latitude: r.data[1], speed: r.data[3] };
  }
  const node = sweph.calc_ut(jdUT, C.SE_MEAN_NODE, FLAGS);
  if (node.flag < 0 || node.error) throw new CalculationError(`Swiss Ephemeris failed for the lunar node: ${node.error}`);
  bodies.Rahu = { longitude: norm(node.data[0]), latitude: 0, speed: node.data[3] };
  bodies.Ketu = { longitude: norm(node.data[0] + 180), latitude: 0, speed: node.data[3] };
  const ay = sweph.get_ayanamsa_ex_ut(jdUT, C.SEFLG_MOSEPH);
  if (ay.flag < 0 || ay.error) throw new CalculationError(`Ayanamsa calculation failed: ${ay.error}`);
  return { jdUT, ayanamsa: ay.data, bodies };
}

/** Sidereal Ascendant and MC for an instant and place. */
export function siderealAngles(jdUT: number, latitude: number, longitude: number): { ascendant: number; midheaven: number } {
  ensureLahiri();
  const h = sweph.houses_ex(jdUT, C.SEFLG_SIDEREAL, latitude, longitude, 'W');
  if (h.flag < 0 || !h.data?.points) throw new CalculationError('Swiss Ephemeris could not compute the Ascendant for this place and time');
  const ascendant = norm(h.data.points[0]);
  const midheaven = norm(h.data.points[1]);
  if (!Number.isFinite(ascendant) || !Number.isFinite(midheaven)) throw new CalculationError('Ascendant is undefined for this place and time');
  return { ascendant, midheaven };
}

/**
 * Next sunrise/sunset (UT JD) after `jdUT` at a place: Swiss rise_trans, disc centre,
 * standard refraction. Throws where the Sun does not rise or set (polar day/night).
 */
export function nextSunEvent(jdUT: number, latitude: number, longitude: number, event: 'rise' | 'set'): number {
  const flag = event === 'rise' ? C.SE_CALC_RISE : C.SE_CALC_SET;
  const r = sweph.rise_trans(jdUT, C.SE_SUN, '', C.SEFLG_MOSEPH, flag | C.SE_BIT_DISC_CENTER, [longitude, latitude, 0], 1013.25, 15);
  if (r.flag !== 0 || !Number.isFinite(r.data)) {
    throw new CalculationError('The Sun does not rise or set at this place on this date.');
  }
  return r.data;
}

export function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86_400_000);
}

function nakshatraOf(lon: number) {
  const i = nakshatraIndex(lon);
  return { index: i, name: NAKSHATRAS[i].name, lord: NAKSHATRAS[i].lord as Graha, pada: nakshatraPada(lon) };
}

const VARGA_RULES: Record<VargaDivision, { name: string; fn: (lon: number) => number }> = {
  D1: { name: 'Rasi', fn: signIdx },
  D3: { name: 'Drekkana', fn: drekkanaSign },
  D4: { name: 'Chaturthamsa', fn: chaturthamsaSign },
  D7: { name: 'Saptamsa', fn: saptamsaSign },
  D9: { name: 'Navamsa', fn: navamsaSign },
  D10: { name: 'Dasamsa', fn: dasamsaSign },
  D12: { name: 'Dwadasamsa', fn: dwadasamsaSign },
  D60: { name: 'Shashtiamsa', fn: shashtiamsaSign },
};

function moonStableAcrossDate(birth: ResolvedBirth) {
  // Moon at the first and last instant of the local birth date (same offset).
  const dayStart = Date.parse(`${birth.localDate}T00:00:00Z`) - birth.utcOffsetSeconds * 1000;
  const dayEnd = dayStart + 86_399_000;
  const a = siderealPositions(new Date(dayStart)).bodies.Moon.longitude;
  const b = siderealPositions(new Date(dayEnd)).bodies.Moon.longitude;
  return { sign: signIdx(a) === signIdx(b), nakshatra: nakshatraIndex(a) === nakshatraIndex(b) };
}

export interface ComputeOptions { calculatedAt?: Date }

export function computeCanonicalChart(birth: ResolvedBirth, opts: ComputeOptions = {}): CanonicalChart {
  const instant = new Date(birth.birthUTC);
  if (!Number.isFinite(instant.getTime())) throw new CalculationError('Birth instant is invalid');
  const { jdUT, ayanamsa, bodies } = siderealPositions(instant);
  const { ascendant: ascLon, midheaven: mcLon } = siderealAngles(jdUT, birth.latitude, birth.longitude);
  const ascSign = signIdx(ascLon);
  const sidereal = Object.fromEntries(GRAHAS.map((g) => [g, bodies[g].longitude])) as Record<Graha, number>;
  const houseOf = (lon: number) => ((signIdx(lon) - ascSign + 12) % 12) + 1;

  const planets = GRAHAS.map((name) => {
    const b = bodies[name];
    return {
      name,
      longitude: b.longitude,
      latitude: b.latitude,
      speed: b.speed,
      retrograde: b.speed < 0,
      signIndex: signIdx(b.longitude),
      sign: SIGN_NAMES[signIdx(b.longitude)],
      degreeInSign: norm(b.longitude) % 30,
      house: houseOf(b.longitude),
      nakshatra: nakshatraOf(b.longitude),
    };
  });
  const retro = Object.fromEntries(planets.map((p) => [p.name, p.retrograde]));

  const bhava = computeBhava(sidereal, ascLon);
  const houses = bhava.houseLords.map((h) => ({
    house: h.house,
    signIndex: (ascSign + h.house - 1) % 12,
    sign: SIGN_NAMES[(ascSign + h.house - 1) % 12],
    lord: h.lord as CanonicalChart['houses'][number]['lord'],
    lordHouse: h.lordHouse,
    occupants: planets.filter((p) => p.house === h.house).map((p) => p.name),
  }));

  const vargas = Object.fromEntries((Object.keys(VARGA_RULES) as VargaDivision[]).map((d) => {
    const { name, fn } = VARGA_RULES[d];
    const ascV = fn(ascLon);
    return [d, {
      division: d,
      name,
      ascendantSignIndex: ascV,
      placements: GRAHAS.map((g) => {
        const s = fn(sidereal[g]);
        return { planet: g, signIndex: s, sign: SIGN_NAMES[s], house: ((s - ascV + 12) % 12) + 1 };
      }),
    }];
  })) as CanonicalChart['vargas'];

  const dignities = computeDignities(sidereal, ascSign, retro);
  const avIndex: Record<string, number> = { Ascendant: ascSign };
  for (const p of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) avIndex[p] = signIdx(sidereal[p as Graha]);
  const av = computeAshtakavarga(avIndex);
  const yogas = detectYogas(sidereal, ascSign, signIdx(sidereal.Moon), dignities, bhava.houseLords);

  const marsHouse = houseOf(sidereal.Mars);
  const doshas: CanonicalChart['doshas'] = [
    mangalDosha(marsHouse, signIdx(sidereal.Mars), signIdx(sidereal.Jupiter)),
    { id: 'kaalSarp', name: 'Kaal Sarp Yoga', present: hasKaalSarpDosha(sidereal), rule: 'All seven planets lie on one side of the Rahu–Ketu axis.' },
    { id: 'pitru', name: 'Pitru Dosha (Sun–node conjunction)', present: hasPitraDosha(sidereal.Sun, sidereal.Rahu), rule: 'Sun within 15° of Rahu or Ketu (a simplified single-condition rule).' },
    { id: 'vishaYoga', name: 'Visha Yoga', present: hasVishaYoga(sidereal.Moon, sidereal.Saturn), rule: 'Moon and Saturn in the same sign or in mutual 7th.' },
  ];

  const vim = vimshottariDasha(sidereal.Moon, instant);
  const yog = yoginiDasha(sidereal.Moon, instant);
  const chara = calculateCharaDasha(ascLon, sidereal, instant);
  const karakas = computeCharKarakas(sidereal);
  const karakamsha = computeKarakamsha(sidereal, karakas);

  const approximate = birth.timeAccuracy === 'approximate';
  const ascDeg = norm(ascLon) % 30;
  const boundaryDistance = Math.min(ascDeg, 30 - ascDeg);
  const moonStability = moonStableAcrossDate(birth);
  const notes: string[] = [];
  if (approximate) notes.push('Birth time is approximate: Lagna, houses, house lords, time-sensitive vargas (D3–D60) and dasha start dates are unreliable.');
  if (!approximate && boundaryDistance < 1) notes.push(`The Ascendant is within ${boundaryDistance.toFixed(2)}° of a sign boundary; a few minutes of birth-time error would change the Lagna.`);
  if (approximate && !moonStability.sign) notes.push('The Moon changed sign during the birth date, so even the Moon sign depends on the unknown birth time.');
  else if (approximate && !moonStability.nakshatra) notes.push('The Moon changed nakshatra during the birth date, so the dasha sequence depends on the unknown birth time.');

  const chart = {
    meta: {
      schema: CANONICAL_SCHEMA,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      engine: CALCULATION_ENGINE,
      engineVersion: CALCULATION_VERSION,
      ephemeris: 'Swiss Ephemeris (Moshier analytic mode)',
      ephemerisVersion: String(sweph.version()),
      ayanamsa: 'Lahiri' as const,
      ayanamsaDegrees: ayanamsa,
      zodiac: 'sidereal' as const,
      houseSystem: 'whole-sign' as const,
      nodeType: 'mean' as const,
      julianDayUT: jdUT,
      calculatedAt: (opts.calculatedAt ?? new Date()).toISOString(),
    },
    birth: { ...birth },
    uncertainty: {
      timeAccuracy: birth.timeAccuracy,
      ascendantReliable: !approximate,
      ascendantDegreesFromSignBoundary: boundaryDistance,
      moonSignStableAcrossBirthDate: moonStability.sign,
      moonNakshatraStableAcrossBirthDate: moonStability.nakshatra,
      notes,
    },
    ascendant: { longitude: ascLon, signIndex: ascSign, sign: SIGN_NAMES[ascSign], degreeInSign: ascDeg, nakshatra: nakshatraOf(ascLon) },
    midheaven: { longitude: mcLon, signIndex: signIdx(mcLon), sign: SIGN_NAMES[signIdx(mcLon)] },
    planets,
    houses,
    aspects: bhava.aspects,
    vargas,
    strength: {
      dignities,
      ashtakavarga: { bav: av.bav, sav: av.sav, savByHouse: Array.from({ length: 12 }, (_, h) => av.sav[(ascSign + h) % 12]) },
      shadbala: partialShadbala(sidereal, ascLon, mcLon),
    },
    yogas,
    doshas,
    dashas: {
      vimshottari: vim,
      yogini: { birthYogini: yog.birthYogini, elapsedFractionAtBirth: yog.elapsedFractionAtBirth, periods: yog.periods },
      chara: {
        verified: false as const,
        methodology: 'Sign-based Chara Dasha from the Lagna; period length = inclusive count from the sign to its lord (12 when the lord occupies the sign). Lineages differ on this count; cross-check before quoting dates.',
        periods: chara.map((c) => ({ sign: c.sign as CanonicalChart['dashas']['chara']['periods'][number]['sign'], years: c.years, start: new Date(Date.parse(`${c.startDate}T00:00:00Z`)).toISOString(), end: new Date(Date.parse(`${c.endDate}T00:00:00Z`)).toISOString() })),
      },
    },
    jaimini: {
      charaKarakas: karakas,
      karakamshaSign: karakamsha.karakamshaSign as CanonicalChart['jaimini']['karakamshaSign'],
    },
  };
  return assertCanonicalChart(chart);
}
