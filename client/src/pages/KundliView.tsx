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

// Planet abbreviation map
const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me',
  Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
};

// Zodiac signs in order (for South Indian chart house calculation)
const ZODIAC = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

// ─── North Indian Chart ──────────────────────────────────────────────────────
// 4×4 CSS grid — houses arranged counter-clockwise, corners have diagonals
//   Row 0: [H2]  [H1]  [H12] [H11]
//   Row 1: [H3]  [ctr] [ctr] [H10]
//   Row 2: [H4]  [ctr] [ctr] [H9 ]
//   Row 3: [H5]  [H6]  [H7]  [H8 ]
// Corner cells H2(TL) and H8(BR) → TL-to-BR diagonal (\)
// Corner cells H11(TR) and H5(BL) → TR-to-BL diagonal (/)

const NORTH_LAYOUT: (string | null)[][] = [
  ['2',  '1',  '12', '11'],
  ['3',  null,  null, '10'],
  ['4',  null,  null, '9'],
  ['5',  '6',  '7',  '8'],
];
const CORNER_HOUSES = new Set(['2', '11', '5', '8']);

function NorthIndianChart({ chartData }: { chartData?: any }) {
  // Build planet-per-house map from planetaryPositions array
  const housePlanets: Record<number, string[]> = {};
  if (chartData?.planetaryPositions) {
    for (const pos of chartData.planetaryPositions as Array<{ planet: string; house: number }>) {
      if (pos.planet === 'Ascendant') continue;
      const h = pos.house;
      if (h >= 1 && h <= 12) {
        const abbr = PLANET_ABBR[pos.planet] ?? pos.planet.slice(0, 2);
        housePlanets[h] = [...(housePlanets[h] || []), abbr];
      }
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div
        className="grid grid-cols-4 border-2 border-amber-700"
        style={{ background: '#fffbeb', aspectRatio: '1' }}
      >
        {NORTH_LAYOUT.map((row, ri) =>
          row.map((houseNum, ci) => {
            // Null = part of merged center
            if (houseNum === null) {
              // Only the top-left null cell renders the merged 2×2 center
              if (ri === 1 && ci === 1) {
                return (
                  <div
                    key="center"
                    className="col-span-2 row-span-2 relative border border-amber-600 flex items-center justify-center"
                    style={{ background: '#fef3c7' }}
                  >
                    {/* X lines spanning the merged center */}
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <line x1="0" y1="0" x2="100" y2="100" stroke="#d97706" strokeWidth="1.5" />
                      <line x1="100" y1="0" x2="0" y2="100" stroke="#d97706" strokeWidth="1.5" />
                    </svg>
                  </div>
                );
              }
              return null;
            }

            const h = parseInt(houseNum, 10);
            const planets = housePlanets[h] || [];
            const isCorner = CORNER_HOUSES.has(houseNum);
            // H2(TL) and H8(BR) share the TL→BR diagonal; H11(TR) and H5(BL) share TR→BL
            const diagTLtoBR = houseNum === '2' || houseNum === '8';
            const diagTRtoBL = houseNum === '11' || houseNum === '5';

            return (
              <div
                key={houseNum}
                className="relative border border-amber-600 flex flex-col items-center justify-center overflow-hidden"
                style={{ minHeight: 0, minWidth: 0 }}
              >
                {/* Corner diagonal decoration */}
                {isCorner && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    {diagTLtoBR && (
                      <line x1="0" y1="0" x2="100" y2="100" stroke="#d97706" strokeWidth="1.5" />
                    )}
                    {diagTRtoBL && (
                      <line x1="100" y1="0" x2="0" y2="100" stroke="#d97706" strokeWidth="1.5" />
                    )}
                  </svg>
                )}
                {/* House number */}
                <span className="text-[9px] font-bold text-amber-700 leading-none z-10">{h}</span>
                {/* Ascendant marker */}
                {h === 1 && (
                  <span className="text-[7px] font-semibold text-amber-600 leading-none z-10">As</span>
                )}
                {/* Planet abbreviations */}
                {planets.map((p) => (
                  <span key={p} className="text-[8px] font-bold text-gray-800 leading-none z-10">
                    {p}
                  </span>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── South Indian Chart ──────────────────────────────────────────────────────
// Fixed 4×4 grid with zodiac signs in fixed positions (clockwise from top-left = Pisces)
// House numbers rotate based on ascendant; planets placed in their zodiac sign cell.

const SOUTH_GRID: (string | null)[][] = [
  ['Pisces',      'Aries',   'Taurus',  'Gemini'],
  ['Aquarius',    null,       null,      'Cancer'],
  ['Capricorn',   null,       null,      'Leo'],
  ['Sagittarius', 'Scorpio',  'Libra',   'Virgo'],
];

function SouthIndianChart({ ascendant, chartData }: { ascendant?: string; chartData?: any }) {
  const asc = ascendant || 'Aries';
  const ascIdx = ZODIAC.indexOf(asc) >= 0 ? ZODIAC.indexOf(asc) : 0;

  // Build planet-per-sign map using pos.sign directly from planetaryPositions
  const signPlanets: Record<string, string[]> = {};
  if (chartData?.planetaryPositions) {
    for (const pos of chartData.planetaryPositions as Array<{ planet: string; sign: string }>) {
      if (pos.planet === 'Ascendant') continue;
      const abbr = PLANET_ABBR[pos.planet] ?? pos.planet.slice(0, 2);
      signPlanets[pos.sign] = [...(signPlanets[pos.sign] || []), abbr];
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div
        className="grid grid-cols-4 border-2 border-orange-600"
        style={{ background: '#fffbeb', aspectRatio: '1' }}
      >
        {SOUTH_GRID.map((row, ri) =>
          row.map((sign, ci) => {
            if (sign === null) {
              if (ri === 1 && ci === 1) {
                return (
                  <div
                    key="center"
                    className="col-span-2 row-span-2 flex items-center justify-center border border-orange-300"
                    style={{ background: '#fef3c7' }}
                  >
                    <span className="text-xs font-bold text-orange-600 text-center leading-tight px-2">
                      Janma<br />Kundali
                    </span>
                  </div>
                );
              }
              return null;
            }

            const houseNum = ((ZODIAC.indexOf(sign) - ascIdx + 12) % 12) + 1;
            const isAsc = sign === asc;
            const planets = signPlanets[sign] || [];

            return (
              <div
                key={`${ri}-${ci}`}
                className="border border-orange-300 flex flex-col items-center justify-center p-0.5 text-center overflow-hidden"
                style={{ background: isAsc ? '#fed7aa' : '#fffbeb' }}
              >
                <span className="text-[8px] font-bold text-orange-600 leading-none">{houseNum}</span>
                <span className={`text-[7px] font-semibold leading-tight ${isAsc ? 'text-orange-800' : 'text-gray-500'}`}>
                  {sign.slice(0, 3).toUpperCase()}
                </span>
                {planets.map((p) => (
                  <span key={p} className="text-[8px] font-bold text-gray-800 leading-tight">{p}</span>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export default function KundliView() {
  const [chartStyle, setChartStyle] = useState<'north' | 'south'>('north');
  const [, params] = useRoute('/kundli/:id');
  const kundliId = params?.id;

  const { data: kundli, isLoading } = useQuery<Kundli>({
    queryKey: ['/api/kundli', kundliId],
    enabled: !!kundliId,
  });

  if (isLoading) return <LoadingSpinner />;

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
  const chartData = kundli.chartData as any;
  const dashas = (kundli.dashas as any[]) || [];
  const doshas = (kundli.doshas as any) || {};
  const remedies = (kundli.remedies as any[]) || [];

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

          {/* Overview */}
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
                        <span className="text-muted-foreground">Zodiac Sign (Sun):</span>
                        <span className="font-medium">{kundli.zodiacSign || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Moon Sign:</span>
                        <span className="font-medium">{kundli.moonSign || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ascendant (Lagna):</span>
                        <span className="font-medium">{kundli.ascendant || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gender:</span>
                        <span className="font-medium capitalize">{kundli.gender || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Planetary Positions</h4>
                    <div className="space-y-1 text-sm">
                      {chartData?.planetaryPositions
                        ?.filter((p: any) => p.planet !== 'Ascendant')
                        .map((p: any) => (
                          <div key={p.planet} className="flex justify-between">
                            <span className="text-muted-foreground">{p.planet}:</span>
                            <span className="font-medium">
                              {p.sign} {p.degree}°{p.isRetrograde ? ' (R)' : ''}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Birth Chart */}
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
                    <NorthIndianChart chartData={chartData} />
                  ) : (
                    <SouthIndianChart ascendant={kundli.ascendant || 'Aries'} chartData={chartData} />
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

          {/* Dashas */}
          <TabsContent value="dashas">
            <Card>
              <CardHeader>
                <CardTitle>Vimshottari Dashas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashas.length > 0 ? dashas.map((dasha: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <div className="font-semibold">{dasha.planet} Dasha</div>
                        <div className="text-sm text-muted-foreground">
                          {dasha.startDate} — {dasha.endDate}
                          {dasha.period ? ` (${dasha.period})` : ''}
                        </div>
                      </div>
                      {dasha.status === 'current' && (
                        <Badge variant="default">Current</Badge>
                      )}
                    </div>
                  )) : (
                    <p className="text-muted-foreground text-sm">No dasha data available.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Doshas */}
          <TabsContent value="doshas">
            <Card>
              <CardHeader>
                <CardTitle>Dosha Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {[
                    {
                      key: 'mangalDosha',
                      label: 'Mangal Dosha',
                      present: doshas.mangalDosha,
                      desc: doshas.mangalDosha
                        ? 'Mangal Dosha is present. Consult an astrologer for remedies.'
                        : 'No Mangal Dosha detected in your birth chart.',
                    },
                    {
                      key: 'kaalSarpDosha',
                      label: 'Kaal Sarp Dosha',
                      present: doshas.kaalSarpDosha,
                      desc: doshas.kaalSarpDosha
                        ? 'Kaal Sarp Dosha is present. All planets are between Rahu and Ketu.'
                        : 'Your chart is free from Kaal Sarp Dosha.',
                    },
                    {
                      key: 'pitruDosha',
                      label: 'Pitru Dosha',
                      present: doshas.pitruDosha,
                      desc: doshas.pitruDosha
                        ? 'Pitru Dosha is present. Sun and Rahu are in close conjunction.'
                        : 'No Pitru Dosha detected in your birth chart.',
                    },
                  ].map((dosha) => (
                    <div
                      key={dosha.key}
                      className={`p-4 border rounded-lg ${
                        dosha.present
                          ? 'bg-red-500/10 border-red-500/20'
                          : 'bg-green-500/10 border-green-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{dosha.label}</h4>
                        <Badge
                          variant="secondary"
                          className={dosha.present ? 'bg-red-500/20' : 'bg-green-500/20'}
                        >
                          {dosha.present ? 'Present' : 'Not Present'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{dosha.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Remedies */}
          <TabsContent value="remedies">
            <Card>
              <CardHeader>
                <CardTitle>Astrological Remedies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {remedies.length > 0 ? remedies.map((remedy: any, i: number) => (
                    <div
                      key={i}
                      className="p-4 border rounded-lg bg-amber-500/10 border-amber-500/20"
                    >
                      <h4 className="font-semibold mb-1">{remedy.title}</h4>
                      <p className="text-sm text-muted-foreground">{remedy.description}</p>
                      {remedy.type && (
                        <Badge variant="outline" className="mt-2 text-xs">{remedy.type}</Badge>
                      )}
                    </div>
                  )) : (
                    <p className="text-muted-foreground text-sm">No remedy data available.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
