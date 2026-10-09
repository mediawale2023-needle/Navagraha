import { Link } from 'wouter';
import type { KundliInsights } from '@shared/v3/evidence';
import { selectRunningPeriods, monthYear } from '@/lib/runningPeriods';
import { grahaSanskrit } from '@/lib/jyotishNames';
import { elapsedShare } from '@/lib/today';

interface Props {
  chartId: string | null;
  chartName: string | null;
  insights: KundliInsights | null;
  loading: boolean;
  failed: boolean;
  limited: boolean;
}

/** The Mahadasha and Antardasha running now, with the Mahadasha's elapsed share (Direction 3 card). */
export function VimshottariNow({ chartId, chartName, insights, loading, failed, limited }: Props) {
  const running = insights ? selectRunningPeriods(insights) : null;
  const maha = running?.maha;
  const antar = running?.antar;
  const href = chartId ? `/kundli/${chartId}/dasha` : '/kundli/new';
  const names = maha ? [maha.lord, antar?.lord].filter(Boolean).map((l) => grahaSanskrit(l as string)).join(' · ') : null;
  const share = maha && running?.showDates ? elapsedShare(maha.start, maha.end) : null;

  let state: string | null = null;
  if (!chartName) state = 'Create a Kundli to see which dasha is running.';
  else if (limited) state = `${chartName}’s chart needs its birth place before its periods can be shown.`;
  else if (loading) state = 'Reading the running periods…';
  else if (failed || !insights) state = 'The running periods could not be loaded right now.';
  else if (!maha) state = running?.note ?? 'The running period can’t be fixed from this birth time.';

  const desktopSub = maha && running?.showDates
    ? [`${maha.lord} Mahadasha to ${monthYear(maha.end)}`, antar && `${antar.lord} Antardasha to ${monthYear(antar.end)}`].filter(Boolean).join(' · ')
    : maha ? [`${maha.lord} Mahadasha`, antar && `${antar.lord} Antardasha`].filter(Boolean).join(' · ') : '';
  const mobileSub = maha && running?.showDates
    ? [`${maha.lord} to ${monthYear(maha.end)}`, antar && `${antar.lord} to ${monthYear(antar.end)}`].filter(Boolean).join(' · ')
    : desktopSub;
  const bar = (h: string) => share != null && (
    <span aria-hidden="true" className={`flex overflow-hidden rounded-full ${h}`}>
      <span className="bg-amber" style={{ flex: share }} />
      <span className="bg-sunken" style={{ flex: 1 - share }} />
    </span>
  );

  return (
    <>
      <section aria-labelledby="today-dasha" className="hidden flex-col gap-3 rounded-lg border border-line bg-surface p-[22px] md:flex" data-testid="today-dasha">
        <h2 id="today-dasha" className="m-0 font-display text-subhead font-semibold">Vimshottari now <span lang="hi" className="text-base font-normal text-ink-muted">दशा</span></h2>
        {state ? <p className="text-base text-ink" role="status">{state}</p> : (
          <>
            <p className="m-0 font-display text-section font-semibold">{names}</p>
            <p className="-mt-2 text-sm text-ink-muted">{desktopSub}</p>
            {running?.note && <p className="text-sm text-ink-muted">{running.note}</p>}
            {bar('h-2.5')}
          </>
        )}
        <Link href={href} className="self-start text-sm text-ink underline hover:text-amber-text">{chartName ? 'Open the Dasha timeline' : 'Create a Kundli'}</Link>
      </section>

      <Link href={href} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-3.5 text-ink no-underline md:hidden" data-testid="today-dasha-mobile">
        {state ? <span className="text-nav" role="status">{state}</span> : (
          <>
            <span className="font-display text-[19px] font-semibold">{names} <span className="font-sans text-sm font-normal text-ink-muted">dasha now</span></span>
            {bar('h-2')}
            <span className="text-caption text-ink-muted">{mobileSub}</span>
          </>
        )}
      </Link>
    </>
  );
}
