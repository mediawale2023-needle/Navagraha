import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PageBody, PageHeader } from '@/components/shell/PageHeader';
import { PeriodScale, VimshottariScale } from '@/components/kundli/VimshottariScale';
import { grahaSanskrit, GRAHA_HI } from '@/lib/jyotishNames';
import { monthYear } from '@/lib/runningPeriods';
import { periodLength, shownStatus, timelineView } from '@/lib/dashaTimeline';
import { recreateHref } from '@/lib/recreateChart';
import { DOMAIN_LABELS, type KundliInsights, type TimelinePeriod } from '@shared/v3/evidence';
import type { CanonicalChart } from '@shared/v3/canonical';
import type { Kundli } from '@shared/schema';

const range = (p: { start: string; end: string }) => `${monthYear(p.start)} – ${monthYear(p.end)}`;
const DIRECTION_TEXT = { positive: 'text-positive', negative: 'text-negative', neutral: 'text-ink-muted' } as const;

function StatusPill({ status }: { status: 'now' | 'past' | null }) {
  if (status !== 'now') return null;
  return <span className="rounded-chip bg-amber px-2 py-0.5 text-xs font-semibold text-ink">Now</span>;
}

/** What a period engages in this chart: the evidence engine's own reasons, never new claims. */
function PeriodEvidence({ p }: { p: TimelinePeriod }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-base">{p.whyItMatters}</p>
      {p.domains.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Life areas this period engages">
          {p.domains.map((d) => (
            <li key={d.domain} title={d.reasons.join('; ')} className={`rounded-chip border border-line bg-surface px-2.5 py-1 text-sm ${DIRECTION_TEXT[d.direction]}`}>
              {DOMAIN_LABELS[d.domain]}
            </li>
          ))}
        </ul>
      )}
      {(p.supporting.length > 0 || p.conflicting.length > 0) && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
          {p.supporting.map((s) => <li key={`f-${s}`}><span className="font-semibold text-positive">For</span> · {s}</li>)}
          {p.conflicting.map((s) => <li key={`a-${s}`}><span className="font-semibold text-negative">Against</span> · {s}</li>)}
        </ul>
      )}
      <p className="m-0 text-caption text-ink-muted">{p.confidence} confidence</p>
    </div>
  );
}

/** Direction 3 Dasha timeline: the life to scale, each Mahadasha and its Antardashas with their evidence. */
export default function DashaTimeline() {
  const [, params] = useRoute('/kundli/:id/dasha');
  const id = params?.id;
  const { data: kundli, isLoading } = useQuery<Kundli>({ queryKey: [`/api/kundli/${id}`], enabled: !!id });
  const limited = (kundli as any)?.chartStatus?.version === 'limited';
  const canonical: CanonicalChart | undefined = (kundli?.chartData as any)?.canonical;
  const { data: insights, isLoading: insightsLoading } = useQuery<KundliInsights>({
    queryKey: ['/api/kundli', id, 'insights'],
    enabled: !!id && !!kundli && !limited,
  });
  const view = insights ? timelineView(insights) : null;
  const [selected, setSelected] = useState<number | null>(null);
  const [antar, setAntar] = useState<number | null>(null);
  useEffect(() => { if (view && selected === null) setSelected(view.initial); }, [view, selected]);

  const back = { href: id ? `/kundli/${id}` : '/kundli', label: 'Kundli' };
  if (isLoading) return <LoadingSpinner />;
  if (!kundli) {
    return (
      <div>
        <PageHeader title="Chart not found" back={{ href: '/kundli', label: 'Kundli' }} />
        <PageBody><p className="text-base text-ink-muted">This chart does not exist or is not yours.</p></PageBody>
      </div>
    );
  }

  const moon = canonical?.planets.find((p) => p.name === 'Moon');
  const nakshatraKnown = !!canonical && (canonical.birth.timeAccuracy === 'exact' || canonical.uncertainty.moonNakshatraStableAcrossBirthDate);
  const sub = `${kundli.name}’s chart · Vimshottari from the Moon’s nakshatra${nakshatraKnown && moon ? `, ${moon.nakshatra.name}` : ''}`;
  const header = <PageHeader title="Dasha" gloss="दशा" sub={sub} back={back} />;

  if (limited || (!canonical && !insightsLoading)) {
    return (
      <div>
        {header}
        <PageBody>
          <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-[22px] text-base" data-testid="dasha-limited">
            <p className="m-0">{(kundli as any).chartStatus?.notes?.[0] ?? 'This chart has no verified calculation.'}</p>
            <p className="m-0 text-ink-muted">Dasha periods are counted from the Moon’s exact position at birth, so they are not shown for this chart.</p>
            <Link href={recreateHref(kundli as any)}><Button>Recreate with birth place <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
          </div>
        </PageBody>
      </div>
    );
  }
  if (!insights || !view || !canonical) return <div>{header}<LoadingSpinner /></div>;

  const sel = view.periods[selected ?? view.initial];
  const selIndex = selected ?? view.initial;
  const known = view.current !== null;
  const antars = sel?.antardashas ?? [];
  const openAntar = antar !== null ? antars[antar] : undefined;
  const choose = (i: number) => {
    setSelected(i);
    setAntar(null);
    if (window.matchMedia('(max-width: 767px)').matches) document.getElementById('dasha-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const runningAntar = view.antarKnown ? view.periods[view.current ?? -1]?.antardashas?.find((a) => a.status === 'current') : undefined;

  return (
    <div>
      {header}
      <PageBody className="flex flex-col gap-8">
        {insights.timing?.note && (
          <p className="m-0 rounded-md border border-line bg-highlight px-4 py-3 text-sm" data-testid="dasha-timing-note">{insights.timing.note} Dates are for the time entered.</p>
        )}

        <VimshottariScale
          periods={view.periods}
          birth={new Date(canonical.birth.birthUTC)}
          maha={known ? view.periods[view.current!].lord : undefined}
          antar={runningAntar?.lord}
          onSelect={choose}
          selected={selIndex}
        />

        <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
          <section aria-labelledby="dasha-list" className="flex min-w-0 flex-col gap-3">
            <h2 id="dasha-list" className="m-0 font-display text-card-title font-semibold md:text-heading">Mahadashas <span lang="hi" className="text-base font-normal text-ink-muted">महादशा</span></h2>
            <ol className="m-0 list-none overflow-hidden rounded-lg border border-line bg-surface p-0" data-testid="dasha-list">
              {view.periods.map((p, i) => (
                <li key={p.start} className={i > 0 ? 'border-t border-hairline' : ''}>
                  <button type="button" onClick={() => choose(i)} aria-current={i === selIndex ? 'true' : undefined}
                    className={`grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink ${i === selIndex ? 'bg-highlight' : 'hover:bg-sunken'}`}>
                    <span className="font-display text-[19px] font-semibold">
                      {grahaSanskrit(p.lord)} <span className="font-sans text-sm font-normal text-ink-muted">{p.lord}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm tabular-nums text-ink-muted">
                      <StatusPill status={shownStatus(p, known)} />{periodLength(p)}
                    </span>
                    <span className="text-sm tabular-nums text-ink-muted">{range(p)}</span>
                    <span className="sr-only">{p.themes.join(', ')}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {sel && (
            <section id="dasha-detail" aria-labelledby="dasha-detail-h" className="flex min-w-0 scroll-mt-4 flex-col gap-5" data-testid="dasha-detail">
              <div className="flex flex-col gap-1">
                <h2 id="dasha-detail-h" className="m-0 font-display text-section font-semibold md:text-title">
                  {grahaSanskrit(sel.lord)} Mahadasha <span lang="hi" className="text-subhead font-normal text-ink-muted">{GRAHA_HI[sel.lord]}</span>
                </h2>
                <p className="m-0 text-sm tabular-nums text-ink-muted">{sel.lord} · {range(sel)} · {periodLength(sel)}</p>
                {sel.themes.length > 0 && <p className="m-0 text-nav">{sel.themes.join(' · ')}</p>}
              </div>
              <PeriodEvidence p={sel} />

              {antars.length > 0 && (
                <>
                  <PeriodScale
                    periods={antars}
                    from={new Date(sel.start)}
                    subject={`Antardashas of the ${sel.lord} Mahadasha`}
                    headingId="dasha-antar"
                    heading={<>Antardashas <span lang="hi" className="text-base font-normal text-ink-muted">अन्तर्दशा</span></>}
                    currentKnown={view.antarKnown && sel.status === 'current'}
                    nowLabel={runningAntar && sel.status === 'current' ? runningAntar.lord : undefined}
                    testId="antar-scale"
                    nowSuffix={false}
                    onSelect={(j) => setAntar(antar === j ? null : j)}
                    selected={antar}
                  />
                  <ol className="m-0 grid list-none grid-cols-2 gap-0 overflow-hidden rounded-lg border border-line bg-surface p-0 lg:grid-cols-3" data-testid="antar-list">
                    {antars.map((a, j) => (
                      <li key={a.start} className="border-b border-r border-hairline max-lg:even:border-r-0 lg:[&:nth-child(3n)]:border-r-0">
                        <button type="button" onClick={() => setAntar(antar === j ? null : j)} aria-expanded={antar === j}
                          className={`flex w-full flex-col px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink ${antar === j ? 'bg-highlight' : 'hover:bg-sunken'}`}>
                          <span className="flex items-center justify-between gap-2 font-semibold">
                            {sel.lord}–{a.lord} <StatusPill status={shownStatus(a, view.antarKnown && sel.status === 'current')} />
                          </span>
                          <span className="text-caption tabular-nums text-ink-muted">{monthYear(a.start)} – {monthYear(a.end)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  {openAntar && (
                    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 md:p-[22px]" data-testid="antar-detail">
                      <h3 className="m-0 font-display text-card-title font-semibold">{grahaSanskrit(sel.lord)}–{grahaSanskrit(openAntar.lord)} <span className="font-sans text-sm font-normal text-ink-muted">{range(openAntar)} · {periodLength(openAntar)}</span></h3>
                      <PeriodEvidence p={openAntar} />
                    </div>
                  )}
                </>
              )}

              <Link href={`/ai-astrologer?${new URLSearchParams({ kundliId: kundli.id, q: `What does my ${sel.lord} Mahadasha bring?` }).toString()}`}
                className="self-start text-sm underline hover:text-amber-text">
                Ask your Kundli about this period
              </Link>
            </section>
          )}
        </div>

        <p className="m-0 max-w-[65ch] text-caption text-ink-muted">
          Vimshottari dashas are counted from the Moon’s position at birth. Themes describe what each period’s planet engages in this chart; they are tendencies, not certainties.
        </p>
      </PageBody>
    </div>
  );
}
