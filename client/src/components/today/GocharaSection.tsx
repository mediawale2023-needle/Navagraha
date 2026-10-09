import { Link } from 'wouter';
import { gocharaCells, gocharaSentence, type GocharaReading } from '@/lib/today';

interface Props {
  chartName: string | null;
  chartId: string | null;
  moonSign: string | null;
  reading: GocharaReading | undefined;
  loading: boolean;
  failed: boolean;
  /** The chart exists but its birth time leaves the Moon's sign open. */
  moonUncertain: boolean;
}

function Sentence({ reading, form }: { reading: GocharaReading; form: 'long' | 'short' }) {
  return <>{gocharaSentence(reading, form).map((s, i) => (s.bold ? <b key={i}>{s.text}</b> : <span key={i}>{s.text}</span>))}</>;
}

/** Today's transits in the twelve houses from the natal Moon (Direction 3 Gochara strip). */
export function GocharaSection({ chartName, chartId, moonSign, reading, loading, failed, moonUncertain }: Props) {
  const title = chartName ? `Gochara for ${chartName}` : 'Gochara';
  let state: string | null = null;
  if (!chartName) state = 'Create a Kundli to see today’s transits counted from its Moon.';
  else if (moonUncertain) state = `With ${chartName}’s approximate birth time the Moon could be in either of two signs, so houses from the Moon can’t be counted.`;
  else if (loading) state = 'Reading today’s transits…';
  else if (failed || !reading || !moonSign) state = 'Today’s transits could not be calculated right now.';
  const cells = reading && moonSign ? gocharaCells(moonSign, reading) : [];

  return (
    <section aria-labelledby="today-gochara" className="flex flex-col gap-2 md:gap-3.5" data-testid="today-gochara">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="today-gochara" className="m-0 font-display text-card-title font-semibold md:text-section">
          {title} <span lang="hi" className="hidden text-lg font-normal text-ink-muted md:inline">गोचर</span>
          <span className="font-normal text-nav text-ink-muted md:hidden"> from the Moon</span>
        </h2>
        {cells.length > 0 && (
          <p className="hidden text-sm text-ink-muted md:block">
            Houses counted from {chartName}&rsquo;s {moonSign} Moon · <b className="text-ink">filled</b> supportive · <span className="underline">outlined</span> demanding
          </p>
        )}
      </div>

      {state ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-[22px]" role="status">
          <p className="text-base text-ink">{state}</p>
          {!chartName && <Link href="/kundli/new" className="inline-flex min-h-11 items-center rounded-sm bg-amber px-[18px] font-semibold text-ink">Create a Kundli</Link>}
          {moonUncertain && chartId && <Link href={`/kundli/${chartId}`} className="text-sm font-semibold underline">Open the chart</Link>}
        </div>
      ) : (
        <>
          {/* Desktop: one row of twelve houses. */}
          <ol className="m-0 hidden list-none grid-cols-12 overflow-hidden rounded-lg border border-line bg-surface p-0 md:grid" aria-label="Houses from the Moon">
            {cells.map((c) => (
              <li key={c.house} className={`flex min-h-[120px] flex-col gap-1.5 px-2 py-3 ${c.house > 1 ? 'border-l border-hairline' : ''} ${c.moonHere ? 'bg-highlight' : ''}`}>
                <span className="text-xs text-ink-muted">{c.house} · {c.sign}</span>
                {c.grahas.map((g) => (
                  <span key={g.planet} title={`${g.planet}: ${g.favourable ? 'supportive' : 'demanding'}`}
                    className={`self-start rounded-chip text-caption ${g.favourable ? 'bg-ink px-1.5 py-0.5 text-on-navy' : 'border-[1.5px] border-ink px-[5px] py-px text-ink'}`}>
                    {g.short}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          {/* Mobile: four by three. */}
          <ol className="m-0 grid list-none grid-cols-4 overflow-hidden rounded-md border border-line bg-surface p-0 text-xs md:hidden" aria-label="Houses from the Moon">
            {cells.map((c, i) => (
              <li key={c.house} className={`min-h-14 p-1.5 text-ink-muted ${i % 4 < 3 ? 'border-r border-hairline' : ''} ${i < 8 ? 'border-b border-hairline' : ''} ${c.moonHere ? 'bg-highlight' : ''}`}>
                {c.house}
                {c.grahas.map((g) => (
                  <span key={g.planet}>
                    {' '}
                    {g.favourable
                      ? <b className="rounded-xs bg-ink px-1 font-medium text-on-navy" title={`${g.planet}: supportive`}>{g.abbr}</b>
                      : <span className="rounded-xs border border-ink px-[3px] text-ink" title={`${g.planet}: demanding`}>{g.abbr}</span>}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          <p className="text-caption text-ink-muted md:hidden">Filled: supportive · outlined: demanding</p>
          {reading && (
            <>
              <p className="hidden text-base md:block" data-testid="gochara-sentence"><Sentence reading={reading} form="long" /></p>
              <p className="text-nav md:hidden"><Sentence reading={reading} form="short" /></p>
            </>
          )}
        </>
      )}
    </section>
  );
}
