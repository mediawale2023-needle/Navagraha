import { Link } from 'wouter';
import { NakshatraRing } from './NakshatraRing';
import { VARA_HI, karanaHi, nakshatraHi, nakshatraIndex, tithiHi, tithiName, yogaHi } from '@/lib/jyotishNames';
import { heroTitle, type PanchangToday } from '@/lib/today';

interface Props {
  panchang: PanchangToday | undefined;
  loading: boolean;
  failed: boolean;
  /** The chart whose birth Moon is outlined on the ring, when it can be vouched for. */
  birth: { chartName: string; nakshatra: { index: number; name: string } } | null;
}

const longDate = (d: Date) =>
  `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');

// The Panchang depends on the place; until the viewer picks a city it is New Delhi, and says so.
function placeLine(p: PanchangToday, short = false) {
  const where = p.location.isDefault ? 'New Delhi (default)' : p.location.place ?? 'your location';
  const action = short ? 'Change' : p.location.isDefault ? 'Choose your city' : 'Change city';
  return (
    <>
      {short ? where : `At sunrise in ${where}`} · <Link href="/panchang" className="text-on-navy-2 underline hover:text-on-navy">{action}</Link>
    </>
  );
}

/** Today's Panchang in the navy band (desktop) and the navy header (mobile), per the Direction 3 mockups. */
export function TodayHero({ panchang: p, loading, failed, birth }: Props) {
  const now = new Date();
  const vara = <span lang="hi">{VARA_HI[now.getDay()]}</span>;
  const todayIdx = p ? nakshatraIndex(p.nakshatra.name) : -1;
  const tithi = p ? tithiName(p.tithi.name, p.tithi.number) : '';
  const ringLabel = p
    ? `The 27 nakshatras as a ring. Today's Moon is in ${p.nakshatra.name}${birth ? `; ${birth.chartName}'s birth Moon is in ${birth.nakshatra.name}` : ''}.`
    : 'The 27 nakshatras as a ring.';
  const status = loading ? 'Calculating today’s Panchang…' : failed || !p ? 'Today’s Panchang could not be calculated right now.' : null;

  const limbs = p ? [
    { term: 'Tithi', hi: tithiHi(tithi), sub: tithi === 'Purnima' || tithi === 'Amavasya' ? tithi : `${p.tithi.paksha} Paksha` },
    { term: 'Nakshatra', hi: nakshatraHi(p.nakshatra.name), sub: `lord: ${p.nakshatra.lord}` },
    { term: 'Yoga', hi: yogaHi(p.yoga), sub: p.yoga },
    { term: 'Karana', hi: karanaHi(p.karana), sub: p.karana },
  ] : [];

  return (
    <>
      {/* Desktop: continues the navy band under the navigation. */}
      <section aria-label="Today's Panchang" className="hidden bg-ink text-on-navy md:block" data-testid="today-hero">
        <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-10 pb-11 pt-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <div className="flex flex-col gap-[18px]">
            <p className="font-display text-card-title text-amber">{vara} · {longDate(now)}</p>
            <h1 className="m-0 font-display text-hero font-semibold text-balance" data-testid="today-title">
              {p ? heroTitle(p, 'long') : 'Today'}
            </h1>
            {status && <p className="text-base text-on-navy-3" role="status">{status}</p>}
            {p && (
              <>
                <dl className="m-0 grid grid-cols-4 border-t border-navy-line">
                  {limbs.map((l, i) => (
                    <div key={l.term} className={i === 0 ? 'pr-4 pt-3.5' : 'border-l border-navy-line px-4 pt-3.5'}>
                      <dt className="text-caption text-on-navy-3">{l.term}</dt>
                      <dd lang="hi" className="m-0 font-display text-card-title">{l.hi ?? l.sub}</dd>
                      <dd className="m-0 text-caption text-on-navy-3">{l.sub}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-caption text-on-navy-3">{placeLine(p)}</p>
              </>
            )}
          </div>
          <figure className="m-0 flex flex-col items-center gap-2.5">
            <NakshatraRing today={todayIdx} birth={birth?.nakshatra.index} size="lg" label={ringLabel} />
            <figcaption className="flex flex-wrap justify-center gap-4 text-caption text-on-navy-3">
              <span><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 bg-amber" />Moon today</span>
              {birth && <span><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 border-2 border-amber" />{birth.chartName}&rsquo;s birth Moon · {birth.nakshatra.name}</span>}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Mobile: the navy header carries the Panchang summary and a small ring. */}
      <section aria-label="Today's Panchang" className="flex items-center gap-3.5 bg-ink px-5 pb-5 pt-[18px] text-on-navy md:hidden" data-testid="today-hero-mobile">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-display text-base text-amber">{vara} · {shortDate(now)}</p>
          <h1 className="m-0 font-display text-heading font-semibold leading-[1.2]">{p ? heroTitle(p, 'short') : 'Today'}</h1>
          {status && <p className="text-caption text-on-navy-3" role="status">{status}</p>}
          {p && <p className="text-caption text-on-navy-3">{p.yoga} yoga · {p.karana} karana</p>}
          {p && <p className="truncate text-xs text-on-navy-3">{placeLine(p, true)}</p>}
        </div>
        {p && <NakshatraRing today={todayIdx} birth={birth?.nakshatra.index} size="sm" label={ringLabel} />}
      </section>
    </>
  );
}
