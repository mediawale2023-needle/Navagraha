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

export interface DashaPeriod {
  lord:  string;
  start: string; // ISO instant
  end:   string; // ISO instant
}
export interface VimshottariMahadasha extends DashaPeriod { antardashas: DashaPeriod[] }
export interface VimshottariResult {
  yearLengthDays: number;
  moonNakshatraIndex: number;
  birthLord: string;
  /** Fraction of the birth nakshatra (and so of the birth Mahadasha) already elapsed at birth. */
  elapsedFractionAtBirth: number;
  balanceAtBirthYears: number;
  mahadashas: VimshottariMahadasha[];
}

/** Sub-periods of a period, proportional to Vimshottari years, starting from its own lord. */
export function vimshottariSubPeriods(lord: string, startMs: number, endMs: number): DashaPeriod[] {
  const startIdx = DASHA_ORDER.indexOf(lord);
  const total = endMs - startMs;
  const out: DashaPeriod[] = [];
  let cursor = startMs;
  for (let i = 0; i < 9; i++) {
    const sub = DASHA_ORDER[(startIdx + i) % 9];
    const next = i === 8 ? endMs : cursor + total * (DASHA_YEARS[sub] / TOTAL_YEARS);
    out.push({ lord: sub, start: new Date(cursor).toISOString(), end: new Date(next).toISOString() });
    cursor = next;
  }
  return out;
}

/**
 * Vimshottari Mahadashas from the Moon's sidereal longitude. The birth
 * Mahadasha is placed at its true (virtual) start before birth, so its
 * Antardashas fall on their correct dates; callers clip at birth for display.
 */
export function vimshottariDasha(moonSiderealLon: number, birthUTC: Date, count = 9): VimshottariResult {
  const lon = ((moonSiderealLon % 360) + 360) % 360;
  const nakIdx = nakshatraIndex(lon);
  const lord = NAKSHATRAS[nakIdx].lord;
  const elapsed = (lon % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const birthMs = birthUTC.getTime();
  let cursor = birthMs - elapsed * DASHA_YEARS[lord] * MS_PER_YEAR;
  const startIdx = DASHA_ORDER.indexOf(lord);
  const mahadashas: VimshottariMahadasha[] = [];
  for (let i = 0; i < count; i++) {
    const p = DASHA_ORDER[(startIdx + i) % 9];
    const end = cursor + DASHA_YEARS[p] * MS_PER_YEAR;
    mahadashas.push({ lord: p, start: new Date(cursor).toISOString(), end: new Date(end).toISOString(), antardashas: vimshottariSubPeriods(p, cursor, end) });
    cursor = end;
  }
  return {
    yearLengthDays: MS_PER_YEAR / 86_400_000,
    moonNakshatraIndex: nakIdx,
    birthLord: lord,
    elapsedFractionAtBirth: elapsed,
    balanceAtBirthYears: DASHA_YEARS[lord] * (1 - elapsed),
    mahadashas,
  };
}

/**
 * Legacy display shape (birth Mahadasha + 8 following, each with Antardashas),
 * derived from vimshottariDasha and clipped at birth.
 */
export function calculateDashas(moonSiderealLon: number, birthDate: Date): DashaEntry[] {
  const birthMs = birthDate.getTime();
  const now = Date.now();
  return vimshottariDasha(moonSiderealLon, birthDate).mahadashas.map((m) => {
    const start = Math.max(Date.parse(m.start), birthMs);
    const end = Date.parse(m.end);
    const antardashas = m.antardashas
      .filter((a) => Date.parse(a.end) > birthMs)
      .map((a) => makeAntardasha(a.lord, new Date(Math.max(Date.parse(a.start), birthMs)), new Date(a.end), now, true));
    const s = new Date(start).toISOString().slice(0, 10);
    const e = new Date(end).toISOString().slice(0, 10);
    return {
      planet: m.lord,
      period: `${s.slice(0, 7)} – ${e.slice(0, 7)}`,
      status: periodStatus(start, end, now),
      startDate: s,
      endDate: e,
      antardashas,
    };
  });
}

function periodStatus(start: number, end: number, now: number): 'past' | 'current' | 'upcoming' {
  return now >= start && now <= end ? 'current' : now > end ? 'past' : 'upcoming';
}

function makeAntardasha(planet: string, start: Date, end: Date, now: number, withPratyantar = false): AntardashaEntry {
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  const status = periodStatus(start.getTime(), end.getTime(), now);
  const entry: AntardashaEntry = { planet, period: `${s.slice(0, 7)} – ${e.slice(0, 7)}`, status, startDate: s, endDate: e };
  if (withPratyantar && status === 'current') {
    entry.pratyantardashas = vimshottariSubPeriods(planet, start.getTime(), end.getTime())
      .map((p) => makeAntardasha(p.lord, new Date(p.start), new Date(p.end), now, false));
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

export interface YoginiPeriod extends DashaPeriod { yogini: string; years: number }

/** Yogini Mahadashas with the birth period placed at its true (virtual) start. */
export function yoginiDasha(moonSiderealLon: number, birthUTC: Date, count = 14): { birthYogini: string; elapsedFractionAtBirth: number; periods: YoginiPeriod[] } {
  const lon = ((moonSiderealLon % 360) + 360) % 360;
  const nakIdx = nakshatraIndex(lon);
  const elapsed = (lon % NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const r = ((nakIdx + 1) + 3) % 8;
  const startIdx = r === 0 ? 7 : r - 1;
  let cursor = birthUTC.getTime() - elapsed * YOGINIS[startIdx].years * MS_PER_YEAR;
  const periods: YoginiPeriod[] = [];
  for (let i = 0; i < count; i++) {
    const y = YOGINIS[(startIdx + i) % 8];
    const end = cursor + y.years * MS_PER_YEAR;
    periods.push({ yogini: y.name, lord: y.lord, years: y.years, start: new Date(cursor).toISOString(), end: new Date(end).toISOString() });
    cursor = end;
  }
  return { birthYogini: YOGINIS[startIdx].name, elapsedFractionAtBirth: elapsed, periods };
}
