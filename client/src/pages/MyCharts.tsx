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
    <div className="min-h-screen bg-background px-4 md:px-8 lg:px-12 py-6 w-full max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-1.5 rounded-lg hover:bg-muted" data-testid="button-back">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">My Charts</h1>
            <p className="text-sm text-muted-foreground">Your saved birth charts</p>
          </div>
        </div>
        <Button
          className="bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white rounded-full gap-1 shrink-0"
          onClick={() => setLocation("/kundli/new")}
          data-testid="button-generate-new"
        >
          <Plus className="w-4 h-4" /> New
        </Button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : kundlis.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-nava-lavender/60 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-nava-royal-purple" />
            </div>
            <p className="font-semibold text-foreground">No saved charts yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Generate your first birth chart to unlock readings, reports and AI guidance.
            </p>
            <Button
              className="bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white rounded-full gap-1"
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
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer" data-testid={`chart-${k.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{k.name}</p>
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
                    {k.zodiacSign && <Badge className="bg-nava-amber/10 text-nava-amber border-0 text-xs">Sun: {k.zodiacSign}</Badge>}
                    {k.moonSign && <Badge className="bg-nava-teal/10 text-nava-teal border-0 text-xs">Moon: {k.moonSign}</Badge>}
                    {k.ascendant && <Badge className="bg-nava-magenta/10 text-nava-magenta border-0 text-xs">Asc: {k.ascendant}</Badge>}
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
