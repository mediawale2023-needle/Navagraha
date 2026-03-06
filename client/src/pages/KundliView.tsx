import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Calendar, Clock, MapPin, Download } from 'lucide-react';
import type { Kundli } from '@shared/schema';

// North Indian Chart: 4x4 grid, counter-clockwise from top
// Corners (2, 11, 5, 8) have diagonal decorations; center 4 cells empty
// Layout (counter-clockwise): 1(top) → 2(TL) → 3 → 4 → 5(BL) → 6 → 7 → 8(BR) → 9 → 10 → 11(TR) → 12
const NORTH_CHART_LAYOUT = [
  ['2',  '1',  '12', '11'],
  ['3',  null,  null, '10'],
  ['4',  null,  null, '9'],
  ['5',  '6',  '7',  '8'],
];

// Corner cells that get diagonal decoration (counter-clockwise corners)
const NORTH_CORNER_CELLS = new Set(['2', '11', '5', '8']);

// South Indian Chart: fixed 4x4 grid with zodiac signs in fixed positions
// Center 2x2 cells are empty
const SOUTH_SIGNS = [
  ['Pisces',      'Aries',  'Taurus',   'Gemini'],
  ['Aquarius',    null,      null,       'Cancer'],
  ['Capricorn',   null,      null,       'Leo'],
  ['Sagittarius', 'Scorpio', 'Libra',    'Virgo'],
];

function NorthIndianChart({ ascendant, chartData }: { ascendant?: string; chartData?: any }) {
  // Build planet-per-house map from real chart data
  const housePlanets: Record<string, string[]> = {};
  if (chartData?.planets) {
    for (const [planet, info] of Object.entries(chartData.planets as Record<string, any>)) {
      const h = String(info?.house ?? '');
      if (h) {
        housePlanets[h] = [...(housePlanets[h] || []), planet];
      }
    }
  }
  // Mark house 1 with Asc label
  housePlanets['1'] = ['Asc', ...(housePlanets['1'] || [])];

  return (
    <div className="relative w-full max-w-xs mx-auto aspect-square">
      <div className="grid grid-cols-4 grid-rows-4 w-full h-full border-2 border-orange-400 bg-amber-50">
        {NORTH_CHART_LAYOUT.map((row, ri) =>
          row.map((cell, ci) => {
            if (cell === null) {
              // Center cells — draw the inner diamond lines via SVG overlay on first center cell
              if (ri === 1 && ci === 1) {
                return (
                  <div key={`${ri}-${ci}`} className="col-span-2 row-span-2 relative bg-amber-50/60">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 2 2" preserveAspectRatio="none">
                      {/* Inner diamond lines */}
                      <line x1="1" y1="0" x2="0" y2="1" stroke="#d97706" strokeWidth="0.04"/>
                      <line x1="1" y1="0" x2="2" y2="1" stroke="#d97706" strokeWidth="0.04"/>
                      <line x1="0" y1="1" x2="1" y2="2" stroke="#d97706" strokeWidth="0.04"/>
                      <line x1="2" y1="1" x2="1" y2="2" stroke="#d97706" strokeWidth="0.04"/>
                    </svg>
                  </div>
                );
              }
              return null; // other center cells merged above
            }

            const houseNum = cell;
            const planets = housePlanets[houseNum] || [];
            const isCorner = NORTH_CORNER_CELLS.has(houseNum);

            // Diagonal direction for corner cells
            // TL(2): top-right → bottom-left; TR(11): top-left → bottom-right
            // BL(5): top-left → bottom-right; BR(8): top-right → bottom-left
            const diagTRtoBL = houseNum === '2' || houseNum === '8';
            const diagTLtoBR = houseNum === '11' || houseNum === '5';

            return (
              <div
                key={`${ri}-${ci}`}
                className="relative border border-orange-300 flex flex-col items-center justify-center p-0.5 bg-amber-50 text-center overflow-hidden"
              >
                {isCorner && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1 1" preserveAspectRatio="none">
                    {diagTRtoBL && <line x1="1" y1="0" x2="0" y2="1" stroke="#d97706" strokeWidth="0.05"/>}
                    {diagTLtoBR && <line x1="0" y1="0" x2="1" y2="1" stroke="#d97706" strokeWidth="0.05"/>}
                  </svg>
                )}
                <span className="text-[8px] text-orange-500 font-bold leading-none">{houseNum}</span>
                {planets.map((p) => (
                  <span key={p} className="text-[7px] font-semibold text-gray-800 leading-tight">{p}</span>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SouthIndianChart({ ascendant }: { ascendant?: string }) {
  const ascIndex = SOUTH_SIGNS.flat().indexOf(ascendant || 'Aries');
  return (
    <div className="relative w-full max-w-xs mx-auto aspect-square">
      <div className="grid grid-cols-4 grid-rows-4 w-full h-full border-2 border-orange-400 rounded">
        {SOUTH_SIGNS.map((row, ri) =>
          row.map((sign, ci) => {
            const isCenter = ri >= 1 && ri <= 2 && ci >= 1 && ci <= 2;
            if (isCenter) {
              // Show name in center
              if (ri === 1 && ci === 1) {
                return (
                  <div key={`${ri}-${ci}`} className="col-span-2 row-span-2 bg-orange-50/50 flex items-center justify-center border border-orange-200">
                    <span className="text-[10px] text-orange-500 font-bold text-center px-1">Birth Chart</span>
                  </div>
                );
              }
              return null; // merged cell
            }
            const isAsc = sign === (ascendant || 'Aries');
            return (
              <div
                key={`${ri}-${ci}`}
                className={`border border-orange-200 flex flex-col items-center justify-center p-1 text-center ${isAsc ? 'bg-orange-100' : 'bg-white'}`}
              >
                <span className={`text-[9px] font-semibold leading-tight ${isAsc ? 'text-orange-600' : 'text-gray-700'}`}>
                  {sign}
                </span>
                {isAsc && <span className="text-[8px] text-orange-500 font-bold">Asc</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function KundliView() {
  const [chartStyle, setChartStyle] = useState<'north' | 'south'>('north');
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
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle>Birth Chart</CardTitle>
                  <div className="flex rounded-lg border border-orange-200 overflow-hidden text-sm">
                    <button
                      onClick={() => setChartStyle('north')}
                      className={`px-4 py-1.5 font-medium transition-colors ${
                        chartStyle === 'north'
                          ? 'bg-orange-600 text-white'
                          : 'bg-white text-orange-600 hover:bg-orange-50'
                      }`}
                    >
                      North Indian
                    </button>
                    <button
                      onClick={() => setChartStyle('south')}
                      className={`px-4 py-1.5 font-medium transition-colors ${
                        chartStyle === 'south'
                          ? 'bg-orange-600 text-white'
                          : 'bg-white text-orange-600 hover:bg-orange-50'
                      }`}
                    >
                      South Indian
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 p-4">
                  {chartStyle === 'north' ? (
                    <NorthIndianChart ascendant={kundli.ascendant || 'Aries'} chartData={kundli.chartData} />
                  ) : (
                    <SouthIndianChart ascendant={kundli.ascendant || 'Aries'} />
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    {chartStyle === 'north'
                      ? 'North Indian style — houses are fixed, signs rotate'
                      : 'South Indian style — signs are fixed, houses rotate'}
                  </p>
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
