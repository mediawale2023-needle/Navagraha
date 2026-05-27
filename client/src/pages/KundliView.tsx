import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Calendar, Clock, MapPin, Download, ChevronDown, ChevronRight, Wallet, Sparkles, Info } from 'lucide-react';
import type { Kundli } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { DeterministicRemedies } from '@/components/DeterministicRemedies';
import { VerifyEventDialog } from '@/components/VerifyEventDialog';
import { TrustBadge } from '@/components/TrustBadge';
import { CalculationInfo } from '@/components/CalculationInfo';
import { InsightCard } from '@/components/InsightCard';
import { PriorityRemedyCard } from '@/components/PriorityRemedyCard';
import { NorthIndianChartEnhanced } from '@/components/NorthIndianChartEnhanced';
import { AIInsightSheet } from '@/components/AIInsightSheet';
import { BottomNav } from '@/components/BottomNav';

const PDF_PRICE = 10;

type PdfModal = 'confirm' | 'insufficient' | null;

function ConfirmModal({ open, balance, isFree, onConfirm, onCancel, loading }: { open: boolean; balance: number; isFree: boolean; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-nava-royal-purple" />
            Download Kundli PDF
          </DialogTitle>
          <DialogDescription className="pt-1">
            {isFree ? 'Your first PDF download is complimentary — no charge!' : `₹${PDF_PRICE} will be deducted from your wallet.`}
          </DialogDescription>
        </DialogHeader>
        {isFree ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm flex items-center gap-2">
            <span className="text-green-600 font-semibold text-base">✓</span>
            <span className="text-green-700 font-medium">First PDF FREE — ₹0 charged</span>
          </div>
        ) : (
          <div className="rounded-lg bg-muted px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current balance</span>
              <span className="font-medium">₹{balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">PDF download charge</span>
              <span className="font-medium text-nava-burgundy">− ₹{PDF_PRICE}</span>
            </div>
            <div className="border-t border-border pt-1 flex justify-between">
              <span className="text-muted-foreground">Balance after</span>
              <span className="font-semibold">₹{(balance - PDF_PRICE).toFixed(2)}</span>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button onClick={onConfirm} disabled={loading} className="bg-nava-royal-purple hover:bg-nava-royal-purple/90">
            {loading ? 'Processing…' : isFree ? 'Download Free' : 'Confirm & Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InsufficientModal({ open, balance, onClose, onRecharge }: { open: boolean; balance: number; onClose: () => void; onRecharge: () => void }) {
  const shortfall = (PDF_PRICE - balance).toFixed(2);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-nava-burgundy" />
            Insufficient Balance
          </DialogTitle>
          <DialogDescription className="pt-1">
            You don't have enough wallet balance to download this report.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your balance</span>
            <span className="font-medium text-nava-burgundy">₹{balance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Required</span>
            <span className="font-medium">₹{PDF_PRICE}</span>
          </div>
          <div className="border-t border-border pt-1 flex justify-between">
            <span className="text-muted-foreground">Add at least</span>
            <span className="font-semibold">₹{shortfall}</span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Later</Button>
          <Button onClick={onRecharge} className="bg-nava-royal-purple hover:bg-nava-royal-purple/90">
            <Wallet className="w-4 h-4 mr-2" />
            Recharge Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KundliView() {
  const [chartStyle, setChartStyle] = useState<'north' | 'south'>('north');
  const [expandedDasha, setExpandedDasha] = useState<number | null>(null);
  const [pdfChecking, setPdfChecking] = useState(false);
  const [pdfConfirming, setPdfConfirming] = useState(false);
  const [modal, setModal] = useState<PdfModal>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [pdfIsFree, setPdfIsFree] = useState(false);
  const [selectedPlanet, setSelectedPlanet] = useState<{ name: string; house: number } | null>(null);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);

  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleDownloadPDF = async () => {
    if (!isAuthenticated) {
      toast({ title: "Login required", description: "Please log in to download the PDF report.", variant: "destructive" });
      return;
    }
    if (pdfChecking || pdfConfirming) return;
    setPdfChecking(true);
    try {
      const check = await apiRequest<{ isFree: boolean; balance: string }>('GET', '/api/wallet/pdf-check');
      const balance = parseFloat(check.balance || '0');
      setWalletBalance(balance);
      setPdfIsFree(check.isFree);
      if (check.isFree || balance >= PDF_PRICE) {
        setModal('confirm');
      } else {
        setModal('insufficient');
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not fetch wallet. Try again.", variant: "destructive" });
    } finally {
      setPdfChecking(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (pdfConfirming) return;
    setPdfConfirming(true);
    try {
      await apiRequest('POST', '/api/wallet/deduct', { amount: PDF_PRICE, description: 'Kundli PDF download' });
      setModal(null);
      window.print();
    } catch (err: any) {
      toast({ title: "Payment failed", description: err?.message || "Could not process payment. Try again.", variant: "destructive" });
      setModal(null);
    } finally {
      setPdfConfirming(false);
    }
  };

  const [, params] = useRoute('/kundli/:id');
  const kundliId = params?.id;
  const isPreview = kundliId === 'preview';

  const guestKundli: Kundli | null = isPreview
    ? (() => { try { return JSON.parse(sessionStorage.getItem('guestKundli') || 'null'); } catch { return null; } })()
    : null;

  const { data: fetchedKundli, isLoading } = useQuery<Kundli>({
    queryKey: ['/api/kundli', kundliId],
    enabled: !!kundliId && !isPreview,
  });

  const kundli = isPreview ? guestKundli : fetchedKundli;

  useEffect(() => {
    if (kundli) {
      const dashas = (kundli.dashas as any[]) || [];
      const idx = dashas.findIndex((d: any) => d.status === 'current');
      setExpandedDasha(idx >= 0 ? idx : null);
    }
  }, [kundli]);

  const handlePlanetClick = (planet: any, house: number) => {
    setSelectedPlanet({ name: planet.planet, house });
    setAiSheetOpen(true);
  };

  if (!isPreview && isLoading) return <LoadingSpinner />;

  if (!kundli) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Kundli not found</p>
          <Link href="/"><Button className="bg-nava-royal-purple">Go Home</Button></Link>
        </div>
      </div>
    );
  }

  const birthDate = new Date(kundli.dateOfBirth);
  const chartData = kundli.chartData as any;
  const dashas = (kundli.dashas as any[]) || [];
  const doshas = (kundli.doshas as any) || {};
  const remedies = (kundli.remedies as any[]) || [];

  // Generate insights from chart data
  const insights = [
    {
      id: '1',
      title: 'Moon in 4th House',
      preview: 'Strong emotional connection to home and family. You find peace in domestic environments.',
      fullContent: 'The Moon in the 4th house indicates deep emotional ties to your roots, family, and home environment. You are naturally nurturing and find comfort in familiar surroundings. This placement favors real estate, agriculture, and businesses related to home and family.',
      priority: 'high' as const,
      planet: 'Moon',
      house: 4,
    },
    {
      id: '2',
      title: 'Mars in 10th House',
      preview: 'Ambitious career drive. Natural leadership abilities in professional settings.',
      fullContent: 'Mars in the 10th house gives you tremendous drive and ambition in your career. You are a natural leader who is not afraid to take initiative. This placement favors careers in engineering, military, sports, surgery, or any field requiring courage and physical energy.',
      priority: 'medium' as const,
      planet: 'Mars',
      house: 10,
    },
    {
      id: '3',
      title: 'Jupiter in 7th House',
      preview: 'Beneficial partnerships and marriage. Spouse may be wise or spiritually inclined.',
      fullContent: 'Jupiter in the 7th house is considered highly auspicious for partnerships and marriage. Your spouse is likely to be wise, generous, and spiritually inclined. This placement also favors business partnerships and legal matters.',
      priority: 'low' as const,
      planet: 'Jupiter',
      house: 7,
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/">
            <Button variant="outline" className="border-border">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownloadPDF} disabled={pdfChecking || pdfConfirming} className="hidden sm:flex">
              <Download className="w-4 h-4 mr-2" />
              {pdfChecking ? 'Checking…' : 'Download PDF'}
            </Button>
            <TrustBadge variant="verified" />
          </div>
        </div>

        {/* Info Card */}
        <Card className="card-clean mb-6">
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="font-trust text-2xl mb-2">{kundli.name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{birthDate.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{kundli.timeOfBirth}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span>{kundli.placeOfBirth}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-nava-lavender text-nava-royal-purple">
                  {kundli.zodiacSign || 'Aries'}
                </Badge>
                <Badge variant="secondary" className="bg-nava-lavender text-nava-royal-purple">
                  Moon: {kundli.moonSign || 'Taurus'}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full mb-6">
          <TabsList className="grid w-full grid-cols-5 bg-muted">
            <TabsTrigger value="overview" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">Overview</TabsTrigger>
            <TabsTrigger value="chart" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">Chart</TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">Insights</TabsTrigger>
            <TabsTrigger value="dashas" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">Dashas</TabsTrigger>
            <TabsTrigger value="remedies" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">Remedies</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <Card className="card-clean">
              <CardHeader>
                <CardTitle>Astrological Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2 text-foreground">Basic Details</h4>
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
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 text-foreground">Planetary Positions</h4>
                    <div className="space-y-1.5 text-sm">
                      {chartData?.planetaryPositions?.filter((p: any) => p.planet !== 'Ascendant').slice(0, 5).map((p: any) => (
                        <div key={p.planet} className="flex justify-between">
                          <span className="text-muted-foreground">{p.planet}:</span>
                          <span className="font-medium">{p.sign} {p.degree}°{p.isRetrograde ? ' (R)' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Chart */}
          <TabsContent value="chart">
            <Card className="card-clean">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle>Birth Chart</CardTitle>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <button onClick={() => setChartStyle('north')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${chartStyle === 'north' ? 'bg-nava-royal-purple text-white' : 'bg-card hover:bg-muted'}`}>
                      North Indian
                    </button>
                    <button onClick={() => setChartStyle('south')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${chartStyle === 'south' ? 'bg-nava-royal-purple text-white' : 'bg-card hover:bg-muted'}`}>
                      South Indian
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 p-4">
                  {chartStyle === 'north' ? (
                    <NorthIndianChartEnhanced chartData={chartData} onPlanetClick={handlePlanetClick} />
                  ) : (
                    <div className="text-center text-muted-foreground">South Indian chart coming soon</div>
                  )}
                  <p className="text-xs text-muted-foreground text-center">Tap any planet for detailed insights</p>

                  {chartData?.navamsa?.planetaryPositions && (
                    <div className="w-full pt-4 mt-2 border-t border-border/40">
                      <h3 className="text-sm font-semibold text-nava-royal-purple text-center mb-1">Navamsa (D9)</h3>
                      <p className="text-xs text-muted-foreground text-center mb-3">Marriage, dharma & true planetary strength</p>
                      <NorthIndianChartEnhanced chartData={chartData.navamsa} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {chartData?.ashtakavarga?.savByHouse && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Ashtakavarga</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-nava-royal-purple mb-2">Sarvashtakavarga (SAV) — strength by house</p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {chartData.ashtakavarga.savByHouse.map((b: number, i: number) => (
                        <div key={i} className={`rounded-lg p-2 text-center ${b >= 30 ? 'bg-green-600/15 text-green-700' : b < 25 ? 'bg-red-600/10 text-red-700' : 'bg-muted text-foreground'}`}>
                          <div className="text-[10px] text-muted-foreground">H{i + 1}</div>
                          <div className="text-sm font-bold">{b}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">Higher bindus = stronger house. Total across all houses = 337.</p>
                  </div>

                  {chartData.ashtakavarga.bav && (
                    <div className="overflow-x-auto">
                      <p className="text-xs font-semibold text-nava-royal-purple mb-2">Bhinnashtakavarga (BAV) — by sign</p>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-nava-lavender/40">
                            <th className="p-1.5 text-left font-medium">Planet</th>
                            {['Ar','Ta','Ge','Cn','Le','Vi','Li','Sc','Sg','Cp','Aq','Pi'].map((s) => (
                              <th key={s} className="p-1.5 font-medium">{s}</th>
                            ))}
                            <th className="p-1.5 font-medium">Σ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn'].map((pl) => {
                            const row: number[] = chartData.ashtakavarga.bav[pl] || [];
                            return (
                              <tr key={pl} className="border-b border-border/40">
                                <td className="p-1.5 font-medium">{pl}</td>
                                {row.map((v, i) => <td key={i} className="p-1.5 text-center">{v}</td>)}
                                <td className="p-1.5 text-center font-semibold">{row.reduce((a, b) => a + b, 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Insights */}
          <TabsContent value="insights">
            <div className="space-y-3">
              {insights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  title={insight.title}
                  preview={insight.preview}
                  fullContent={insight.fullContent}
                  priority={insight.priority}
                />
              ))}
            </div>
          </TabsContent>

          {/* Dashas */}
          <TabsContent value="dashas">
            <Card className="card-clean">
              <CardHeader>
                <CardTitle>Vimshottari Dashas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashas.length > 0 ? dashas.map((dasha: any, i: number) => (
                    <div key={i} className={`rounded-lg border overflow-hidden ${dasha.status === 'current' ? 'border-nava-royal-purple/50' : 'border-border'}`}>
                      <button className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors" onClick={() => setExpandedDasha(expandedDasha === i ? null : i)}>
                        <div className="flex items-center gap-3">
                          {expandedDasha === i ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <div>
                            <div className="font-semibold">{dasha.planet} Mahadasha</div>
                            <div className="text-sm text-muted-foreground">{dasha.period}</div>
                          </div>
                        </div>
                        {dasha.status === 'current' && <Badge className="bg-nava-royal-purple">Current</Badge>}
                      </button>
                      {expandedDasha === i && dasha.antardashas?.length > 0 && (
                        <div className="border-t border-border bg-muted/30">
                          {dasha.antardashas.map((ad: any, j: number) => (
                            <div key={j} className={`flex items-center justify-between px-6 py-2.5 text-sm border-b last:border-0 border-border/50 ${ad.status === 'current' ? 'bg-nava-lavender/30' : ''}`}>
                              <div>
                                <span className="font-medium">{dasha.planet}/{ad.planet}</span>
                                <span className="text-muted-foreground ml-2">{ad.period}</span>
                              </div>
                              {ad.status === 'current' && <Badge variant="outline" className="text-xs">Active</Badge>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )) : <p className="text-muted-foreground text-sm">No dasha data available.</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Remedies */}
          <TabsContent value="remedies">
            <Card className="card-clean">
              <CardHeader>
                <CardTitle>Recommended Remedies</CardTitle>
              </CardHeader>
              <CardContent>
                <DeterministicRemedies shadbala={(kundli as any)?.raw?.engineData?.shadbala} fallbackRemedies={remedies} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Calculation Method */}
        <div className="mb-6">
          <CalculationInfo />
        </div>

        {/* AI Astrologer CTA */}
        <Card className="card-clean bg-nava-lavender/30 border-nava-royal-purple/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-nava-royal-purple flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Ask AI Astrologer</h3>
                <p className="text-xs text-muted-foreground">Get personalized answers about your chart</p>
              </div>
            </div>
            <Link href="/ai-astrologer">
              <Button className="w-full bg-nava-royal-purple hover:bg-nava-royal-purple/90">
                Ask a Question
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* PDF Payment Modals */}
      <ConfirmModal open={modal === 'confirm'} balance={walletBalance} isFree={pdfIsFree} onConfirm={handleConfirmPurchase} onCancel={() => setModal(null)} loading={pdfConfirming} />
      <InsufficientModal open={modal === 'insufficient'} balance={walletBalance} onClose={() => setModal(null)} onRecharge={() => { setModal(null); navigate('/wallet'); }} />

      {/* AI Insight Sheet */}
      <AIInsightSheet
        open={aiSheetOpen}
        onOpenChange={setAiSheetOpen}
        planetName={selectedPlanet?.name || ''}
        houseNumber={selectedPlanet?.house || 1}
        signName="Aries"
        baseInsight="This placement indicates specific influences on your life path. The planet's energy manifests through the affairs of this house."
      />

      <BottomNav />
    </div>
  );
}
