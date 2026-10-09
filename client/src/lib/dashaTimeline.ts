// The Dasha timeline page: which period is open, how long each lasts, and what may be called "now".
import type { KundliInsights, TimelinePeriod } from '@shared/v3/evidence';

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
