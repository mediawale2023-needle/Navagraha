import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Calendar, Clock, MapPin, Download } from 'lucide-react';
import type { Kundli } from '@shared/schema';

export default function KundliView() {
  const [, params] = useRoute('/kundli/:id');
  const kundliId = params?.id;

  const { data: kundli, isLoading } = useQuery<Kundli>({
    queryKey: ['/api/kundli', kundliId],
    enabled: !!kundliId,
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!kundli) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Kundli not found</p>
          <Link href="/"><Button>Go Home</Button></Link>
        </div>
      </div>
    );
  }

  const birthDate = new Date(kundli.dateOfBirth);

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <Link href="/">
            <Button variant="ghost" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <Button variant="outline" data-testid="button-download">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>

        {/* Header Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="font-serif text-3xl mb-2">{kundli.name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{birthDate.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{kundli.timeOfBirth}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{kundli.placeOfBirth}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" data-testid="badge-zodiac">
                  {kundli.zodiacSign || 'Aries'}
                </Badge>
                <Badge variant="secondary" data-testid="badge-moon">
                  Moon: {kundli.moonSign || 'Taurus'}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="chart" data-testid="tab-chart">Birth Chart</TabsTrigger>
            <TabsTrigger value="dashas" data-testid="tab-dashas">Dashas</TabsTrigger>
            <TabsTrigger value="doshas" data-testid="tab-doshas">Doshas</TabsTrigger>
            <TabsTrigger value="remedies" data-testid="tab-remedies">Remedies</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Astrological Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2">Basic Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Zodiac Sign:</span>
                        <span className="font-medium">{kundli.zodiacSign || 'Aries'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Moon Sign:</span>
                        <span className="font-medium">{kundli.moonSign || 'Taurus'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ascendant:</span>
                        <span className="font-medium">{kundli.ascendant || 'Gemini'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gender:</span>
                        <span className="font-medium capitalize">{kundli.gender || 'Male'}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Planetary Strength</h4>
                    <div className="space-y-3">
                      {['Sun', 'Moon', 'Mars', 'Mercury'].map((planet) => (
                        <div key={planet}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{planet}</span>
                            <span className="text-muted-foreground">Strong</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.random() * 40 + 60}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chart">
            <Card>
              <CardHeader>
                <CardTitle>North Indian Birth Chart</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-8">
                  <div className="relative w-full max-w-md aspect-square border-2 border-primary rounded-lg">
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className={`border border-muted flex items-center justify-center text-sm p-2 ${
                          i === 4 ? 'bg-primary/10' : ''
                        }`}>
                          <div className="text-center">
                            <div className="font-semibold text-xs text-muted-foreground mb-1">
                              House {i + 1}
                            </div>
                            <div className="text-xs text-foreground">
                              {i === 0 && 'Sun, Mars'}
                              {i === 2 && 'Moon'}
                              {i === 4 && 'Asc'}
                              {i === 6 && 'Jupiter'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dashas">
            <Card>
              <CardHeader>
                <CardTitle>Vimshottari Dashas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { planet: 'Sun', period: '2020-2026', status: 'current' },
                    { planet: 'Moon', period: '2026-2036', status: 'upcoming' },
                    { planet: 'Mars', period: '2036-2043', status: 'upcoming' },
                  ].map((dasha, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <div className="font-semibold">{dasha.planet} Dasha</div>
                        <div className="text-sm text-muted-foreground">{dasha.period}</div>
                      </div>
                      {dasha.status === 'current' && (
                        <Badge variant="default">Current</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="doshas">
            <Card>
              <CardHeader>
                <CardTitle>Dosha Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">Mangal Dosha</h4>
                      <Badge variant="secondary" className="bg-green-500/20">Not Present</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No Mangal Dosha detected in your birth chart.
                    </p>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">Kaal Sarp Dosha</h4>
                      <Badge variant="secondary">Not Present</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your chart is free from Kaal Sarp Dosha.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="remedies">
            <Card>
              <CardHeader>
                <CardTitle>Astrological Remedies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { title: 'Gemstone Recommendation', desc: 'Wear Ruby for Sun strength', color: 'bg-red-500/10 border-red-500/20' },
                    { title: 'Mantra', desc: 'Chant "Om Suryaya Namaha" 108 times daily', color: 'bg-yellow-500/10 border-yellow-500/20' },
                    { title: 'Charity', desc: 'Donate wheat on Sundays', color: 'bg-blue-500/10 border-blue-500/20' },
                    { title: 'Fasting', desc: 'Fast on Sundays for better results', color: 'bg-green-500/10 border-green-500/20' },
                  ].map((remedy, i) => (
                    <div key={i} className={`p-4 border rounded-lg ${remedy.color}`}>
                      <h4 className="font-semibold mb-1">{remedy.title}</h4>
                      <p className="text-sm text-muted-foreground">{remedy.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
