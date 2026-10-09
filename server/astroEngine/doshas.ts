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

// Sign exceptions per house (B.V. Raman's widely used list); 0 = Aries.
const MANGAL_SIGN_EXCEPTIONS: Record<number, number[]> = {
  1: [0],      // Aries
  2: [2, 5],   // Gemini, Virgo
  4: [0, 7],   // Aries, Scorpio
  7: [3, 9],   // Cancer, Capricorn
  8: [8, 11],  // Sagittarius, Pisces
  12: [1, 6],  // Taurus, Libra
};
const SIGN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

/**
 * Classical cancellation (bhanga) conditions for a flagged Mangal Dosha.
 * Schools differ on the exact list; this evaluates the conditions most
 * sources share and returns each one that applies, in plain words.
 */
export function mangalCancellations(marsHouse: number, marsSignIndex: number, jupiterSignIndex: number): string[] {
  if (!hasMangalDosha(marsHouse)) return [];
  const out: string[] = [];
  if (marsSignIndex === 0 || marsSignIndex === 7) out.push(`Mars is in its own sign (${SIGN[marsSignIndex]})`);
  if (marsSignIndex === 9) out.push('Mars is exalted (Capricorn)');
  if (MANGAL_SIGN_EXCEPTIONS[marsHouse]?.includes(marsSignIndex) && marsSignIndex !== 0 && marsSignIndex !== 7 && marsSignIndex !== 9) {
    out.push(`Mars in ${SIGN[marsSignIndex]} in house ${marsHouse} is a listed exception`);
  }
  const jupToMars = ((marsSignIndex - jupiterSignIndex + 12) % 12) + 1;
  if (jupToMars === 1) out.push('Jupiter is conjunct Mars');
  else if ([5, 7, 9].includes(jupToMars)) out.push(`Jupiter aspects Mars (${jupToMars}th-sign aspect)`);
  return out;
}

/** The canonical Mangal Dosha record: the house rule, then the cancellations. */
export function mangalDosha(marsHouse: number, marsSignIndex: number, jupiterSignIndex: number) {
  const flagged = hasMangalDosha(marsHouse);
  const cancelledBy = mangalCancellations(marsHouse, marsSignIndex, jupiterSignIndex);
  const rule = !flagged
    ? `Mars in house ${marsHouse} from the Lagna; the rule flags houses 1, 2, 4, 7, 8 and 12.`
    : cancelledBy.length
      ? `Mars in house ${marsHouse} from the Lagna meets the house rule, but the dosha is cancelled: ${cancelledBy.join('; ')}.`
      : `Mars in house ${marsHouse} from the Lagna; the rule flags houses 1, 2, 4, 7, 8 and 12, and none of the evaluated cancellations (own sign or exaltation, the listed sign exceptions, Jupiter's conjunction or aspect) applies.`;
  return { id: 'mangal' as const, name: 'Mangal (Kuja) Dosha', present: flagged && cancelledBy.length === 0, rule, cancelledBy };
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

// ─── Visha Yoga ───────────────────────────────────────────────────────────────

/**
 * Visha Yoga ("poison combination") — Moon and Saturn conjunct in the same
 * sign, or in mutual opposition (7th from each other). Classically linked to
 * mental distress / self-doubt unless the chart shows compensating strength
 * (a strong Moon, benefic association, or a well-placed dasha lord) — always
 * pair this with the chart's actual Moon dignity before describing severity.
 */
export function hasVishaYoga(moonLon: number, saturnLon: number): boolean {
  const moonSign = Math.floor((((moonLon % 360) + 360) % 360) / 30);
  const saturnSign = Math.floor((((saturnLon % 360) + 360) % 360) / 30);
  return moonSign === saturnSign || ((moonSign - saturnSign + 12) % 12) === 6;
}

// ─── Note on Kuja Dosha ───────────────────────────────────────────────────────
// "Kuja Dosha" and "Mangal Dosha" are the same affliction (Kuja = Sanskrit
// name for Mars); see hasMangalDosha() above. Some schools additionally check
// Mars's affliction from the Venus/7th-lord position (for marriage charts
// specifically) rather than only from Lagna/Moon — note this nuance in the
// AI reading rather than duplicating the detector.
