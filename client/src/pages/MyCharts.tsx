import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface Kundli {
  id: string;
  name: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  zodiacSign?: string;
  moonSign?: string;
  ascendant?: string | null;
  timeAccuracy?: 'exact' | 'approximate';
  listStatus?: 'v3' | 'recalculated' | 'limited';
}

export default function MyCharts() {
  const [, setLocation] = useLocation();
  const { data: kundlis = [], isLoading } = useQuery<Kundli[]>({ queryKey: ["/api/kundli"] });
  // The Dasha tab arrives here with ?for=dasha until a chart can be marked as the user's own.
  const forDasha = new URLSearchParams(useSearch()).get("for") === "dasha";

  return (
    <div>
      <PageHeader
        title={forDasha ? "Dasha" : "Kundli"}
        gloss={forDasha ? "दशा" : "कुण्डली"}
        sub={forDasha ? "Choose a chart to see its Vimshottari periods" : "Your saved birth charts"}
        actions={
          <Button className="shrink-0 gap-1" onClick={() => setLocation("/kundli/new")} data-testid="button-generate-new">
            <Plus className="w-4 h-4" /> New chart
          </Button>
        }
      />
      <PageBody>
      {isLoading ? (
        <LoadingSpinner />
      ) : kundlis.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
          <h2 className="m-0 font-display text-card-title font-semibold">No saved charts yet</h2>
          <p className="text-base text-ink-muted">Create a birth chart to see its Kundli, dasha periods and answers from your own chart.</p>
          <Button className="gap-1" onClick={() => setLocation("/kundli/new")} data-testid="button-generate-first">
            <Plus className="h-4 w-4" /> Generate Kundli
          </Button>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 lg:grid-cols-3">
          {kundlis.map((k) => {
            const facts = [k.ascendant && `${k.ascendant} Lagna`, k.moonSign && `${k.moonSign} Moon`, k.zodiacSign && `${k.zodiacSign} Sun`].filter(Boolean).join(' · ');
            return (
              <li key={k.id}>
                <Link href={forDasha ? `/kundli/${k.id}/dasha` : `/kundli/${k.id}`}
                  className="flex h-full flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 text-ink no-underline hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink md:p-[22px]"
                  data-testid={`chart-${k.id}`}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-card-title font-semibold">{k.name}</span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
                  </span>
                  {(k.dateOfBirth || k.placeOfBirth) && (
                    <span className="text-sm tabular-nums text-ink-muted">
                      {[k.dateOfBirth && new Date(k.dateOfBirth).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), k.placeOfBirth].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {facts && <span className="text-sm">{facts}</span>}
                  {k.listStatus !== 'limited' && k.timeAccuracy === 'approximate' && (
                    <span className="text-sm text-amber-text" data-testid={`chart-approx-${k.id}`}>Lagna unknown · approx. time</span>
                  )}
                  {k.listStatus === 'limited' && (
                    <span className="text-sm text-amber-text" data-testid={`chart-limited-${k.id}`}>Older chart · needs birth place</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      </PageBody>
    </div>
  );
}
