/**
 * Dosha Detection
 *
 * Implements the three most common doshas in Vedic astrology:
 *  1. Mangal Dosha  (Mars dosha / Kuja dosha)
 *  2. Kaal Sarp Dosha
 *  3. Pitra Dosha   (Ancestral dosha)
 */

// ─── Mangal Dosha ─────────────────────────────────────────────────────────────

/**
 * Mangal Dosha (Kuja Dosha) — Mars is in houses 1, 2, 4, 7, 8, or 12.
 *
 * Different schools use different house sets. This uses the most widely
 * accepted 6-house version which includes house 2 (finances/family).
 */
export function hasMangalDosha(marsHouse: number): boolean {
  return [1, 2, 4, 7, 8, 12].includes(marsHouse);
}

// ─── Kaal Sarp Dosha ─────────────────────────────────────────────────────────

/**
 * Kaal Sarp Dosha — all seven main planets (Sun, Moon, Mercury, Venus,
 * Mars, Jupiter, Saturn) are hemmed between Rahu and Ketu on one side
 * of the Rahu–Ketu axis.
 *
 * @param siderealLons  Map of planet name → sidereal longitude (degrees)
 */
export function hasKaalSarpDosha(siderealLons: Record<string, number>): boolean {
  const rahu = siderealLons['Rahu'];
  if (rahu == null) return false;

  const planets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

  // Angle of each planet measured from Rahu going counter-clockwise (0–360°)
  const angles: number[] = [];
  for (const p of planets) {
    const lon = siderealLons[p];
    if (lon == null) return false;
    angles.push(((lon - rahu + 360) % 360));
  }

  // All in [0°, 180°) — between Rahu and Ketu going forward
  const allInFirst  = angles.every(a => a > 0 && a < 180);
  // All in (180°, 360°) — between Ketu and Rahu going forward
  const allInSecond = angles.every(a => a > 180 && a < 360);

  return allInFirst || allInSecond;
}

// ─── Pitra Dosha ─────────────────────────────────────────────────────────────

/**
 * Pitra Dosha (Ancestral Dosha) — simplified version.
 *
 * Present when the Sun is within 15° of Rahu or Ketu (conjunction).
 * This represents the most common astrological trigger for this dosha.
 *
 * @param sunLon   Sidereal longitude of Sun (degrees)
 * @param rahuLon  Sidereal longitude of Rahu (degrees)
 */
export function hasPitraDosha(sunLon: number, rahuLon: number): boolean {
  const ketuLon = (rahuLon + 180) % 360;

  // Angular distance from Sun to Rahu (shortest arc)
  const diffRahu = angularDist(sunLon, rahuLon);
  const diffKetu = angularDist(sunLon, ketuLon);

  return diffRahu < 15 || diffKetu < 15;
}

/** Smallest angle between two ecliptic longitudes (0–180°) */
function angularDist(a: number, b: number): number {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}
