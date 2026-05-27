/**
 * Native Astrology Engine — Public API
 *
 * All calculations are performed locally with zero external dependencies.
 */

import { julianDay, toSidereal, lahiriAyanamsa } from './core.js';
import { allPlanetPositions, ascendant }          from './planets.js';
import {
  SIGNS, signFromLon, degreeInSign, nakshatraFromLon, houseFromLon, signOfHouse, getRemedies,
  navamsaSign, navamsaDegree,
} from './vedic.js';
import { calculateDashas, calculateYoginiDasha } from './dasha.js';
import { computeAshtakavarga } from './ashtakavarga.js';
import { computeDignities } from './dignity.js';
import { computeBhava } from './bhava.js';
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
    navamsa?: {
      houses:             Array<{ house: number; sign: string; planets: string[] }>;
      planetaryPositions: Array<{ planet: string; sign: string; degree: number; house: number; isRetrograde: boolean }>;
    };
    ashtakavarga?: {
      ascSignIndex: number;
      bav: Record<string, number[]>;  // planet -> bindus per sign (0=Aries)
      sav: number[];                  // per sign (0=Aries)
      savByHouse: number[];           // index 0 = 1st house (Lagna sign)
    };
    dignities?: Array<{ planet: string; sign: string; degree: number; dignity: string; retrograde: boolean; combust: boolean; planetaryWar?: string; avastha: string; neechaBhanga?: boolean }>;
    bhava?: {
      houseLords: Array<{ house: number; sign: string; lord: string; lordSign: string; lordHouse: number }>;
      aspects: Array<{ planet: string; aspectsHouses: number[]; aspectsPlanets: string[] }>;
      chalit: Array<{ planet: string; rasiHouse: number; chalitHouse: number; shifted: boolean }>;
      karakas: Record<number, string>;
    };
    yoginiDasha?: Array<{ yogini: string; lord: string; period: string; status: string; startDate: string; endDate: string }>;
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

  // ─── Navamsa (D9) — Parashari ─────────────────────────────────
  const ascNavSign = navamsaSign(ascSidereal);
  const navamsaPositions = PLANET_NAMES.map(name => {
    const navSign = navamsaSign(sidereal[name] ?? 0);
    return {
      planet:       name,
      sign:         SIGNS[navSign],
      degree:       parseFloat(navamsaDegree(sidereal[name] ?? 0).toFixed(2)),
      house:        ((navSign - ascNavSign + 12) % 12) + 1,
      isRetrograde: tropical[name]?.isRetrograde ?? false,
    };
  });
  const navAscEntry = {
    planet: 'Ascendant', sign: SIGNS[ascNavSign],
    degree: parseFloat(navamsaDegree(ascSidereal).toFixed(2)), house: 1, isRetrograde: false,
  };
  const navamsaHouses = Array.from({ length: 12 }, (_, i) => {
    const signIdx = (ascNavSign + i) % 12;
    return {
      house:   i + 1,
      sign:    SIGNS[signIdx],
      planets: navamsaPositions.filter(p => p.house === i + 1).map(p => p.planet),
    };
  });

  // ─── Ashtakavarga (BAV + SAV) ─────────────────────────────────
  const avSignIndex: Record<string, number> = { Ascendant: Math.floor((ascSidereal % 360) / 30) % 12 };
  for (const p of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
    avSignIndex[p] = Math.floor(((sidereal[p] ?? 0) % 360) / 30) % 12;
  }
  const av = computeAshtakavarga(avSignIndex);
  const ashtakavarga = {
    ascSignIndex: avSignIndex.Ascendant,
    bav: av.bav,
    sav: av.sav,
    savByHouse: Array.from({ length: 12 }, (_, h) => av.sav[(avSignIndex.Ascendant + h) % 12]),
  };

  // ─── Planetary dignity & avastha ──────────────────────────────
  const retroMap: Record<string, boolean> = {};
  for (const [name, pos] of Object.entries(tropical)) retroMap[name] = (pos as any).isRetrograde ?? false;
  const dignities = computeDignities(sidereal, avSignIndex.Ascendant, retroMap);

  // ─── Bhava: house lords, aspects, karakas, chalit ─────────────
  const bhava = computeBhava(sidereal, ascSidereal);

  // Vimshottari Dasha (+ Yogini cross-confirming dasha)
  const dashas = calculateDashas(sidereal['Moon'], birthUTC);
  const yoginiDasha = calculateYoginiDasha(sidereal['Moon'], birthUTC);

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
      navamsa: {
        houses: navamsaHouses,
        planetaryPositions: [navAscEntry, ...navamsaPositions],
      },
      ashtakavarga,
      dignities,
      bhava,
      yoginiDasha,
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

// ─── Transits (Gochar) + Sade Sati ────────────────────────────────────────────

export interface TransitInfo {
  date: string;
  natalMoonSign: string;
  natalLagnaSign: string;
  planets: Array<{ planet: string; sign: string; houseFromMoon: number; houseFromLagna: number; sav: number | null; retrograde: boolean }>;
  sadeSati: { active: boolean; phase: string; saturnSign: string; houseFromMoon: number; note: string; sinceApprox?: string; untilApprox?: string };
  jupiter: { sign: string; houseFromMoon: number; favourable: boolean };
}

const TRANSIT_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const signIdxOf = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;

function siderealLongitudesOn(date: Date): Record<string, number> {
  const jd = julianDay(date);
  const tropical = allPlanetPositions(jd);
  const ayan = lahiriAyanamsa(jd);
  const out: Record<string, number> = {};
  for (const [name, pos] of Object.entries(tropical)) {
    out[name] = (((pos as any).lon - ayan) % 360 + 360) % 360;
  }
  return out;
}

function resolveSignIndex(s: string | number): number {
  if (typeof s === 'number') return ((Math.round(s) % 12) + 12) % 12;
  const i = (SIGNS as readonly string[]).indexOf(s);
  return i >= 0 ? i : 0;
}

/**
 * Current planetary transits relative to a natal chart, with Sade Sati phase.
 * Houses are counted from the natal Moon (Chandra) and natal Lagna; transit
 * results are weighed by the natal Sarvashtakavarga bindus of the transited sign.
 */
export function getTransits(
  natalMoonSign: string | number,
  natalLagnaSign: string | number,
  savBySign?: number[],
  when: Date = new Date(),
): TransitInfo {
  const moonIdx = resolveSignIndex(natalMoonSign);
  const lagnaIdx = resolveSignIndex(natalLagnaSign);
  const lons = siderealLongitudesOn(when);
  const tropical = allPlanetPositions(julianDay(when));

  const planets = TRANSIT_PLANETS.filter((p) => lons[p] != null).map((p) => {
    const s = signIdxOf(lons[p]);
    return {
      planet: p,
      sign: SIGNS[s],
      houseFromMoon: ((s - moonIdx + 12) % 12) + 1,
      houseFromLagna: ((s - lagnaIdx + 12) % 12) + 1,
      sav: savBySign && savBySign.length === 12 ? savBySign[s] : null,
      retrograde: (tropical as any)[p]?.isRetrograde ?? false,
    };
  });

  const satSign = signIdxOf(lons['Saturn'] ?? 0);
  const hMoonSat = ((satSign - moonIdx + 12) % 12) + 1;
  let active = false;
  let phase = 'Not in Sade Sati';
  let note = '';
  if (hMoonSat === 12) { active = true; phase = 'Rising phase — Saturn in the 12th from Moon'; }
  else if (hMoonSat === 1) { active = true; phase = 'Peak phase (Janma Shani) — Saturn over the Moon'; }
  else if (hMoonSat === 2) { active = true; phase = 'Setting phase — Saturn in the 2nd from Moon'; }
  else if (hMoonSat === 4) { phase = 'Kantaka Shani — Saturn in the 4th from Moon'; note = 'Ardha-ashtama (small panoti), a ~2.5-year Saturn test.'; }
  else if (hMoonSat === 8) { phase = 'Ashtama Shani — Saturn in the 8th from Moon'; note = 'Dhaiya (small panoti), a ~2.5-year Saturn test.'; }

  // Approximate the current Saturn-sign window at month resolution.
  const monthFmt = (d: Date) => d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  let sinceApprox: string | undefined;
  let untilApprox: string | undefined;
  let b = new Date(when);
  for (let i = 0; i < 36; i++) {
    const prev = new Date(b); prev.setMonth(prev.getMonth() - 1);
    if (signIdxOf(siderealLongitudesOn(prev)['Saturn'] ?? 0) !== satSign) break;
    b = prev;
  }
  let e = new Date(when);
  for (let i = 0; i < 36; i++) {
    const next = new Date(e); next.setMonth(next.getMonth() + 1); e = next;
    if (signIdxOf(siderealLongitudesOn(next)['Saturn'] ?? 0) !== satSign) break;
  }
  sinceApprox = monthFmt(b);
  untilApprox = monthFmt(e);

  const jupSign = signIdxOf(lons['Jupiter'] ?? 0);
  const hMoonJup = ((jupSign - moonIdx + 12) % 12) + 1;

  return {
    date: when.toISOString().split('T')[0],
    natalMoonSign: SIGNS[moonIdx],
    natalLagnaSign: SIGNS[lagnaIdx],
    planets,
    sadeSati: { active, phase, saturnSign: SIGNS[satSign], houseFromMoon: hMoonSat, note, sinceApprox, untilApprox },
    jupiter: { sign: SIGNS[jupSign], houseFromMoon: hMoonJup, favourable: [2, 5, 7, 9, 11].includes(hMoonJup) },
  };
}

/** Compact text summary of transits for AI prompts. */
export function transitSummary(t: TransitInfo): string {
  const lines = t.planets
    .map((p) => `- ${p.planet}: ${p.sign} (${p.houseFromMoon}th from Moon, ${p.houseFromLagna}th from Lagna${p.sav != null ? `, SAV ${p.sav}` : ''}${p.retrograde ? ', retrograde' : ''})`)
    .join('\n');
  const ss = t.sadeSati.active
    ? `Sade Sati ACTIVE — ${t.sadeSati.phase}. Saturn in ${t.sadeSati.saturnSign} (~${t.sadeSati.sinceApprox} to ~${t.sadeSati.untilApprox}).`
    : `Sade Sati not active. ${t.sadeSati.phase}.${t.sadeSati.note ? ' ' + t.sadeSati.note : ''}`;
  const jup = `Jupiter transiting ${t.jupiter.sign} (${t.jupiter.houseFromMoon}th from Moon) — ${t.jupiter.favourable ? 'favourable' : 'mixed'}.`;
  return `Current transits as of ${t.date} (natal Moon ${t.natalMoonSign}, Lagna ${t.natalLagnaSign}):\n${lines}\n${ss}\n${jup}`;
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
