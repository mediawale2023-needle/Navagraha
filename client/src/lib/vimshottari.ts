// The Vimshottari sequence drawn to scale from birth: each Mahadasha a segment sized by its length.

export interface Period { lord: string; start: string; end: string }

export interface ScaleSegment { lord: string; start: Date; end: Date; years: number; current: boolean }

export interface Scale {
  start: Date;
  end: Date;
  segments: ScaleSegment[];
  /** Where today falls, 0..1 along the bar; null outside the sequence. */
  today: number | null;
}

const YEAR = 365.2425 * 86_400_000;

/** The birth Mahadasha starts before birth (at its true start); the bar starts at birth. */
export function vimshottariScale(periods: Period[], birth: Date, now = new Date(), currentKnown = true): Scale | null {
  if (!periods.length) return null;
  const segments = periods.map((p) => {
    const start = new Date(Math.max(new Date(p.start).getTime(), birth.getTime()));
    const end = new Date(p.end);
    return { lord: p.lord, start, end, years: Math.max(0, (end.getTime() - start.getTime()) / YEAR), current: false };
  }).filter((s) => s.years > 0);
  if (!segments.length) return null;
  const start = segments[0].start;
  const end = segments[segments.length - 1].end;
  const t = now.getTime();
  if (currentKnown) for (const s of segments) s.current = s.start.getTime() <= t && t < s.end.getTime();
  const today = t >= start.getTime() && t < end.getTime() ? (t - start.getTime()) / (end.getTime() - start.getTime()) : null;
  return { start, end, segments, today };
}

export const monthYearUTC = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
