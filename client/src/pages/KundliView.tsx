import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Calendar, Clock, MapPin, Download, ChevronDown, ChevronRight } from 'lucide-react';
import type { Kundli } from '@shared/schema';

// Planet abbreviation map
const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me',
  Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
};

// Zodiac signs in order (for South Indian chart house calculation)
const ZODIAC = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

// Zodiac sign → number (1=Aries, 12=Pisces)
const SIGN_NUM: Record<string, number> = {};
ZODIAC.forEach((s, i) => { SIGN_NUM[s] = i + 1; });

// Planet display colors (matching astrotalk.com conventions)
const PLANET_COLORS: Record<string, string> = {
  Su: '#d97706', Mo: '#1a202c', Ma: '#c53030', Me: '#2f855a',
  Ju: '#b7791f', Ve: '#d53f8c', Sa: '#1a202c', Ra: '#4a5568', Ke: '#4a5568',
  Asc: '#c53030',
};

// ─── North Indian Chart (Astrotalk.com style) ────────────────────────────────
// SVG diamond pattern: outer square, inner diamond from midpoints, 12 houses
//
// House layout (counter-clockwise from top-center):
//   1  = top-center diamond (Ascendant / Lagna)
//   2  = upper-left triangle
//   3  = left-upper triangle
//   4  = left-center diamond
//   5  = left-lower triangle
//   6  = bottom-left triangle
//   7  = bottom-center diamond
//   8  = bottom-right triangle
//   9  = right-lower triangle
//   10 = right-center diamond
//   11 = right-upper triangle
//   12 = top-right triangle

// Refined text positions for each house (avoid overlaps)
// rx,ry = rashi number position (inner corner/tip); px,py = planet list center position (outer body)
const HOUSE_TEXT: Record<number, { rx: number; ry: number; px: number; py: number }> = {
  1: { rx: 200, ry: 175, px: 200, py: 80 },   // top center diamond
  2: { rx: 110, ry: 85, px: 100, py: 45 },   // upper left triangle
  3: { rx: 75, ry: 120, px: 45, py: 100 },   // left upper triangle
  4: { rx: 160, ry: 205, px: 85, py: 200 },   // left center diamond
  5: { rx: 75, ry: 290, px: 45, py: 310 },   // left lower triangle
  6: { rx: 110, ry: 335, px: 100, py: 365 },   // bottom left triangle
  7: { rx: 200, ry: 235, px: 200, py: 330 },   // bottom center diamond
  8: { rx: 290, ry: 335, px: 300, py: 365 },   // bottom right triangle
  9: { rx: 325, ry: 290, px: 355, py: 310 },   // right lower triangle
  10: { rx: 240, ry: 205, px: 315, py: 200 },   // right center diamond
  11: { rx: 325, ry: 120, px: 355, py: 100 },   // right upper triangle
  12: { rx: 290, ry: 85, px: 300, py: 45 },   // top right triangle
};

interface PlanetPos {
  planet: string;
  sign: string;
  degree: number;
  house: number;
  isRetrograde: boolean;
}

function NorthIndianChart({ chartData }: { chartData?: any }) {
  // Build per-house data
  const housePlanets: Record<number, PlanetPos[]> = {};
  const houseSign: Record<number, string> = {};

  if (chartData?.planetaryPositions) {
    for (const pos of chartData.planetaryPositions as PlanetPos[]) {
      const h = pos.house;
      if (h >= 1 && h <= 12) {
        if (pos.planet === 'Ascendant') {
          // Ascendant tells us the sign of house 1
          houseSign[1] = pos.sign;
          // Add Ascendant to the house 1 list so it stacks nicely with planets
          housePlanets[1] = [...(housePlanets[1] || []), pos];
        } else {
          housePlanets[h] = [...(housePlanets[h] || []), pos];
        }
      }
    }
  }

  // Fill sign for each house based on ascendant (whole-sign system)
  if (chartData?.houses) {
    for (const h of chartData.houses as Array<{ house: number; sign: string }>) {
      houseSign[h.house] = h.sign;
    }
  }

  const S = 400; // viewBox size
  const M = S / 2; // midpoint = 200

  return (
    <div className="w-full max-w-md mx-auto">
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="w-full h-auto"
        style={{ maxWidth: 420 }}
      >
        {/* Background */}
        <rect x="0" y="0" width={S} height={S} fill="#F5E6CC" rx="4" />

        {/* Outer border */}
        <rect x="4" y="4" width={S - 8} height={S - 8} fill="none" stroke="#8B6914" strokeWidth="2.5" />

        {/* Inner diamond — lines from midpoints of each side */}
        <line x1={M} y1="4" x2="4" y2={M} stroke="#8B6914" strokeWidth="1.5" />
        <line x1="4" y1={M} x2={M} y2={S - 4} stroke="#8B6914" strokeWidth="1.5" />
        <line x1={M} y1={S - 4} x2={S - 4} y2={M} stroke="#8B6914" strokeWidth="1.5" />
        <line x1={S - 4} y1={M} x2={M} y2="4" stroke="#8B6914" strokeWidth="1.5" />

        {/* Diagonal crosses — corner to corner */}
        <line x1="4" y1="4" x2={S - 4} y2={S - 4} stroke="#8B6914" strokeWidth="1.5" />
        <line x1={S - 4} y1="4" x2="4" y2={S - 4} stroke="#8B6914" strokeWidth="1.5" />

        {/* Rashi numbers for each house */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
          const sign = houseSign[h];
          const num = sign ? SIGN_NUM[sign] : h;
          const pos = HOUSE_TEXT[h];
          if (!pos) return null;
          return (
            <text
              key={`rashi-${h}`}
              x={pos.rx}
              y={pos.ry}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#c53030"
            >
              {num}
            </text>
          );
        })}

        {/* Planet labels per house */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
          const planets = housePlanets[h] || [];
          const pos = HOUSE_TEXT[h];
          if (!pos || planets.length === 0) return null;

          // Vertically center the text stack within the shape area
          const totalHeight = planets.length * 14;
          const startY = pos.py - (totalHeight / 2) + 7;

          return planets.map((p, i) => {
            const abbr = PLANET_ABBR[p.planet] ?? (p.planet === 'Ascendant' ? 'Asc' : p.planet.slice(0, 2));
            const color = PLANET_COLORS[abbr] || '#1a202c';
            const retro = p.isRetrograde ? '®' : '';
            const label = `${abbr}-${p.degree}°${retro}`;

            return (
              <text
                key={`${h}-${p.planet}`}
                x={pos.px}
                y={startY + i * 14}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill={color}
              >
                {label}
              </text>
            );
          });
        })}

        {/* Small corner decorations (circles like astrotalk) */}
        <circle cx="8" cy="8" r="4" fill="none" stroke="#8B6914" strokeWidth="1" />
        <circle cx={S - 8} cy="8" r="4" fill="none" stroke="#8B6914" strokeWidth="1" />
        <circle cx="8" cy={S - 8} r="4" fill="none" stroke="#8B6914" strokeWidth="1" />
        <circle cx={S - 8} cy={S - 8} r="4" fill="none" stroke="#8B6914" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ─── South Indian Chart ──────────────────────────────────────────────────────
// Fixed 4×4 grid with zodiac signs in fixed positions (clockwise from top-left = Pisces)
// House numbers rotate based on ascendant; planets placed in their zodiac sign cell.

const SOUTH_GRID: (string | null)[][] = [
  ['Pisces', 'Aries', 'Taurus', 'Gemini'],
  ['Aquarius', null, null, 'Cancer'],
  ['Capricorn', null, null, 'Leo'],
  ['Sagittarius', 'Scorpio', 'Libra', 'Virgo'],
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
  const [expandedDasha, setExpandedDasha] = useState<number | null>(null);
  const [, params] = useRoute('/kundli/:id');
  const kundliId = params?.id;

  const { data: kundli, isLoading } = useQuery<Kundli>({
    queryKey: ['/api/kundli', kundliId],
    enabled: !!kundliId,
  });

  // Auto-expand the current mahadasha once data loads
  useEffect(() => {
    if (kundli) {
      const dashas = (kundli.dashas as any[]) || [];
      const idx = dashas.findIndex((d: any) => d.status === 'current');
      setExpandedDasha(idx >= 0 ? idx : null);
    }
  }, [kundli]);

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
                      className={`px-4 py-1.5 font-medium transition-colors ${chartStyle === 'north'
                        ? 'gradient-primary text-white'
                        : 'bg-white/5 text-orange-600 hover:bg-orange-50'
                        }`}
                    >
                      North Indian
                    </button>
                    <button
                      onClick={() => setChartStyle('south')}
                      className={`px-4 py-1.5 font-medium transition-colors ${chartStyle === 'south'
                        ? 'gradient-primary text-white'
                        : 'bg-white/5 text-orange-600 hover:bg-orange-50'
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
                <div className="space-y-2">
                  {dashas.length > 0 ? dashas.map((dasha: any, i: number) => (
                    <div key={i} className={`rounded-lg border overflow-hidden ${dasha.status === 'current' ? 'border-primary/50' : 'border-border'}`}>
                      {/* Mahadasha row */}
                      <button
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors"
                        onClick={() => setExpandedDasha(expandedDasha === i ? null : i)}
                      >
                        <div className="flex items-center gap-3">
                          {expandedDasha === i
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          }
                          <div>
                            <div className="font-semibold">{dasha.planet} Mahadasha</div>
                            <div className="text-sm text-muted-foreground">{dasha.period}</div>
                          </div>
                        </div>
                        {dasha.status === 'current' && <Badge variant="default">Current</Badge>}
                        {dasha.status === 'past' && <Badge variant="secondary">Past</Badge>}
                      </button>

                      {/* Antardashas */}
                      {expandedDasha === i && dasha.antardashas?.length > 0 && (
                        <div className="border-t border-border bg-muted/20">
                          {dasha.antardashas.map((ad: any, j: number) => (
                            <div
                              key={j}
                              className={`flex items-center justify-between px-6 py-2.5 text-sm border-b last:border-0 border-border/50 ${ad.status === 'current' ? 'bg-primary/5' : ''}`}
                            >
                              <div>
                                <span className="font-medium">{dasha.planet}/{ad.planet}</span>
                                <span className="text-muted-foreground ml-2">{ad.period}</span>
                              </div>
                              {ad.status === 'current' && (
                                <Badge variant="outline" className="text-xs">Active</Badge>
                              )}
                            </div>
                          ))}
                        </div>
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
                      className={`p-4 border rounded-lg ${dosha.present
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
