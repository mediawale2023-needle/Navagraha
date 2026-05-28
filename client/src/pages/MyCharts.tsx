import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Plus, Sparkles, ChevronRight, Calendar, MapPin } from "lucide-react";
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
  ascendant?: string;
}

export default function MyCharts() {
  const [, setLocation] = useLocation();
  const { data: kundlis = [], isLoading } = useQuery<Kundli[]>({ queryKey: ["/api/kundli"] });

  return (
    <div className="yantra-shell min-h-screen w-full max-w-7xl px-4 py-6 pb-24 md:px-8 md:pb-8 lg:px-12 mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          </Link>
          <div>
            <h1 className="font-display text-2xl text-foreground">My Charts</h1>
            <p className="text-sm text-muted-foreground">Your saved birth charts</p>
          </div>
        </div>
        <Button
          className="shrink-0 gap-1 rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setLocation("/kundli/new")}
          data-testid="button-generate-new"
        >
          <Plus className="w-4 h-4" /> New
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : kundlis.length === 0 ? (
        <Card className="yantra-card">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[8px] bg-primary/20">
              <Sparkles className="w-7 h-7 text-[var(--primary-border)]" />
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
            <Link key={k.id} href={`/kundli/${k.id}`}>
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
                    {k.zodiacSign && <Badge className="border-0 bg-primary/15 text-[var(--primary-border)] text-xs">Sun: {k.zodiacSign}</Badge>}
                    {k.moonSign && <Badge className="border-0 bg-nava-teal/10 text-nava-teal text-xs">Moon: {k.moonSign}</Badge>}
                    {k.ascendant && <Badge className="border-0 bg-nava-magenta/10 text-nava-magenta text-xs">Asc: {k.ascendant}</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
