/**
 * Core mathematical utilities for astronomical calculations.
 * Based on Jean Meeus "Astronomical Algorithms" (2nd Edition).
 */

/** Normalize an angle to [0, 360) degrees */
export function normalize360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Convert degrees to radians */
export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Convert radians to degrees */
export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Calculate Julian Day Number for a given UTC Date.
 * (Meeus Ch. 7)
 */
export function julianDay(date: Date): number {
  const Y = date.getUTCFullYear();
  const M = date.getUTCMonth() + 1;
  const D =
    date.getUTCDate() +
    date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400;

  let y = Y,
    m = M;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);

  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    D +
    B -
    1524.5
  );
}

/**
 * Julian centuries since J2000.0 (2451545.0 JD)
 */
export function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

/**
 * Lahiri Ayanamsa in degrees for a given Julian Day.
 * Lahiri is the official ayanamsa used in Indian Vedic astrology.
 * At J2000 (2000 Jan 1.5): ~23.8516°, precessing at ~50.27"/year.
 */
export function lahiriAyanamsa(jd: number): number {
  const T = julianCenturies(jd);
  // Lahiri value at J2000.0 = 23.85139°
  // Rate = 50.27" per year = 1.39639° per Julian century
  return 23.85139 + 1.39639 * T;
}

/**
 * Convert tropical ecliptic longitude to sidereal (Vedic) using Lahiri ayanamsa.
 */
export function toSidereal(tropicalLon: number, jd: number): number {
  return normalize360(tropicalLon - lahiriAyanamsa(jd));
}

/**
 * Mean obliquity of the ecliptic (degrees).
 * (Meeus Ch. 22, accurate to 0.01" for ±2000 years from J2000)
 */
export function meanObliquity(T: number): number {
  return (
    23.439291111 -
    0.013004167 * T -
    0.000001639 * T * T +
    0.000000504 * T * T * T
  );
}

/**
 * Greenwich Mean Sidereal Time in degrees.
 * (Meeus Ch. 12)
 */
export function gmst(jd: number): number {
  const T = julianCenturies(jd);
  const theta =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;
  return normalize360(theta);
}
