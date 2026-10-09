import { ChevronRight } from 'lucide-react';
import type { DomainResolution } from '@shared/v3/evidence';
import { VerdictBadge } from '@/components/v3/verdict';

/** "Your Chart at a Glance" — one card per life area, each opening its evidence. */
export function ChartGlance({ domains, onWhy }: { domains: DomainResolution[]; onWhy: (d: DomainResolution) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="chart-glance">
      {domains.map((d) => (
        <button
          key={d.domain}
          onClick={() => onWhy(d)}
          className="group rounded-[10px] border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          data-testid={`glance-${d.domain}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-base text-foreground">{d.label}</span>
            <span className="text-xs text-muted-foreground">{d.confidence} confidence</span>
          </div>
          <VerdictBadge verdict={d.verdict} />
          <p className="mt-2 text-xs text-muted-foreground">
            {d.supporting.length} supporting · {d.conflicting.length} conflicting
            {d.excluded.length > 0 ? ` · ${d.excluded.length} not used` : ''}
          </p>
          <span className="mt-2 inline-flex items-center text-xs font-medium text-[var(--primary-border)] group-hover:underline">
            Why <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
          </span>
        </button>
      ))}
    </div>
  );
}
