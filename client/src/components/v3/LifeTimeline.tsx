import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DOMAIN_LABELS, type TimelinePeriod } from '@shared/v3/evidence';

const year = (iso: string) => iso.slice(0, 4);
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });

function PeriodDetail({ p }: { p: TimelinePeriod }) {
  return (
    <div className="space-y-2 border-t border-border bg-muted/30 px-4 py-3 text-sm">
      <p className="text-foreground">{p.whyItMatters}</p>
      {p.domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.domains.map((d) => (
            <span key={d.domain} title={d.reasons.join('; ')} className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground">
              {DOMAIN_LABELS[d.domain]}
            </span>
          ))}
        </div>
      )}
      {p.supporting.length > 0 && <ul className="space-y-0.5">{p.supporting.map((s) => <li key={s} className="flex gap-1.5 text-xs text-green-700"><Check className="mt-0.5 h-3.5 w-3.5" />{s}</li>)}</ul>}
      {p.conflicting.length > 0 && <ul className="space-y-0.5">{p.conflicting.map((s) => <li key={s} className="flex gap-1.5 text-xs text-red-700"><X className="mt-0.5 h-3.5 w-3.5" />{s}</li>)}</ul>}
      <p className="text-xs text-muted-foreground">{fmt(p.start)} – {fmt(p.end)} · Confidence: {p.confidence}</p>
    </div>
  );
}

/** Life Timeline — Vimshottari periods annotated with what they engage in this chart. */
export function LifeTimeline({ periods }: { periods: TimelinePeriod[] }) {
  const [open, setOpen] = useState<number | null>(periods.findIndex((p) => p.status === 'current'));
  const [openAntar, setOpenAntar] = useState<number | null>(null);
  return (
    <div className="space-y-2" data-testid="life-timeline">
      {periods.map((p, i) => (
        <div key={p.start} className={`overflow-hidden rounded-[10px] border ${p.status === 'current' ? 'border-primary/60' : 'border-border'} ${p.status === 'past' ? 'opacity-80' : ''}`}>
          <button className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/40" onClick={() => setOpen(open === i ? null : i)}>
            <div className="flex items-center gap-3">
              {open === i ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div>
                <div className="text-xs text-muted-foreground">{year(p.start)} ─── {year(p.end)}</div>
                <div className="font-semibold uppercase tracking-wide">{p.lord}</div>
                <div className="text-xs text-muted-foreground">{p.themes.join(' · ')}</div>
              </div>
            </div>
            {p.status === 'current' && <Badge className="bg-nava-navy text-primary">Now</Badge>}
          </button>
          {open === i && (
            <>
              <PeriodDetail p={p} />
              {p.antardashas && (
                <div className="border-t border-border">
                  <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-nava-royal-purple">Sub-periods (Antardasha)</p>
                  {p.antardashas.map((a, j) => (
                    <div key={a.start} className={a.status === 'current' ? 'bg-primary/10' : ''}>
                      <button className="flex w-full items-center justify-between px-4 py-2 text-left text-sm" onClick={() => setOpenAntar(openAntar === j ? null : j)}>
                        <span><span className="font-medium">{p.lord}/{a.lord}</span> <span className="ml-2 text-muted-foreground">{fmt(a.start)} – {fmt(a.end)}</span></span>
                        {a.status === 'current' && <Badge variant="outline" className="text-xs">Active</Badge>}
                      </button>
                      {openAntar === j && <PeriodDetail p={a} />}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">Periods are Vimshottari dashas calculated from your Moon's position at birth. Themes describe what each period's planet engages in your chart; they are tendencies, not certainties.</p>
    </div>
  );
}
