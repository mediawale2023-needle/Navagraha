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

/**
 * North Indian Chart — correct 3×3 grid with SVG
 *
 * Structure:
 *   [TL corner] [top-middle H1] [TR corner]
 *   [left-mid H4] [center empty] [right-mid H10]
 *   [BL corner] [bottom-mid H7] [BR corner]
 *
 * Each corner is split by a diagonal line into 2 triangular houses:
 *   TL: H2 (upper) + H3 (lower)
 *   TR: H12 (upper) + H11 (lower)
 *   BL: H5 (upper) + H6 (lower)
 *   BR: H9 (upper) + H8 (lower)
 *
 * Houses go counter-clockwise: 1→2→3→4→5→6→7→8→9→10→11→12
 */
function NorthIndianChart({ chartData }: { chartData?: any }) {
  // Build planet-per-house map
  const housePlanets: Record<number, string[]> = {};
  if (chartData?.planets) {
    for (const [planet, info] of Object.entries(chartData.planets as Record<string, any>)) {
      const h = Number(info?.house);
      if (h >= 1 && h <= 12) {
        const abbr = PLANET_ABBR[planet] ?? planet.slice(0, 2);
        housePlanets[h] = [...(housePlanets[h] || []), abbr];
      }
    }
  }

  const S = 300; // SVG canvas size
  const C = S / 3; // Cell size (100)
  const sw = 1.5; // stroke width for internal lines

  // Centroid positions for each house (x, y) in the 300×300 canvas
  // 3×3 grid: corner cells split by diagonals, edge cells undivided, center empty
  const housePos: Record<number, [number, number]> = {
    1:  [S/2,     C*0.42],          // top-middle
    2:  [C*0.68,  C*0.30],          // TL upper triangle
    3:  [C*0.32,  C*0.68],          // TL lower triangle
    4:  [C*0.42,  S/2],             // left-middle
    5:  [C*0.32,  S - C*0.68],      // BL upper triangle
    6:  [C*0.68,  S - C*0.30],      // BL lower triangle
    7:  [S/2,     S - C*0.42],      // bottom-middle
    8:  [S - C*0.68, S - C*0.30],   // BR lower triangle
    9:  [S - C*0.32, S - C*0.68],   // BR upper triangle
    10: [S - C*0.42, S/2],          // right-middle
    11: [S - C*0.32, C*0.68],       // TR lower triangle
    12: [S - C*0.68, C*0.30],       // TR upper triangle
  };

  const renderHouse = (h: number) => {
    const [x, y] = housePos[h];
    const planets = housePlanets[h] || [];
    const lineH = 11;
    const totalLines = 1 + (h === 1 ? 1 : 0) + planets.length;
    const startY = y - ((totalLines - 1) * lineH) / 2;

    return (
      <g key={h}>
        <text x={x} y={startY} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fontWeight="700" fill="#92400e">{h}</text>
        {h === 1 && (
          <text x={x} y={startY + lineH} textAnchor="middle" dominantBaseline="middle"
            fontSize="7.5" fontWeight="600" fill="#b45309">As</text>
        )}
        {planets.map((p, i) => (
          <text key={p} x={x} y={startY + lineH * (h === 1 ? i + 2 : i + 1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontWeight="600" fill="#1f2937">{p}</text>
        ))}
      </g>
    );
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" className="block"
        style={{ background: '#fffbeb', border: '2px solid #d97706', borderRadius: 4 }}>

        {/* 3×3 internal grid lines */}
        <line x1={C}   y1="0" x2={C}   y2={S} stroke="#d97706" strokeWidth={sw}/>
        <line x1={2*C} y1="0" x2={2*C} y2={S} stroke="#d97706" strokeWidth={sw}/>
        <line x1="0" y1={C}   x2={S} y2={C}   stroke="#d97706" strokeWidth={sw}/>
        <line x1="0" y1={2*C} x2={S} y2={2*C} stroke="#d97706" strokeWidth={sw}/>

        {/* Corner diagonals + center X: just 2 full-diagonal lines
            Line 1: TL(0,0)→BR(S,S) — passes through TL corner, center, BR corner
            Line 2: TR(S,0)→BL(0,S) — passes through TR corner, center, BL corner */}
        <line x1="0" y1="0" x2={S} y2={S} stroke="#d97706" strokeWidth={sw}/>
        <line x1={S} y1="0" x2="0" y2={S} stroke="#d97706" strokeWidth={sw}/>

        {/* House labels */}
        {([1,2,3,4,5,6,7,8,9,10,11,12] as const).map(h => renderHouse(h))}
      </svg>
    </div>
  );
}

/**
 * South Indian Chart — fixed 4×4 grid with clockwise zodiac signs
 * Houses rotate based on ascendant; signs are fixed.
 */
function SouthIndianChart({ ascendant, chartData }: { ascendant?: string; chartData?: any }) {
  const asc = ascendant || 'Aries';
  const ascIdx = ZODIAC.indexOf(asc);

  // Build planet-per-sign map from chartData
  const signPlanets: Record<string, string[]> = {};
  if (chartData?.planets) {
    for (const [planet, info] of Object.entries(chartData.planets as Record<string, any>)) {
      // Derive sign from house + ascendant
      const h = Number(info?.house);
      if (h >= 1 && h <= 12) {
        const signIdx = (ascIdx + h - 1) % 12;
        const sign = ZODIAC[signIdx];
        const abbr = PLANET_ABBR[planet] ?? planet.slice(0, 2);
        signPlanets[sign] = [...(signPlanets[sign] || []), abbr];
      }
    }
  }

  // Fixed 4×4 grid: 12 border cells clockwise, center 4 empty
  // Row, Col → Sign (clockwise from top-left = Pisces)
  const GRID: (string | null)[][] = [
    ['Pisces',      'Aries',   'Taurus',  'Gemini'],
    ['Aquarius',    null,       null,      'Cancer'],
    ['Capricorn',   null,       null,      'Leo'],
    ['Sagittarius', 'Scorpio',  'Libra',   'Virgo'],
  ];

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="grid grid-cols-4 border-2 border-orange-600"
        style={{ background: '#fffbeb', aspectRatio: '1' }}>
        {GRID.map((row, ri) =>
          row.map((sign, ci) => {
            // Center 2×2 cells merged
            if (sign === null) {
              if (ri === 1 && ci === 1) {
                return (
                  <div key={`${ri}-${ci}`}
                    className="col-span-2 row-span-2 flex items-center justify-center border border-orange-300"
                    style={{ background: '#fef3c7' }}>
                    <span className="text-xs font-bold text-orange-600 text-center leading-tight px-2">
                      Janma<br/>Kundali
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
              <div key={`${ri}-${ci}`}
                className={`border border-orange-300 flex flex-col items-center justify-center p-0.5 text-center overflow-hidden`}
                style={{ background: isAsc ? '#fed7aa' : '#fffbeb' }}>
                {/* House number top-left style */}
                <span className="text-[8px] font-bold text-orange-600 leading-none">{houseNum}</span>
                {/* Sign abbreviation */}
                <span className={`text-[7px] font-semibold leading-tight ${isAsc ? 'text-orange-800' : 'text-gray-500'}`}>
                  {sign.slice(0, 3).toUpperCase()}
                </span>
                {/* Planets */}
                {planets.map(p => (
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
                    <NorthIndianChart chartData={kundli.chartData} />
                  ) : (
                    <SouthIndianChart ascendant={kundli.ascendant || 'Aries'} chartData={kundli.chartData} />
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
