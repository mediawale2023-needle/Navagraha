/**
 * Planetary position calculations.
 *
 * - Sun & Moon: Meeus "Astronomical Algorithms" Ch. 25 & 47
 * - Outer planets: Simplified Keplerian elements (Meeus Ch. 33)
 * - Rahu/Ketu: Mean lunar nodes
 * - Ascendant: Meeus Ch. 14
 *
 * Accuracy: Sun ~0.01°, Moon ~0.1°, Other planets ~1-2°
 * (More than sufficient for astrology — zodiac signs are 30° wide)
 */

import {
  normalize360,
  toRadians,
  toDegrees,
  julianCenturies,
  meanObliquity,
  gmst,
} from './core.js';

// ─── Sun ──────────────────────────────────────────────────────────────────────

/**
 * Sun's tropical geocentric longitude and radius vector.
 * (Meeus Ch. 25 — accurate to ~0.01°)
 */
export function sunPosition(jd: number): { lon: number; r: number } {
  const T = julianCenturies(jd);

  // Geometric mean longitude (degrees)
  const L0 = normalize360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);

  // Mean anomaly (degrees)
  const M = normalize360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = toRadians(M);

  // Equation of center
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);

  // True longitude and anomaly
  const sunLon = normalize360(L0 + C);
  const v = normalize360(M + C);

  // Radius vector (AU)
  const e = 0.016708634 - 0.000042037 * T;
  const r =
    (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(toRadians(v)));

  return { lon: sunLon, r };
}

// ─── Moon ─────────────────────────────────────────────────────────────────────

/**
 * Moon's tropical geocentric longitude.
 * (Meeus Ch. 47 — major periodic terms, accurate to ~0.1°)
 */
export function moonLongitude(jd: number): number {
  const T = julianCenturies(jd);

  // Fundamental arguments (degrees)
  const L = normalize360(
    218.3164477 +
    481267.88123421 * T -
    0.0015786 * T * T +
    (T * T * T) / 538841 -
    (T * T * T * T) / 65194000
  );
  const D = normalize360(
    297.8501921 +
    445267.1114034 * T -
    0.0018819 * T * T +
    (T * T * T) / 545868 -
    (T * T * T * T) / 113065000
  );
  const M = normalize360(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T * T * T) / 24490000
  );
  const Mp = normalize360(
    134.9633964 +
    477198.8675055 * T +
    0.0087414 * T * T +
    (T * T * T) / 69699 -
    (T * T * T * T) / 14712000
  );
  const F = normalize360(
    93.292095 +
    483202.0175233 * T -
    0.0036539 * T * T -
    (T * T * T) / 3526000 +
    (T * T * T * T) / 863310000
  );

  const A1 = normalize360(119.75 + 131.849 * T);
  const A2 = normalize360(53.09 + 479264.29 * T);

  // Solar anomaly E-factor
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const E2 = E * E;

  const Dr = toRadians(D),
    Mr_ = toRadians(M),
    Mpr = toRadians(Mp),
    Fr = toRadians(F);

  // Periodic terms (Meeus Table 47.a — major terms)
  let sumL = 0;
  sumL += 6288774 * Math.sin(Mpr);
  sumL += 1274027 * Math.sin(2 * Dr - Mpr);
  sumL += 658314 * Math.sin(2 * Dr);
  sumL += 213618 * Math.sin(2 * Mpr);
  sumL -= 185116 * E * Math.sin(Mr_);
  sumL -= 114332 * Math.sin(2 * Fr);
  sumL += 58793 * Math.sin(2 * Dr - 2 * Mpr);
  sumL += 57066 * E * Math.sin(2 * Dr - Mr_ - Mpr);
  sumL += 53322 * Math.sin(2 * Dr + Mpr);
  sumL += 45758 * E * Math.sin(2 * Dr - Mr_);
  sumL -= 40923 * E * Math.sin(Mr_ - Mpr);
  sumL -= 34720 * Math.sin(Dr);
  sumL -= 30383 * E * Math.sin(Mr_ + Mpr);
  sumL += 15327 * Math.sin(2 * Dr - 2 * Fr);
  sumL -= 12528 * Math.sin(Mpr + 2 * Fr);
  sumL += 10980 * Math.sin(Mpr - 2 * Fr);
  sumL += 10675 * Math.sin(4 * Dr - Mpr);
  sumL += 10034 * Math.sin(3 * Mpr);
  sumL += 8548 * Math.sin(4 * Dr - 2 * Mpr);
  sumL -= 7888 * E * Math.sin(2 * Dr + Mr_ - Mpr);
  sumL -= 6766 * E * Math.sin(2 * Dr + Mr_);
  sumL -= 5163 * Math.sin(Dr - Mpr);
  sumL += 4987 * E * Math.sin(Dr + Mr_);
  sumL += 4036 * E * Math.sin(2 * Dr - Mr_ + Mpr);
  sumL += 3994 * Math.sin(2 * Dr + 2 * Mpr);
  sumL += 3861 * Math.sin(4 * Dr);
  sumL += 3665 * Math.sin(2 * Dr - 3 * Mpr);
  sumL -= 2689 * E * Math.sin(Mr_ - 2 * Mpr);
  sumL -= 2602 * Math.sin(2 * Dr - Mpr + 2 * Fr);
  sumL += 2390 * E * Math.sin(2 * Dr - Mr_ - 2 * Mpr);
  sumL -= 2348 * Math.sin(Dr + Mpr);
  sumL += 2236 * E2 * Math.sin(2 * Dr - 2 * Mr_);
  sumL -= 2120 * E * Math.sin(Mr_ + 2 * Mpr);
  sumL -= 2069 * E2 * Math.sin(2 * Mr_);
  sumL += 2048 * E2 * Math.sin(2 * Dr - 2 * Mr_ - Mpr);
  sumL -= 1773 * Math.sin(2 * Dr + Mpr - 2 * Fr);
  sumL -= 1595 * Math.sin(2 * Dr + 2 * Fr);
  sumL += 1215 * E * Math.sin(4 * Dr - Mr_ - Mpr);
  sumL -= 1110 * Math.sin(2 * Mpr + 2 * Fr);
  sumL -= 892 * Math.sin(3 * Dr - Mpr);
  sumL -= 810 * E * Math.sin(2 * Dr + Mr_ + Mpr);
  sumL += 759 * E * Math.sin(4 * Dr - Mr_ - 2 * Mpr);
  sumL -= 713 * E2 * Math.sin(2 * Mr_ - Mpr);
  sumL -= 700 * E2 * Math.sin(2 * Dr + 2 * Mr_ - Mpr);
  sumL += 596 * E * Math.sin(2 * Dr - Mr_ + 2 * Fr);
  sumL += 549 * Math.sin(4 * Dr + Mpr);
  sumL += 537 * Math.sin(4 * Mpr);
  sumL += 520 * E * Math.sin(4 * Dr - Mr_);
  sumL -= 487 * Math.sin(Dr - 2 * Mpr);
  sumL -= 399 * E * Math.sin(2 * Dr + Mr_ - 2 * Fr);
  sumL -= 381 * Math.sin(2 * Mpr - 2 * Fr);
  sumL += 351 * E * Math.sin(Dr + Mr_ + Mpr);
  sumL -= 340 * Math.sin(3 * Dr - 2 * Mpr);
  sumL += 330 * Math.sin(4 * Dr - 3 * Mpr);
  sumL += 327 * E * Math.sin(2 * Dr - Mr_ + 2 * Mpr);
  sumL -= 323 * E2 * Math.sin(2 * Mr_ + Mpr);
  sumL += 299 * E * Math.sin(Dr + Mr_ - Mpr);
  sumL += 294 * Math.sin(2 * Dr + 3 * Mpr);

  // Additive terms
  sumL += 3958 * Math.sin(toRadians(A1));
  sumL += 1962 * (Math.sin(toRadians(L)) * Math.cos(Fr) - Math.cos(toRadians(L)) * Math.sin(Fr));
  sumL += 318 * Math.sin(toRadians(A2));

  return normalize360(L + sumL / 1000000);
}

// ─── Outer Planets (Keplerian) ────────────────────────────────────────────────

interface OrbitalElements {
  a: number; // semi-major axis (AU)
  e: number; // eccentricity
  L0: number; // mean longitude at J2000.0 (degrees)
  Ldot: number; // mean motion (degrees per Julian century)
  w: number; // longitude of perihelion (degrees)
}

// Keplerian elements at J2000.0 (Meeus Table 33.b / JPL)
const ELEMENTS: Record<string, OrbitalElements> = {
  Mercury: { a: 0.38709831, e: 0.20563175, L0: 252.25084, Ldot: 149472.67411, w: 77.45645 },
  Venus: { a: 0.72332982, e: 0.00677188, L0: 181.97973, Ldot: 58517.81539, w: 131.5637 },
  Mars: { a: 1.52368946, e: 0.09340062, L0: 355.433, Ldot: 19140.29934, w: 336.04084 },
  Jupiter: { a: 5.20248019, e: 0.04853590, L0: 34.33479, Ldot: 3034.90567, w: 14.27495 },
  Saturn: { a: 9.54149883, e: 0.05550825, L0: 50.07571, Ldot: 1222.1137, w: 93.05678 },
};

/** Heliocentric ecliptic longitude and distance for a planet */
function heliocentricPos(elem: OrbitalElements, T: number): { lon: number; r: number } {
  const L = normalize360(elem.L0 + elem.Ldot * T);
  const M = normalize360(L - elem.w);
  const Mr = toRadians(M);
  const e = elem.e;

  // Equation of center (3-term expansion)
  const C = toDegrees(
    (2 * e - (e * e * e) / 4) * Math.sin(Mr) +
    (5 / 4) * e * e * Math.sin(2 * Mr) +
    (13 / 12) * e * e * e * Math.sin(3 * Mr)
  );

  const v = normalize360(M + C); // true anomaly
  const l = normalize360(elem.w + v); // heliocentric true longitude

  // Heliocentric distance
  const r = (elem.a * (1 - e * e)) / (1 + e * Math.cos(toRadians(v)));

  return { lon: l, r };
}

/** Convert heliocentric to geocentric longitude */
function toGeocentric(l: number, r: number, sunGeoLon: number, sunR: number): number {
  // Earth's heliocentric longitude = Sun's geocentric longitude + 180°
  const L = normalize360(sunGeoLon + 180);
  const lr = toRadians(l);
  const Lr = toRadians(L);

  return normalize360(
    toDegrees(
      Math.atan2(r * Math.sin(lr) - sunR * Math.sin(Lr), r * Math.cos(lr) - sunR * Math.cos(Lr))
    )
  );
}

export interface PlanetPosition {
  lon: number; // tropical geocentric longitude (degrees)
  isRetrograde: boolean;
}

/**
 * Compute all planetary tropical geocentric longitudes.
 * Returns a map of planet name → { lon, isRetrograde }.
 */
export function allPlanetPositions(jd: number): Record<string, PlanetPosition> {
  const T = julianCenturies(jd);
  const sun = sunPosition(jd);

  const result: Record<string, PlanetPosition> = {};

  // Sun
  result['Sun'] = { lon: sun.lon, isRetrograde: false };

  // Moon
  result['Moon'] = { lon: moonLongitude(jd), isRetrograde: false };

  // Rahu (Mean Ascending Node of Moon) — always retrograde
  const rahuLon = normalize360(125.04455501 - 1934.13626197 * T);
  result['Rahu'] = { lon: rahuLon, isRetrograde: true };

  // Ketu = Rahu + 180°, also retrograde
  result['Ketu'] = { lon: normalize360(rahuLon + 180), isRetrograde: true };

  // Planets from Mercury to Saturn
  for (const [name, elem] of Object.entries(ELEMENTS)) {
    const helio = heliocentricPos(elem, T);
    const geoLon = toGeocentric(helio.lon, helio.r, sun.lon, sun.r);

    // Retrograde check: compare with position 1 day later
    const T1 = julianCenturies(jd + 1);
    const sun1 = sunPosition(jd + 1);
    const helio1 = heliocentricPos(elem, T1);
    const geoLon1 = toGeocentric(helio1.lon, helio1.r, sun1.lon, sun1.r);

    let diff = geoLon1 - geoLon;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    result[name] = { lon: geoLon, isRetrograde: diff < 0 };
  }

  return result;
}

// ─── Ascendant ────────────────────────────────────────────────────────────────

/**
 * Calculate Lagna (Ascendant) tropical ecliptic longitude.
 * (Meeus Ch. 14)
 *
 * @param jd  Julian Day (UT)
 * @param lat Geographic latitude in degrees (+N)
 * @param lon Geographic longitude in degrees (+E)
 */
export function ascendant(jd: number, lat: number, lon: number): number {
  const T = julianCenturies(jd);
  const eps = meanObliquity(T);

  // Local Sidereal Time as angle (= RAMC)
  const gmstDeg = gmst(jd);
  const armc = normalize360(gmstDeg + lon);

  const theta = toRadians(armc);
  const epsilon = toRadians(eps);
  const phi = toRadians(lat);

  // Ecliptic longitude of Ascendant
  // NOTE: The raw atan2(-cos, sin·tan + cos·sin) yields the *descendant*.
  // Adding 180° gives the true ascendant (lagna).
  const y = -Math.cos(theta);
  const x = Math.sin(epsilon) * Math.tan(phi) + Math.cos(epsilon) * Math.sin(theta);

  return normalize360(toDegrees(Math.atan2(y, x)) + 180);
}
