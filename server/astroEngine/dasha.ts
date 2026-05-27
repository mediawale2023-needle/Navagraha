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
const TOTAL_YEARS = 120;

export interface AntardashaEntry {
  planet:    string;
  period:    string;   // "YYYY-MM – YYYY-MM"
  status:    'past' | 'current' | 'upcoming';
  startDate: string;   // ISO date "YYYY-MM-DD"
  endDate:   string;   // ISO date "YYYY-MM-DD"
  pratyantardashas?: AntardashaEntry[]; // only populated for the running antardasha
}

export interface YoginiEntry {
  yogini:    string;
  lord:      string;
  period:    string;
  status:    'past' | 'current' | 'upcoming';
  startDate: string;
  endDate:   string;
}

export interface DashaEntry {
  planet:       string;
  period:       string;  // "YYYY-MM – YYYY-MM"
  status:       'past' | 'current' | 'upcoming';
  startDate:    string;  // ISO date "YYYY-MM-DD"
  endDate:      string;  // ISO date "YYYY-MM-DD"
  antardashas:  AntardashaEntry[];
}

/**
 * Calculate the Vimshottari Dasha timeline from birth, including Antardashas.
 *
 * @param moonSiderealLon  Moon's sidereal longitude (degrees)
 * @param birthDate        Date of birth
 * @returns                Array of dasha entries (birth dasha + 8 following), each with 9 antardashas
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
  dashas.push(makeDasha(nak.lord, current, firstEnd, now, posInNak));
  current = firstEnd;

  // Eight complete dashas following the first
  for (let i = 1; i < 9; i++) {
    const planet = DASHA_ORDER[(startIdx + i) % 9];
    const years  = DASHA_YEARS[planet];
    const end    = new Date(current.getTime() + years * MS_PER_YEAR);
    dashas.push(makeDasha(planet, current, end, now, 0));
    current = end;
  }

  return dashas;
}

/**
 * Calculate 9 Antardashas within a Mahadasha.
 * Antardasha duration = (mahadasha_years × antardasha_lord_years) / 120
 * For a partial mahadasha (first dasha), scale proportionally.
 */
function calculateAntardashas(
  mahaLord: string,
  mahaStart: Date,
  mahaEnd: Date,
  now: number,
  startFraction: number,  // how far into the first antardasha we are (0 for full dashas)
): AntardashaEntry[] {
  const mahaYears = DASHA_YEARS[mahaLord];
  const mahaStartIdx = DASHA_ORDER.indexOf(mahaLord);
  const totalMahaMs = mahaEnd.getTime() - mahaStart.getTime();

  const antardashas: AntardashaEntry[] = [];
  let cursor = new Date(mahaStart.getTime());

  for (let i = 0; i < 9; i++) {
    const antarLord = DASHA_ORDER[(mahaStartIdx + i) % 9];
    const antarYears = (mahaYears * DASHA_YEARS[antarLord]) / TOTAL_YEARS;

    let antarMs: number;
    if (i === 0 && startFraction > 0) {
      // First antardasha is partial — scale by (1 - fraction already elapsed)
      antarMs = antarYears * MS_PER_YEAR * (1 - startFraction);
    } else if (i === 8) {
      // Last antardasha: use remaining time to avoid floating-point drift
      antarMs = mahaEnd.getTime() - cursor.getTime();
    } else {
      antarMs = antarYears * MS_PER_YEAR;
    }

    const antarEnd = new Date(cursor.getTime() + antarMs);
    antardashas.push(makeAntardasha(antarLord, cursor, antarEnd, now, true));
    cursor = antarEnd;
  }

  return antardashas;
}

/** 9 Pratyantardashas within an Antardasha (proportional sub-division). */
function calculatePratyantardashas(antarLord: string, start: Date, end: Date, now: number): AntardashaEntry[] {
  const startIdx = DASHA_ORDER.indexOf(antarLord);
  const totalMs = end.getTime() - start.getTime();
  const out: AntardashaEntry[] = [];
  let cursor = new Date(start.getTime());
  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(startIdx + i) % 9];
    const ms = i === 8 ? end.getTime() - cursor.getTime() : totalMs * (DASHA_YEARS[lord] / TOTAL_YEARS);
    const pEnd = new Date(cursor.getTime() + ms);
    out.push(makeAntardasha(lord, cursor, pEnd, now, false));
    cursor = pEnd;
  }
  return out;
}

function makeDasha(
  planet: string,
  start: Date,
  end: Date,
  now: number,
  startFraction: number,
): DashaEntry {
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  const status: DashaEntry['status'] =
    now >= start.getTime() && now <= end.getTime() ? 'current'
    : now > end.getTime() ? 'past' : 'upcoming';

  return {
    planet,
    period:      `${s.slice(0, 7)} – ${e.slice(0, 7)}`,
    status,
    startDate:   s,
    endDate:     e,
    antardashas: calculateAntardashas(planet, start, end, now, startFraction),
  };
}

function makeAntardasha(planet: string, start: Date, end: Date, now: number, withPratyantar = false): AntardashaEntry {
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  const status: AntardashaEntry['status'] =
    now >= start.getTime() && now <= end.getTime() ? 'current'
    : now > end.getTime() ? 'past' : 'upcoming';

  const entry: AntardashaEntry = {
    planet,
    period:    `${s.slice(0, 7)} – ${e.slice(0, 7)}`,
    status,
    startDate: s,
    endDate:   e,
  };
  if (withPratyantar && status === 'current') {
    entry.pratyantardashas = calculatePratyantardashas(planet, start, end, now);
  }
  return entry;
}

// ─── Yogini Dasha (36-year cross-confirming cycle) ────────────────────────────

const YOGINIS = [
  { name: 'Mangala', lord: 'Moon', years: 1 },
  { name: 'Pingala', lord: 'Sun', years: 2 },
  { name: 'Dhanya', lord: 'Jupiter', years: 3 },
  { name: 'Bhramari', lord: 'Mars', years: 4 },
  { name: 'Bhadrika', lord: 'Mercury', years: 5 },
  { name: 'Ulka', lord: 'Saturn', years: 6 },
  { name: 'Siddha', lord: 'Venus', years: 7 },
  { name: 'Sankata', lord: 'Rahu', years: 8 },
];

export function calculateYoginiDasha(moonSiderealLon: number, birthDate: Date): YoginiEntry[] {
  const lon = ((moonSiderealLon % 360) + 360) % 360;
  const nakIdx = nakshatraIndex(lon); // 0-based
  const posInNak = (lon % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;

  // Starting yogini: (Janma nakshatra number + 3) mod 8.
  const r = ((nakIdx + 1) + 3) % 8;
  const startIdx = r === 0 ? 7 : r - 1;

  const out: YoginiEntry[] = [];
  let cursor = new Date(birthDate.getTime());
  const now = Date.now();

  const first = YOGINIS[startIdx];
  const firstEnd = new Date(cursor.getTime() + first.years * (1 - posInNak) * MS_PER_YEAR);
  out.push(makeYogini(first, cursor, firstEnd, now));
  cursor = firstEnd;

  // ~14 periods forward covers well over a century — enough to reach today + future.
  for (let i = 1; i < 14; i++) {
    const y = YOGINIS[(startIdx + i) % 8];
    const end = new Date(cursor.getTime() + y.years * MS_PER_YEAR);
    out.push(makeYogini(y, cursor, end, now));
    cursor = end;
  }
  return out;
}

function makeYogini(y: { name: string; lord: string }, start: Date, end: Date, now: number): YoginiEntry {
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  const status: YoginiEntry['status'] =
    now >= start.getTime() && now <= end.getTime() ? 'current'
    : now > end.getTime() ? 'past' : 'upcoming';
  return { yogini: y.name, lord: y.lord, period: `${s.slice(0, 7)} – ${e.slice(0, 7)}`, status, startDate: s, endDate: e };
}
