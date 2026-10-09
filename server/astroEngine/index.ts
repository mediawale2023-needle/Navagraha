/**
 * Native Astrology Engine — Public API
 *
 * All calculations are performed locally with zero external dependencies.
 */

import { SIGNS } from './vedic.js';
import { lonOf } from './lon.js';
import { ashtakootMatch }      from './matching.js';
import { resolveBirthWithCoordinates, type TimeAccuracy } from './birthResolver.js';
import { computeCanonicalChart, siderealPositions, CalculationError } from './canonical/compute.js';
import { legacyView, type LegacyKundli } from './canonical/legacy.js';
import { BirthInputError } from './errors.js';
import type { CanonicalChart } from '@shared/v3/canonical';

export { BirthInputError };
import { calculateNumerology } from './numerology.js';
import { getDailyHoroscope as _getDailyHoroscope } from './horoscope.js';

// Re-export horoscope types for convenience
export { getDailyHoroscope } from './horoscope.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Pre-V3 response shape, now a projection of the CanonicalChart (chartData.canonical). */
export type NativeKundliResult = LegacyKundli;

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

// ─── Kundli ───────────────────────────────────────────────────────────────────

export interface KundliOptions {
  timeAccuracy?: TimeAccuracy;
  timezone?: string | null;   // explicit IANA zone; otherwise looked up from the coordinates
  utcOffset?: string | null;  // only to disambiguate a DST fall-back hour
  place?: string | null;
}

/** Local calendar date (YYYY-MM-DD) from a date-only string or a midnight-UTC Date. */
export function birthDateString(dateOfBirth: Date | string): string {
  if (typeof dateOfBirth === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateOfBirth.trim())) return dateOfBirth.trim().slice(0, 10);
  const d = new Date(dateOfBirth);
  if (!Number.isFinite(d.getTime())) throw new BirthInputError('A valid birth date is required');
  return d.toISOString().slice(0, 10);
}

/**
 * Generate a complete Vedic birth chart. The local birth time is interpreted in
 * the birthplace's historical time zone (looked up from the coordinates unless
 * one is given) — never a global IST assumption. Returns the legacy shape with
 * the CanonicalChart embedded at chartData.canonical.
 */
export async function getKundli(
  dateOfBirth: Date | string,
  timeOfBirth: string,
  latitude: number,
  longitude: number,
  opts: KundliOptions = {},
): Promise<NativeKundliResult> {
  const birth = resolveBirthWithCoordinates({
    date: birthDateString(dateOfBirth),
    time: timeOfBirth,
    latitude,
    longitude,
    place: opts.place ?? '',
    timezone: opts.timezone ?? null,
    utcOffset: opts.utcOffset ?? null,
    timeAccuracy: opts.timeAccuracy ?? 'exact',
  });
  return legacyView(computeCanonicalChart(birth));
}

// ─── Transits (Gochar) + Sade Sati ────────────────────────────────────────────

export interface TransitInfo {
  date: string;
  natalMoonSign: string;
  /** Null when the birth time is approximate: houses are then counted from the Moon only. */
  natalLagnaSign: string | null;
  planets: Array<{ planet: string; sign: string; houseFromMoon: number; houseFromLagna: number | null; sav: number | null; retrograde: boolean }>;
  /** `determined` is false when the natal Moon sign itself is uncertain; then `active` is false and nothing is claimed. */
  sadeSati: { active: boolean; determined: boolean; phase: string; saturnSign: string; houseFromMoon: number; note: string; sinceApprox?: string; untilApprox?: string };
  /** False when the natal Moon sign could differ across the birth date (approximate time): houses from the Moon are then unreliable. */
  moonSignCertain: boolean;
  jupiter: { sign: string; houseFromMoon: number; favourable: boolean };
}

const TRANSIT_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const signIdxOf = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;

function siderealLongitudesOn(date: Date): Record<string, number> {
  const { bodies } = siderealPositions(date);
  return Object.fromEntries(Object.entries(bodies).map(([name, b]) => [name, b.longitude]));
}

function resolveSignIndex(s: string | number): number {
  if (typeof s === 'number') return ((Math.round(s) % 12) + 12) % 12;
  const i = (SIGNS as readonly string[]).indexOf(s);
  if (i < 0) throw new CalculationError(`Unknown sign "${s}"`);
  return i;
}

/**
 * Current planetary transits relative to a natal chart, with Sade Sati phase.
 * Houses are counted from the natal Moon (Chandra) and natal Lagna; transit
 * results are weighed by the natal Sarvashtakavarga bindus of the transited sign.
 */
export function getTransits(
  natalMoonSign: string | number,
  natalLagnaSign: string | number | null,
  savBySign?: number[],
  when: Date = new Date(),
  moonSignCertain = true,
): TransitInfo {
  const moonIdx = resolveSignIndex(natalMoonSign);
  const lagnaIdx = natalLagnaSign == null ? null : resolveSignIndex(natalLagnaSign);
  const { bodies } = siderealPositions(when);
  const lons = Object.fromEntries(Object.entries(bodies).map(([name, b]) => [name, b.longitude]));

  const planets = TRANSIT_PLANETS.filter((p) => lons[p] != null).map((p) => {
    const s = signIdxOf(lons[p]);
    return {
      planet: p,
      sign: SIGNS[s],
      houseFromMoon: ((s - moonIdx + 12) % 12) + 1,
      houseFromLagna: lagnaIdx == null ? null : ((s - lagnaIdx + 12) % 12) + 1,
      sav: savBySign && savBySign.length === 12 ? savBySign[s] : null,
      retrograde: (bodies as any)[p].speed < 0,
    };
  });

  const satSign = signIdxOf(lonOf(lons, 'Saturn'));
  const hMoonSat = ((satSign - moonIdx + 12) % 12) + 1;
  let active = false;
  let phase = 'Not in Sade Sati';
  let note = '';
  if (hMoonSat === 12) { active = true; phase = 'Rising phase — Saturn in the 12th from Moon'; }
  else if (hMoonSat === 1) { active = true; phase = 'Peak phase (Janma Shani) — Saturn over the Moon'; }
  else if (hMoonSat === 2) { active = true; phase = 'Setting phase — Saturn in the 2nd from Moon'; }
  else if (hMoonSat === 4) { phase = 'Kantaka Shani — Saturn in the 4th from Moon'; note = 'Ardha-ashtama (small panoti), a ~2.5-year Saturn test.'; }
  else if (hMoonSat === 8) { phase = 'Ashtama Shani — Saturn in the 8th from Moon'; note = 'Dhaiya (small panoti), a ~2.5-year Saturn test.'; }
  if (!moonSignCertain) {
    active = false;
    phase = 'Undetermined — the natal Moon sign could differ across the birth date with an approximate birth time';
    note = '';
  }

  // Approximate the current Saturn-sign window at month resolution.
  const monthFmt = (d: Date) => d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  let sinceApprox: string | undefined;
  let untilApprox: string | undefined;
  let b = new Date(when);
  for (let i = 0; i < 36; i++) {
    const prev = new Date(b); prev.setMonth(prev.getMonth() - 1);
    if (signIdxOf(lonOf(siderealLongitudesOn(prev), 'Saturn')) !== satSign) break;
    b = prev;
  }
  let e = new Date(when);
  for (let i = 0; i < 36; i++) {
    const next = new Date(e); next.setMonth(next.getMonth() + 1); e = next;
    if (signIdxOf(lonOf(siderealLongitudesOn(next), 'Saturn')) !== satSign) break;
  }
  sinceApprox = monthFmt(b);
  untilApprox = monthFmt(e);

  const jupSign = signIdxOf(lonOf(lons, 'Jupiter'));
  const hMoonJup = ((jupSign - moonIdx + 12) % 12) + 1;

  return {
    date: when.toISOString().split('T')[0],
    natalMoonSign: SIGNS[moonIdx],
    natalLagnaSign: lagnaIdx == null ? null : SIGNS[lagnaIdx],
    planets,
    sadeSati: { active, determined: moonSignCertain, phase, saturnSign: SIGNS[satSign], houseFromMoon: hMoonSat, note, sinceApprox, untilApprox },
    moonSignCertain,
    jupiter: { sign: SIGNS[jupSign], houseFromMoon: hMoonJup, favourable: [2, 5, 7, 9, 11].includes(hMoonJup) },
  };
}

/** Transits for a canonical chart; with an approximate birth time the Lagna is not used. */
export function transitsForChart(canonical: CanonicalChart, savBySign?: number[], when?: Date): TransitInfo {
  const moon = canonical.planets.find((p) => p.name === 'Moon')!;
  const lagna = canonical.birth.timeAccuracy === 'approximate' ? null : canonical.ascendant.sign;
  return getTransits(moon.sign, lagna, savBySign, when, canonical.uncertainty.moonSignStableAcrossBirthDate);
}

/** Compact text summary of transits for AI prompts. */
export function transitSummary(t: TransitInfo): string {
  const lines = t.planets
    .map((p) => `- ${p.planet}: ${p.sign} (${t.moonSignCertain ? `${p.houseFromMoon}th from Moon` : 'house from Moon uncertain'}${p.houseFromLagna != null ? `, ${p.houseFromLagna}th from Lagna` : ''}${p.sav != null ? `, SAV ${p.sav}` : ''}${p.retrograde ? ', retrograde' : ''})`)
    .join('\n');
  const ss = !t.sadeSati.determined
    ? 'Sade Sati undetermined: the natal Moon sign is uncertain, so do not say whether Sade Sati is active.'
    : t.sadeSati.active
    ? `Sade Sati ACTIVE — ${t.sadeSati.phase}. Saturn in ${t.sadeSati.saturnSign} (~${t.sadeSati.sinceApprox} to ~${t.sadeSati.untilApprox}).`
    : `Sade Sati not active. ${t.sadeSati.phase}.${t.sadeSati.note ? ' ' + t.sadeSati.note : ''}`;
  const jup = t.moonSignCertain
    ? `Jupiter transiting ${t.jupiter.sign} (${t.jupiter.houseFromMoon}th from Moon) — ${t.jupiter.favourable ? 'favourable' : 'mixed'}.`
    : `Jupiter transiting ${t.jupiter.sign}.`;
  const lagna = t.natalLagnaSign ? `Lagna ${t.natalLagnaSign}` : 'Lagna not used — birth time approximate';
  const moon = t.moonSignCertain ? `natal Moon ${t.natalMoonSign}` : 'natal Moon sign uncertain';
  return `Current transits as of ${t.date} (${moon}, ${lagna}):\n${lines}\n${ss}\n${jup}`;
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
  // Each person's Moon at their own resolved UTC birth instant.
  const moonLon = (p: typeof person1) => {
    const birth = resolveBirthWithCoordinates({
      date: birthDateString(p.dateOfBirth), time: p.timeOfBirth, latitude: p.latitude, longitude: p.longitude, timeAccuracy: 'exact',
    });
    return siderealPositions(new Date(birth.birthUTC)).bodies.Moon.longitude;
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
