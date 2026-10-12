// The Dasha timeline page: which period is open, how long each lasts, and what may be called "now".
import type { KundliInsights, TimelinePeriod } from '@shared/v3/evidence';
import type { CanonicalChart } from '@shared/v3/canonical';

const YEAR = 365.2425 * 86_400_000;

/** A period's full length (the birth Mahadasha's too, not just the part after birth). */
export function periodLength(p: { start: string; end: string }): string {
  const years = (new Date(p.end).getTime() - new Date(p.start).getTime()) / YEAR;
  if (years >= 1) {
    const rounded = Math.round(years * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} yrs`;
  }
  return `${Math.max(1, Math.round(years * 12))} mo`;
}

export interface TimelineView {
  periods: TimelinePeriod[];
  /** Index of the running Mahadasha, only when the birth time can vouch for it. */
  current: number | null;
  /** Whether an Antardasha may be marked as running. */
  antarKnown: boolean;
  /** The period opened first: the running one, else the birth Mahadasha. */
  initial: number;
}

export function timelineView(insights: KundliInsights): TimelineView {
  const timing = insights.timing ?? { mahadashaReliable: true, antardashaReliable: true, note: null };
  const periods = insights.timeline;
  const idx = periods.findIndex((p) => p.status === 'current');
  const current = timing.mahadashaReliable && idx >= 0 ? idx : null;
  return { periods, current, antarKnown: timing.mahadashaReliable && timing.antardashaReliable, initial: current ?? 0 };
}

/** The status a row may show: "now" only for a period the birth time can vouch for. */
export function shownStatus(p: TimelinePeriod, known: boolean): 'now' | 'past' | null {
  if (p.status === 'current') return known ? 'now' : null;
  if (p.status === 'past' && known) return 'past';
  return null;
}

// ─── Approximate birth time ─────────────────────────────────────────────────
// The Moon's position at birth sets where the Vimshottari cycle starts and how much of the
// first period was left, so an approximate birth time moves every date. Only the fixed order
// and each period's standard length are stated; the starting period only when the Moon kept
// one nakshatra all day.

const VIMSHOTTARI_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'] as const;
export const VIMSHOTTARI_YEARS: Record<string, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };

export interface ApproximateDasha {
  /** True when the period running at birth is known (the Moon kept one nakshatra all day). */
  startKnown: boolean;
  /** Nine periods in Vimshottari order with their standard lengths; from the birth period when it is known. */
  sequence: Array<{ lord: string; years: number; atBirth: boolean }>;
  explanation: string;
}

export function approximateDasha(chart: Pick<CanonicalChart, 'birth' | 'uncertainty' | 'planets'>): ApproximateDasha | null {
  if (chart.birth.timeAccuracy !== 'approximate') return null;
  const startKnown = chart.uncertainty.moonNakshatraStableAcrossBirthDate;
  const first = startKnown ? chart.planets.find((p) => p.name === 'Moon')?.nakshatra.lord ?? 'Ketu' : 'Ketu';
  const i = Math.max(0, VIMSHOTTARI_ORDER.indexOf(first as (typeof VIMSHOTTARI_ORDER)[number]));
  const sequence = VIMSHOTTARI_ORDER.map((_, k) => VIMSHOTTARI_ORDER[(i + k) % 9]).map((lord, k) => ({ lord, years: VIMSHOTTARI_YEARS[lord], atBirth: startKnown && k === 0 }));
  const explanation = startKnown
    ? `Your birth time is approximate. The Moon stayed in one nakshatra all day, so you were born in the ${first} period, but how much of it was left at birth depends on the exact time. That moves the start and end of every period below by months or years, so no dates are shown. The order is fixed, and each period has its standard length.`
    : 'Your birth time is approximate, and the Moon moved into a different nakshatra during your birth date. That nakshatra decides which period your life began in, so the starting period and every date after it depend on the exact birth time. Below is the standard Vimshottari order and the length of each period.';
  return { startKnown, sequence, explanation };
}
