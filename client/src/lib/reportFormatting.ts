export interface DashaDisplayPeriod {
  period?: string;
  startDate?: string;
  endDate?: string;
}

/** Display an engine-provided dasha range; never derives or guesses a date. */
export function formatDashaPeriod(period: DashaDisplayPeriod): string {
  if (period.startDate && period.endDate) return `${period.startDate} – ${period.endDate}`;
  return period.period || '—';
}

/** Round a sign-relative longitude for display only, retaining the source number unchanged. */
export function formatPlanetDegree(degree: number | null | undefined, minuteMark = '′'): string {
  if (typeof degree !== 'number' || !Number.isFinite(degree)) return '—';
  // A rounded 30°00′ belongs to the next sign. Clamp to the last displayable minute because
  // the sign itself remains the engine's authoritative value.
  const totalMinutes = Math.min(29 * 60 + 59, Math.max(0, Math.round(degree * 60)));
  return `${Math.floor(totalMinutes / 60)}°${String(totalMinutes % 60).padStart(2, '0')}${minuteMark}`;
}
