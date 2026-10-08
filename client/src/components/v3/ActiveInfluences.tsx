import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { ActiveInfluenceCard } from '@/components/ActiveInfluenceCard';
import type { KundliInsights } from '@shared/v3/evidence';
import { monthYear, selectRunningPeriods } from '@/lib/runningPeriods';

const GLYPH: Record<string, string> = { Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿', Jupiter: '♃', Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋' };

type Transits = { sadeSati: { active: boolean; phase: string; note: string; saturnSign: string; untilApprox?: string } };

/** The signed-in user's real current periods and Sade Sati status, from their latest chart. */
export function ActiveInfluences() {
  const { data: kundlis } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ['/api/kundli'] });
  const latest = kundlis?.[0];
  const { data: insights, isError } = useQuery<KundliInsights>({ queryKey: ['/api/kundli', latest?.id, 'insights'], enabled: !!latest });
  const { data: transits } = useQuery<Transits>({ queryKey: ['/api/kundli', latest?.id, 'transits'], enabled: !!latest });

  if (!latest) {
    return (
      <div className="rounded-[12px] border border-border bg-card p-4 text-sm text-muted-foreground">
        Create your Kundli to see the planetary periods actually running in your chart.
        <Link href="/kundli/new" className="ml-1 inline-flex items-center gap-1 font-semibold text-foreground">Create chart <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-[12px] border border-border bg-card p-4 text-sm text-muted-foreground">
        {latest.name}'s chart was made with an older engine and could not be recalculated. Recreate it with the birth place to see its current periods.
        <Link href={`/kundli/${latest.id}`} className="ml-1 inline-flex items-center gap-1 font-semibold text-foreground">Open chart <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    );
  }
  if (!insights) return <div className="rounded-[12px] border border-border bg-card p-4 text-sm text-muted-foreground">Loading your current periods…</div>;

  // An approximate birth time can move the period boundaries: show only what is certain, without dates.
  const { maha, antar, showDates, note } = selectRunningPeriods(insights);
  const approximate = !showDates;
  const link = `/kundli/${latest.id}`;
  return (
    <>
      {maha && (
        <ActiveInfluenceCard
          icon={GLYPH[maha.lord]}
          title={`${maha.lord} Mahadasha`}
          description={`${maha.themes.slice(0, 2).join(', ')}. ${maha.whyItMatters}`}
          type="dasha"
          severity="low"
          endDate={approximate ? undefined : monthYear(maha.end)}
          linkTo={link}
        />
      )}
      {antar && (
        <ActiveInfluenceCard
          icon={GLYPH[antar.lord]}
          title={`${maha!.lord} / ${antar.lord} Antardasha`}
          description={antar.whyItMatters}
          type="dasha"
          severity="low"
          endDate={approximate ? undefined : monthYear(antar.end)}
          linkTo={link}
        />
      )}
      {transits?.sadeSati.active && (
        <ActiveInfluenceCard
          icon="♄"
          title={`Sade Sati — ${transits.sadeSati.phase.split(' — ')[0]}`}
          description={`Saturn is transiting ${transits.sadeSati.saturnSign}, near your natal Moon. Traditionally read as a period of responsibility and steady effort.`}
          type="transit"
          severity="low"
          endDate={transits.sadeSati.untilApprox}
          linkTo={link}
        />
      )}
      {note && <p className="text-[11px] text-amber-700" data-testid="active-influences-timing-note">{note}</p>}
      <p className="text-[11px] text-muted-foreground">From {latest.name}'s chart. Jyotish describes tendencies, not certainties.</p>
    </>
  );
}
