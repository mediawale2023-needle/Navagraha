/**
 * Independent reference pipeline for the V3 golden-chart suite.
 *
 * Deliberately shares NO code with server/: different ephemeris theory
 * (astronomy-engine — VSOP87 planets, ELP/MPP02-derived Moon, by D. Cross),
 * independently written spherical astronomy for the Ascendant/MC, Meeus' mean
 * lunar node, and Jyotish rules written from their textual definitions.
 *
 * Sidereal frame: Lahiri (Chitrapaksha) sidereal longitudes are fixed to the
 * stars, so λ_sidereal = λ(J2000 mean ecliptic, apparent) − K, where K is the
 * Lahiri ayanamsa at J2000.0 (23°51'25.53", the IAE/Lahiri definition as
 * tabulated for the mean equinox). K is independently cross-checked in the
 * test suite against the Chitrapaksha definition (Spica ≈ 180° sidereal).
 */
import * as AstronomyEngine from 'astronomy-engine';

// CommonJS package: under ESM loaders the API may sit on `default`.
const A: typeof AstronomyEngine = (AstronomyEngine as any).default ?? AstronomyEngine;

export const LAHIRI_J2000_DEG = 23 + 51 / 60 + 25.53 / 3600;
export const REF_BODIES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as const;
const D2R = Math.PI / 180;
const norm = (x: number) => ((x % 360) + 360) % 360;

/** Julian centuries (UT) since J2000.0 — UT vs TT is irrelevant at reference tolerance. */
const centuries = (date: Date) => (date.getTime() / 86_400_000 + 2440587.5 - 2451545.0) / 36525;

/** General precession in longitude since J2000 (IAU 2006, degrees). */
export function precessionInLongitude(T: number): number {
  return (5028.796195 * T + 1.1054348 * T * T + 0.00007964 * T ** 3) / 3600;
}

/** Mean Lahiri ayanamsa of date (degrees). */
export function lahiriMean(date: Date): number {
  return LAHIRI_J2000_DEG + precessionInLongitude(centuries(date));
}

/** Apparent geocentric longitude on the J2000 mean ecliptic. */
function eclipticJ2000(body: typeof REF_BODIES[number], date: Date): number {
  // Ecliptic() would return the true ecliptic OF DATE; rotate to the J2000 mean ecliptic instead.
  const eqj = A.GeoVector(body as A.Body, A.MakeTime(date), true);
  const ecl = A.RotateVector(A.Rotation_EQJ_ECL(), eqj);
  return norm(A.SphereFromVector(ecl).lon);
}

export function referenceSidereal(body: typeof REF_BODIES[number], date: Date): number {
  return norm(eclipticJ2000(body, date) - LAHIRI_J2000_DEG);
}

/** Daily motion from a ±12h central difference, degrees/day. */
export function referenceSpeed(body: typeof REF_BODIES[number], date: Date): number {
  const a = eclipticJ2000(body, new Date(date.getTime() - 43_200_000));
  const b = eclipticJ2000(body, new Date(date.getTime() + 43_200_000));
  let d = b - a;
  if (d > 180) d -= 360; else if (d < -180) d += 360;
  return d;
}

/** Mean lunar node (Meeus, Astronomical Algorithms 2nd ed., eq. 47.7), sidereal. */
export function referenceMeanNode(date: Date): number {
  const T = centuries(date);
  const omegaOfDate = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T ** 3) / 467441 - (T ** 4) / 60616000;
  return norm(omegaOfDate - lahiriMean(date));
}

/** Greenwich mean sidereal time, degrees (IAU 1982, Meeus eq. 12.4). */
export function gmstDeg(date: Date): number {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  return norm(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T ** 3) / 38710000);
}

/** Mean obliquity of the ecliptic (Laskar, Meeus eq. 22.3), degrees. */
export function meanObliquityDeg(date: Date): number {
  const U = centuries(date) / 100;
  const arcsec = 84381.448 - 4680.93 * U - 1.55 * U ** 2 + 1999.25 * U ** 3 - 51.38 * U ** 4 - 249.67 * U ** 5
    - 39.05 * U ** 6 + 7.12 * U ** 7 + 27.87 * U ** 8 + 5.79 * U ** 9 + 2.45 * U ** 10;
  return arcsec / 3600;
}

/** Sidereal Ascendant and MC from first principles (mean equinox, mean obliquity). */
export function referenceAngles(date: Date, latitude: number, longitude: number): { ascendant: number; midheaven: number } {
  const ramc = norm(gmstDeg(date) + longitude) * D2R;
  const eps = meanObliquityDeg(date) * D2R;
  const phi = latitude * D2R;
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / D2R;
  const mc = Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) / D2R;
  const ayan = lahiriMean(date);
  return { ascendant: norm(asc - ayan), midheaven: norm(mc - ayan) };
}

// ─── Jyotish rules, written independently from their textual definitions ─────

const NAK_SPAN = 360 / 27;
export const NAKSHATRA_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
export const VIMSHOTTARI_YEARS: Record<string, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };

export const signOf = (lon: number) => Math.floor(norm(lon) / 30);
export const nakshatraOf = (lon: number) => Math.floor(norm(lon) / NAK_SPAN);
export const padaOf = (lon: number) => Math.floor((norm(lon) % NAK_SPAN) / (NAK_SPAN / 4)) + 1;

/** "Navamsa of movable signs from the sign itself, fixed from the 9th, dual from the 5th." */
export function d9(lon: number): number {
  const s = signOf(lon);
  const part = Math.floor((norm(lon) % 30) / (30 / 9));
  const modality = s % 3; // 0 movable, 1 fixed, 2 dual
  const first = modality === 0 ? s : modality === 1 ? s + 8 : s + 4;
  return (first + part) % 12;
}

/** "Dasamsa: odd signs from the sign itself, even signs from the 9th." */
export function d10(lon: number): number {
  const s = signOf(lon);
  const part = Math.floor((norm(lon) % 30) / 3);
  const first = s % 2 === 0 ? s : s + 8;
  return (first + part) % 12;
}

/** Distance (degrees) to the nearest edge of a division of size `size`. */
export function marginToDivision(lon: number, size: number): number {
  const r = norm(lon) % size;
  return Math.min(r, size - r);
}

/** Vimshottari Mahadasha boundaries (UTC ms) from the Moon's sidereal longitude. */
export function vimshottariBoundaries(moonLon: number, birthMs: number, count = 9) {
  const yearMs = 365.25 * 86_400_000;
  const nak = nakshatraOf(moonLon);
  const lordIdx = nak % 9;
  const fraction = (norm(moonLon) % NAK_SPAN) / NAK_SPAN;
  const birthLord = NAKSHATRA_LORDS[lordIdx];
  let start = birthMs - fraction * VIMSHOTTARI_YEARS[birthLord] * yearMs;
  const out: Array<{ lord: string; startMs: number; endMs: number }> = [];
  for (let i = 0; i < count; i++) {
    const lord = NAKSHATRA_LORDS[(lordIdx + i) % 9];
    const end = start + VIMSHOTTARI_YEARS[lord] * yearMs;
    out.push({ lord, startMs: start, endMs: end });
    start = end;
  }
  return out;
}
