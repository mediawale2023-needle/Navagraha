/**
 * Native Astrology Engine — Public API
 *
 * All calculations are performed locally with zero external dependencies.
 */

import { julianDay, toSidereal, lahiriAyanamsa } from './core.js';
import { allPlanetPositions, ascendant }          from './planets.js';
import {
  SIGNS, signFromLon, degreeInSign, nakshatraFromLon, houseFromLon, signOfHouse, getRemedies,
} from './vedic.js';
import { calculateDashas }     from './dasha.js';
import { hasMangalDosha, hasKaalSarpDosha, hasPitraDosha } from './doshas.js';
import { ashtakootMatch }      from './matching.js';
import { calculateNumerology } from './numerology.js';
import { getDailyHoroscope as _getDailyHoroscope } from './horoscope.js';

// Re-export horoscope types for convenience
export { getDailyHoroscope } from './horoscope.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NativeKundliResult {
  zodiacSign:  string;
  moonSign:    string;
  ascendant:   string;
  nakshatra:   string;
  chartData: {
    houses:             Array<{ house: number; sign: string; planets: string[] }>;
    planetaryPositions: Array<{ planet: string; sign: string; degree: number; house: number; isRetrograde: boolean }>;
  };
  dashas:   Array<{ planet: string; period: string; status: string; startDate: string; endDate: string }>;
  doshas:   { mangalDosha: boolean; kaalSarpDosha: boolean; pitruDosha: boolean };
  remedies: Array<{ title: string; description: string; type: string }>;
  raw: Record<string, unknown>;
}

export interface NativeMatchResult {
  score:          number;
  maxScore:       number;
  percentage:     number;
  details:        Array<{ koot: string; score: number; maxScore: number; description: string }>;
  compatibility:  string;
  recommendation: string;
  dosha:          { hasDosha: boolean; type: string; description: string };
  raw: Record<string, unknown>;
}

export interface NativeHoroscope {
  sign:       string;
  date:       string;
  prediction: string;
  lucky: { number: string; color: string; time: string };
}

export interface NativeNumerology {
  lifePath:    number;
  destiny:     number;
  soul:        number;
  personality: number;
  birthday:    number;
  name:        string;
  details:     Record<string, unknown>;
  raw: Record<string, unknown>;
}

// ─── Datetime Parsing ─────────────────────────────────────────────────────────

/**
 * Parse a birth date/time combination into a UTC Date.
 *
 * @param dateOfBirth  JS Date or ISO date string (date part used)
 * @param timeOfBirth  "HH:MM" or "HH:MM:SS" in IST (+05:30)
 * @param latitudeDeg  Birth latitude (used for timezone offset; defaults to IST if not provided)
 */
function parseBirthDateTime(dateOfBirth: Date | string, timeOfBirth: string): Date {
  const d   = new Date(dateOfBirth);
  const y   = d.getUTCFullYear();
  const mo  = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  const [hh, mm, ss = '0'] = timeOfBirth.split(':');

  // Birth time is assumed to be IST (UTC+5:30) — the Indian standard
  const istOffsetMin = 5 * 60 + 30;
  const localMin =
    parseInt(hh, 10) * 60 + parseInt(mm, 10) + parseInt(ss, 10) / 60;
  const utcMin = localMin - istOffsetMin;

  // Build a UTC date
  const utc = new Date(Date.UTC(y, mo - 1, day, 0, 0, 0));
  utc.setUTCMinutes(utc.getUTCMinutes() + utcMin);
  return utc;
}

// ─── Kundli ───────────────────────────────────────────────────────────────────

/**
 * Generate a complete Vedic birth chart (Kundli).
 *
 * @param dateOfBirth  Date or ISO string of birth
 * @param timeOfBirth  "HH:MM" in IST
 * @param latitude     Geographic latitude (+N)
 * @param longitude    Geographic longitude (+E)
 */
export async function getKundli(
  dateOfBirth: Date | string,
  timeOfBirth: string,
  latitude: number,
  longitude: number,
): Promise<NativeKundliResult> {
  const birthUTC = parseBirthDateTime(dateOfBirth, timeOfBirth);
  const jd = julianDay(birthUTC);

  // All tropical longitudes
  const tropical = allPlanetPositions(jd);

  // Sidereal longitudes
  const ayanamsa = lahiriAyanamsa(jd);
  const sidereal: Record<string, number> = {};
  for (const [name, pos] of Object.entries(tropical)) {
    sidereal[name] = ((pos.lon - ayanamsa) % 360 + 360) % 360;
  }

  // Ascendant (tropical → sidereal)
  const ascTropical  = ascendant(jd, latitude, longitude);
  const ascSidereal  = ((ascTropical - ayanamsa) % 360 + 360) % 360;

  // Signs
  const sunSign    = signFromLon(sidereal['Sun']);
  const moonSign   = signFromLon(sidereal['Moon']);
  const lagnaSign  = signFromLon(ascSidereal);
  const nakshatra  = nakshatraFromLon(sidereal['Moon']);

  // Planetary positions array
  const PLANET_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const planetaryPositions = PLANET_NAMES.map(name => ({
    planet:       name,
    sign:         signFromLon(sidereal[name] ?? 0),
    degree:       parseFloat(degreeInSign(sidereal[name] ?? 0).toFixed(2)),
    house:        houseFromLon(sidereal[name] ?? 0, ascSidereal),
    isRetrograde: tropical[name]?.isRetrograde ?? false,
  }));

  // Ascendant as a pseudo-planet for house calculation
  const ascEntry = {
    planet: 'Ascendant', sign: lagnaSign,
    degree: parseFloat(degreeInSign(ascSidereal).toFixed(2)),
    house: 1, isRetrograde: false,
  };

  // 12 houses (Whole Sign)
  const houses = Array.from({ length: 12 }, (_, i) => ({
    house:   i + 1,
    sign:    signOfHouse(i + 1, ascSidereal),
    planets: planetaryPositions
      .filter(p => p.house === i + 1)
      .map(p => p.planet),
  }));

  // Vimshottari Dasha
  const dashas = calculateDashas(sidereal['Moon'], birthUTC);

  // Doshas
  const marsHouse = planetaryPositions.find(p => p.planet === 'Mars')?.house ?? 0;
  const mangalDosha  = hasMangalDosha(marsHouse);
  const kaalSarpDosha = hasKaalSarpDosha(sidereal);
  const pitruDosha   = hasPitraDosha(sidereal['Sun'] ?? 0, sidereal['Rahu'] ?? 0);

  // Remedies based on Moon nakshatra lord
  const remedies = getRemedies(nakshatra.lord);

  return {
    zodiacSign:  sunSign,
    moonSign,
    ascendant:   lagnaSign,
    nakshatra:   nakshatra.name,
    chartData: {
      houses,
      planetaryPositions: [ascEntry, ...planetaryPositions],
    },
    dashas: dashas.map(d => ({
      planet:      d.planet,
      period:      d.period,
      status:      d.status,
      startDate:   d.startDate,
      endDate:     d.endDate,
      antardashas: d.antardashas,
    })),
    doshas: { mangalDosha, kaalSarpDosha, pitruDosha },
    remedies,
    raw: { ayanamsa, jd },
  };
}

// ─── Kundli Matching ──────────────────────────────────────────────────────────

/**
 * Ashtakoot compatibility matching between two people.
 *
 * Both persons' Moon positions are needed. We compute them from their
 * birth data so the caller only needs to supply the same fields as for getKundli.
 */
export async function getKundliMatching(
  person1: { dateOfBirth: Date | string; timeOfBirth: string; latitude: number; longitude: number },
  person2: { dateOfBirth: Date | string; timeOfBirth: string; latitude: number; longitude: number },
): Promise<NativeMatchResult> {
  const moonLon = (p: typeof person1) => {
    const utc = parseBirthDateTime(p.dateOfBirth, p.timeOfBirth);
    const jd  = julianDay(utc);
    const tropical = allPlanetPositions(jd);
    return toSidereal(tropical['Moon'].lon, jd);
  };

  const girlMoon = moonLon(person1);
  const boyMoon  = moonLon(person2);

  const result = ashtakootMatch(girlMoon, boyMoon);

  return { ...result, raw: { girlMoon, boyMoon } };
}

// ─── Daily Horoscope ──────────────────────────────────────────────────────────

export async function getNativeHoroscope(
  sign: string,
  date: 'today' | 'yesterday' | 'tomorrow' = 'today',
  type: 'general' | 'career' | 'health' | 'love' = 'general',
): Promise<NativeHoroscope> {
  return _getDailyHoroscope(sign, date, type);
}

// ─── Numerology ───────────────────────────────────────────────────────────────

export async function getNumerology(
  dateOfBirth: Date | string,
  firstName: string,
  lastName = '',
): Promise<NativeNumerology> {
  const dob = new Date(dateOfBirth);
  const result = calculateNumerology(dob, firstName, lastName);

  return {
    lifePath:    result.lifePath,
    destiny:     result.destiny,
    soul:        result.soul,
    personality: result.personality,
    birthday:    result.birthday,
    name:        result.name,
    details:     result.details,
    raw:         {},
  };
}

// ─── Availability Check ───────────────────────────────────────────────────────

/** The native engine is always available (no API keys required). */
export function isNativeEngineAvailable(): boolean {
  return true;
}
