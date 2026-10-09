import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Plus, Sparkles, ChevronRight, Calendar, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
        <Card className="yantra-card">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[8px] bg-primary/20">
              <Sparkles className="w-7 h-7 text-amber-text" />
            </div>
            <p className="font-semibold text-foreground">No saved charts yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Generate your first birth chart to unlock readings, reports and AI guidance.
            </p>
            <Button
              className="gap-1 rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setLocation("/kundli/new")}
              data-testid="button-generate-first"
            >
              <Plus className="w-4 h-4" /> Generate Kundli
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {kundlis.map((k) => (
            <Link key={k.id} href={forDasha ? `/kundli/${k.id}/dasha` : `/kundli/${k.id}`}>
              <Card className="yantra-card cursor-pointer transition-shadow" data-testid={`chart-${k.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg text-foreground">{k.name}</p>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
                  </div>
                  {(k.dateOfBirth || k.placeOfBirth) && (
                    <div className="mt-1 space-y-0.5">
                      {k.dateOfBirth && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(k.dateOfBirth).toLocaleDateString()}
                        </p>
                      )}
                      {k.placeOfBirth && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {k.placeOfBirth}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {k.zodiacSign && <Badge className="border-0 bg-primary/15 text-amber-text text-xs">Sun: {k.zodiacSign}</Badge>}
                    {k.moonSign && <Badge className="border-0 bg-positive/10 text-positive text-xs">Moon: {k.moonSign}</Badge>}
                    {k.ascendant && <Badge className="border-0 bg-highlight text-amber-text text-xs">Asc: {k.ascendant}</Badge>}
                    {k.listStatus !== 'limited' && k.timeAccuracy === 'approximate' && (
                      <Badge className="border-0 bg-muted text-muted-foreground text-xs" data-testid={`chart-approx-${k.id}`}>Lagna unknown · approx. time</Badge>
                    )}
                    {k.listStatus === 'limited' && (
                      <Badge className="border-0 bg-highlight text-amber-text text-xs" data-testid={`chart-limited-${k.id}`}>Older chart · needs birth place</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      </PageBody>
    </div>
  );
}
