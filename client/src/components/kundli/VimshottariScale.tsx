import { GRAHA_ABBR } from '@/lib/jyotishNames';
import { monthYearUTC, vimshottariScale, type Period } from '@/lib/vimshottari';

interface Props {
  periods: Period[];
  birth: Date;
  /** The running Mahadasha/Antardasha, when the birth time can vouch for them. */
  maha?: string;
  antar?: string;
  /** Shown when an approximate birth time could shift the dates. */
  note?: string | null;
}

/** Direction 3 "Vimshottari, to scale": a 44px bar, each Mahadasha sized by its years, today marked. */
export function VimshottariScale({ periods, birth, maha, antar, note }: Props) {
  const scale = vimshottariScale(periods, birth, new Date(), !!maha);
  if (!scale) return null;
  const now = new Date();
  return (
    <section aria-labelledby="kundli-dasha" className="flex flex-col gap-2.5" data-testid="vimshottari-scale">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="kundli-dasha" className="m-0 font-display text-card-title font-semibold md:text-heading">
          Vimshottari, to scale <span lang="hi" className="text-base font-normal text-ink-muted md:text-[17px]">विंशोत्तरी</span>
        </h2>
        <span className="text-sm text-ink-muted">{scale.start.getFullYear()} → {scale.end.getFullYear()} · marker: today</span>
      </div>
      <div className="relative flex h-11 overflow-hidden rounded-sm border border-ink text-caption" role="img"
        aria-label={`Vimshottari Mahadashas from ${monthYearUTC(scale.start)} to ${monthYearUTC(scale.end)}: ${scale.segments.map((s) => `${s.lord} ${Math.round(s.years)} years`).join(', ')}.`}>
        {scale.segments.map((s, i) => (
          <span
            key={`${s.lord}-${i}`}
            style={{ flex: s.years }}
            className={`flex min-w-0 items-center overflow-hidden whitespace-nowrap pl-1.5 md:pl-2 ${s.current ? 'bg-amber font-semibold' : `${i % 2 ? 'bg-surface' : 'bg-highlight'} ${i < scale.segments.length - 1 && !scale.segments[i + 1].current ? 'border-r border-line' : ''}`}`}
          >
            <span className="md:hidden">{GRAHA_ABBR[s.lord] ?? s.lord}</span>
            <span className="hidden md:inline">{s.lord}{s.current ? ' · now' : ''}</span>
          </span>
        ))}
        {scale.today != null && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(scale.today * 100).toFixed(1)}%` }} />}
      </div>
      <div className="flex justify-between gap-2 text-caption tabular-nums text-ink-muted">
        <span>{monthYearUTC(scale.start)}</span>
        <span>Now: {monthYearUTC(now)}{maha ? `, ${maha}${antar ? `–${antar}` : ''}` : ''}</span>
        <span>{monthYearUTC(scale.end)}</span>
      </div>
      {note && <p className="text-caption text-ink-muted">{note} Dates are for the time entered.</p>}
    </section>
  );
}
