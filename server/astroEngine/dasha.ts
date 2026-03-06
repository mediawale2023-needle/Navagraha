/**
 * Vimshottari Dasha Calculator
 *
 * The Vimshottari system is the most widely used dasha system in Vedic astrology.
 * The 120-year cycle is determined by the Moon's nakshatra at birth.
 *
 * Order:  Ketu(7) → Venus(20) → Sun(6) → Moon(10) → Mars(7)
 *       → Rahu(18) → Jupiter(16) → Saturn(19) → Mercury(17)  [total = 120 years]
 */

import { NAKSHATRAS, nakshatraIndex, NAKSHATRA_SPAN } from './vedic.js';

// Dasha duration in years for each planet
const DASHA_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};

// Ordered dasha sequence (108 letters = 120 years)
const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

export interface DashaEntry {
  planet:    string;
  period:    string;  // "YYYY-MM – YYYY-MM"
  status:    'past' | 'current' | 'upcoming';
  startDate: string;  // ISO date "YYYY-MM-DD"
  endDate:   string;  // ISO date "YYYY-MM-DD"
}

/**
 * Calculate the Vimshottari Dasha timeline from birth.
 *
 * @param moonSiderealLon  Moon's sidereal longitude (degrees)
 * @param birthDate        Date of birth
 * @returns                Array of dasha entries (birth dasha + 8 following)
 */
export function calculateDashas(moonSiderealLon: number, birthDate: Date): DashaEntry[] {
  const lon = ((moonSiderealLon % 360) + 360) % 360;

  // Which nakshatra is Moon in?
  const nakIdx = nakshatraIndex(lon);
  const nak = NAKSHATRAS[nakIdx];

  // Fraction of the nakshatra already traversed at birth
  const posInNak = (lon % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;

  // Remaining years of the current mahadasha at birth
  const dashaYears = DASHA_YEARS[nak.lord];
  const remainingYears = dashaYears * (1 - posInNak);

  // Index of the dasha lord in the ordered sequence
  const startIdx = DASHA_ORDER.indexOf(nak.lord);

  const dashas: DashaEntry[] = [];
  let current = new Date(birthDate.getTime());
  const now = Date.now();

  // First (possibly partial) dasha
  const firstEnd = new Date(current.getTime() + remainingYears * MS_PER_YEAR);
  dashas.push(makeDasha(nak.lord, current, firstEnd, now));
  current = firstEnd;

  // Eight complete dashas following the first
  for (let i = 1; i < 9; i++) {
    const planet = DASHA_ORDER[(startIdx + i) % 9];
    const years  = DASHA_YEARS[planet];
    const end    = new Date(current.getTime() + years * MS_PER_YEAR);
    dashas.push(makeDasha(planet, current, end, now));
    current = end;
  }

  return dashas;
}

function makeDasha(planet: string, start: Date, end: Date, now: number): DashaEntry {
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  const status: DashaEntry['status'] =
    now >= start.getTime() && now <= end.getTime() ? 'current'
    : now > end.getTime() ? 'past' : 'upcoming';

  return {
    planet,
    period:    `${s.slice(0, 7)} – ${e.slice(0, 7)}`,
    status,
    startDate: s,
    endDate:   e,
  };
}
