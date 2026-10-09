import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import type { Astrologer } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/lib/marketplace';
import { isAstrologerAvailable } from '@/lib/astrologerPresence';
import { AstrologerCard } from '@/components/astrologer-card';
import { TodayHero } from '@/components/today/TodayHero';
import { GocharaSection } from '@/components/today/GocharaSection';
import { VimshottariNow } from '@/components/today/VimshottariNow';
import { AskCard } from '@/components/today/AskCard';
import { useGochara, usePanchangToday, useTodayChart } from '@/components/today/useToday';
import { suggestedQuestion } from '@/lib/today';

/**
 * Today (Direction 3): the day's Panchang, the Gochara and running dasha of a saved chart, and a
 * way into Ask. Every figure comes from the engine; the chart in use is always named.
 */
export default function Home() {
  const { isAuthenticated } = useAuth();
  const marketplace = useMarketplace();
  const panchang = usePanchangToday();
  const today = useTodayChart(isAuthenticated);
  const gochara = useGochara(today.moonSign);
  const name = today.chart?.name ?? null;
  const moonUncertain = !!today.chart && !today.limited && !today.loading && !today.insightsError && !today.moonSign;

  const { data: astrologers } = useQuery<Astrologer[]>({ queryKey: ['/api/astrologers'], enabled: marketplace });

  return (
    <div>
      <TodayHero
        panchang={panchang.data}
        loading={panchang.isLoading}
        failed={panchang.isError}
        birth={name && today.birthNakshatra ? { chartName: name, nakshatra: today.birthNakshatra } : null}
      />

      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3.5 px-4 pt-4 md:gap-9 md:px-10 md:pb-14 md:pt-10">
        {today.charts.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <label htmlFor="today-chart">Reading the chart of</label>
            <select
              id="today-chart"
              value={today.chart?.id}
              onChange={(e) => today.choose(e.target.value)}
              className="min-h-11 rounded-md border border-line bg-surface px-3 text-base text-ink"
              data-testid="today-chart-select"
            >
              {today.charts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <GocharaSection
          chartName={name}
          chartId={today.chart?.id ?? null}
          moonSign={today.moonSign}
          reading={gochara.data}
          loading={today.loading || gochara.isLoading}
          failed={gochara.isError || today.limited}
          moonUncertain={moonUncertain}
        />

        <div className="grid gap-3.5 md:grid-cols-2 md:gap-7">
          <VimshottariNow
            chartId={today.chart?.id ?? null}
            chartName={name}
            insights={today.insights}
            loading={today.loading}
            failed={today.insightsError}
            limited={today.limited}
          />
          <AskCard chartId={today.chart && !today.limited ? today.chart.id : null} suggestion={suggestedQuestion(gochara.data)} />
        </div>

        {marketplace && (astrologers?.length ?? 0) > 0 && (
          <section aria-labelledby="today-astrologers" className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="today-astrologers" className="m-0 font-display text-card-title font-semibold md:text-subhead">Astrologers online</h2>
              <Link href="/astrologers" className="text-sm underline">See all</Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible lg:grid-cols-5">
              {astrologers!.slice(0, 5).map((a) => (
                <AstrologerCard
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  image={a.profileImageUrl || ''}
                  rating={a.rating}
                  experience={a.experience}
                  price={a.pricePerMinute}
                  specialization={a.specializations?.[0] || 'Vedic Astrology'}
                  isVerified={Boolean(a.isVerified)}
                  isOnline={isAstrologerAvailable(a)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
