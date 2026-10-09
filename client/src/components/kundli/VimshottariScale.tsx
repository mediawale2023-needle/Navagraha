import type { ReactNode } from 'react';
import { GRAHA_ABBR } from '@/lib/jyotishNames';
import { monthYearUTC, vimshottariScale, type Period } from '@/lib/vimshottari';

interface ScaleProps {
  periods: Period[];
  /** Where the bar starts: birth for the Mahadashas, the Mahadasha's start for its Antardashas. */
  from: Date;
  heading: ReactNode;
  headingId: string;
  /** False when the birth time cannot vouch for the period running now: nothing is marked current. */
  currentKnown: boolean;
  /** Text after the "Now" date beneath the bar. */
  nowLabel?: string;
  note?: string | null;
  testId?: string;
  /** What the bar shows, for screen readers, e.g. "Vimshottari Mahadashas". */
  subject: string;
  /** Called with a segment's index when it is chosen; segments are plain spans otherwise. */
  onSelect?: (index: number) => void;
  selected?: number | null;
  /** Append "· now" to the current segment's label (too long for short Antardashas). */
  nowSuffix?: boolean;
}

/** Direction 3 "to scale" bar: 44px, each period sized by its years, the current one amber, today marked. */
export function PeriodScale({ periods, from, subject, heading, headingId, currentKnown, nowLabel, note, testId, onSelect, selected, nowSuffix = true }: ScaleProps) {
  const now = new Date();
  const scale = vimshottariScale(periods, from, now, currentKnown);
  if (!scale) return null;
  // vimshottariScale drops periods that end before `from`; keep indexes aligned with the caller's list.
  const offset = periods.length - scale.segments.length;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="m-0 font-display text-card-title font-semibold md:text-heading">{heading}</h2>
        <span className="text-sm text-ink-muted">{scale.start.getFullYear()} → {scale.end.getFullYear()}{scale.today != null ? ' · marker: today' : ''}</span>
      </div>
      <div className="relative flex h-11 overflow-hidden rounded-sm border border-ink text-caption" role={onSelect ? 'group' : 'img'}
        aria-label={`${subject} from ${monthYearUTC(scale.start)} to ${monthYearUTC(scale.end)}: ${scale.segments.map((s) => `${s.lord} ${s.years >= 1 ? `${Math.round(s.years)} years` : `${Math.round(s.years * 12)} months`}`).join(', ')}.`}>
        {scale.segments.map((s, i) => {
          const cls = `flex min-w-0 items-center overflow-hidden whitespace-nowrap pl-1.5 md:pl-2 ${s.current ? 'bg-amber font-semibold' : `${i % 2 ? 'bg-surface' : 'bg-highlight'} ${i < scale.segments.length - 1 && !scale.segments[i + 1].current ? 'border-r border-line' : ''}`} ${selected === i + offset ? 'outline outline-2 -outline-offset-2 outline-ink' : ''}`;
          const label = (
            <>
              <span className="md:hidden">{GRAHA_ABBR[s.lord] ?? s.lord}</span>
              <span className="hidden md:inline">{s.lord}{s.current && nowSuffix ? ' · now' : ''}</span>
            </>
          );
          return onSelect ? (
            <button key={`${s.lord}-${i}`} type="button" style={{ flex: s.years }} className={`${cls} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink`}
              aria-label={`${s.lord}, ${monthYearUTC(s.start)} to ${monthYearUTC(s.end)}`} aria-pressed={selected === i + offset} onClick={() => onSelect(i + offset)}>{label}</button>
          ) : (
            <span key={`${s.lord}-${i}`} style={{ flex: s.years }} className={cls}>{label}</span>
          );
        })}
        {scale.today != null && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(scale.today * 100).toFixed(1)}%` }} />}
      </div>
      <div className="flex justify-between gap-2 text-caption tabular-nums text-ink-muted">
        <span>{monthYearUTC(scale.start)}</span>
        {scale.today != null && <span>Now: {monthYearUTC(now)}{nowLabel ? `, ${nowLabel}` : ''}</span>}
        <span>{monthYearUTC(scale.end)}</span>
      </div>
      {note && <p className="text-caption text-ink-muted">{note} Dates are for the time entered.</p>}
    </section>
  );
}

interface Props {
  periods: Period[];
  birth: Date;
  /** The running Mahadasha/Antardasha, when the birth time can vouch for them. */
  maha?: string;
  antar?: string;
  /** Shown when an approximate birth time could shift the dates. */
  note?: string | null;
  onSelect?: (index: number) => void;
  selected?: number | null;
}

/** The whole Vimshottari sequence from birth. */
export function VimshottariScale({ periods, birth, maha, antar, note, onSelect, selected }: Props) {
  return (
    <PeriodScale
      periods={periods}
      from={birth}
      subject="Vimshottari Mahadashas"
      headingId="kundli-dasha"
      heading={<>Vimshottari, to scale <span lang="hi" className="text-base font-normal text-ink-muted md:text-[17px]">विंशोत्तरी</span></>}
      currentKnown={!!maha}
      nowLabel={maha ? `${maha}${antar ? `–${antar}` : ''}` : undefined}
      note={note}
      testId="vimshottari-scale"
      onSelect={onSelect}
      selected={selected}
    />
  );
}
