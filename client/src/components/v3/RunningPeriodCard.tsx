import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import type { KundliInsights } from '@shared/v3/evidence';
import { monthYear, selectRunningPeriods } from '@/lib/runningPeriods';

/** Home's running-period card: the Mahadasha/Antardasha actually running in the user's latest chart. */
export function RunningPeriodCard() {
  const [, setLocation] = useLocation();
  const { data: kundlis, isLoading: listLoading } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ['/api/kundli'] });
  const latest = kundlis?.[0];
  const { data: insights, isError } = useQuery<KundliInsights>({ queryKey: ['/api/kundli', latest?.id, 'insights'], enabled: !!latest });

  let eyebrow = 'Running period';
  let title: string;
  let body: string;
  let primary = { label: 'Create chart', sub: 'Get your kundli', href: '/kundli/new' };

  if (listLoading || (latest && !insights && !isError)) {
    title = '…';
    body = 'Loading the period running in your chart.';
  } else if (!latest) {
    title = 'Create your Kundli';
    body = 'See the planetary period actually running in your chart, and what it engages.';
  } else if (isError || !insights) {
    title = 'Recreate your chart';
    body = `${latest.name}'s chart was made with an older engine and needs its birth place to show current periods.`;
    primary = { label: 'Open chart', sub: 'Recreate it', href: `/kundli/${latest.id}` };
  } else {
    const { maha, antar, showDates, note } = selectRunningPeriods(insights);
    eyebrow = `Running now · ${latest.name}'s chart`;
    primary = { label: 'Life Timeline', sub: 'Your periods, explained', href: `/kundli/${latest.id}?tab=insights` };
    if (!maha) {
      title = 'Period uncertain';
      body = note ?? 'The current period could not be determined from this chart.';
    } else {
      title = `${maha.lord} Mahadasha`;
      body = antar
        ? `${antar.lord} Antardasha${showDates ? ` until ${monthYear(antar.end)}` : ''}. ${antar.whyItMatters}`
        : `${showDates ? `Until ${monthYear(maha.end)}. ` : ''}${maha.whyItMatters}`;
    }
  }

  return (
    <div className="yantra-card-dark p-5" data-testid="running-period-card">
      <p className="yantra-eyebrow text-primary/75">{eyebrow}</p>
      <h2 className="font-display mt-2 text-2xl text-primary" data-testid="running-period-title">{title}</h2>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{body}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => setLocation(primary.href)}
          className="rounded-[9px] bg-primary px-4 py-4 text-left text-primary-foreground transition-colors hover:opacity-90"
        >
          <p className="font-display text-sm">{primary.label}</p>
          <p className="mt-1 text-xs text-primary-foreground/75">{primary.sub}</p>
        </button>
        <button
          onClick={() => setLocation('/astrologers')}
          className="rounded-[9px] border border-primary/40 bg-transparent px-4 py-4 text-left transition-colors hover:bg-white/5"
        >
          <p className="font-display text-sm text-primary">Talk live</p>
          <p className="mt-1 text-xs text-primary/70">Browse astrologers</p>
        </button>
      </div>
    </div>
  );
}
