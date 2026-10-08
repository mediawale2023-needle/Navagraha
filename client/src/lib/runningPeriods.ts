import type { KundliInsights } from '@shared/v3/evidence';

type Period = KundliInsights['timeline'][number];
type SubPeriod = NonNullable<Period['antardashas']>[number];

export interface RunningPeriods {
  maha?: Period;
  antar?: SubPeriod;
  /** Dates are withheld when the birth time is approximate. */
  showDates: boolean;
  /** Why a period is withheld or undated, when the birth time is approximate. */
  note: string | null;
}

/**
 * The Vimshottari periods running now, as far as the chart can vouch for them:
 * a period whose boundaries an approximate birth time could move is not shown.
 */
export function selectRunningPeriods(insights: KundliInsights): RunningPeriods {
  const timing = insights.timing ?? { mahadashaReliable: true, antardashaReliable: true, note: null };
  const approximate = insights.headline.timeAccuracy === 'approximate';
  const maha = timing.mahadashaReliable ? insights.timeline.find((p) => p.status === 'current') : undefined;
  const antar = timing.antardashaReliable ? maha?.antardashas?.find((a) => a.status === 'current') : undefined;
  return { maha, antar, showDates: !approximate, note: timing.note };
}

export const monthYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
