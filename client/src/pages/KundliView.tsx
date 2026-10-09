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
import { ArrowLeft, Calendar, Clock, MapPin, Download, ChevronDown, ChevronRight, Wallet, Sparkles, Info, ArrowRight } from 'lucide-react';
import { recreateHref } from '@/lib/recreateChart';
import { BalanceShortfall } from '@/components/BalanceShortfall';
import { chartTabView, type ChartTabView } from '@/lib/approximateChart';
import type { Kundli } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { DeterministicRemedies } from '@/components/DeterministicRemedies';
import { VerifyEventDialog } from '@/components/VerifyEventDialog';
import { TrustBadge } from '@/components/TrustBadge';
import { CalculationInfo } from '@/components/CalculationInfo';
import { PriorityRemedyCard } from '@/components/PriorityRemedyCard';
import { NorthIndianChartEnhanced } from '@/components/NorthIndianChartEnhanced';
import { AIInsightSheet, type InsightSubject } from '@/components/AIInsightSheet';
import { ChartGlance } from '@/components/v3/ChartGlance';
import { LifeTimeline } from '@/components/v3/LifeTimeline';
import { selectRunningPeriods, monthYear } from '@/lib/runningPeriods';
import type { KundliInsights, EvidenceItem } from '@shared/v3/evidence';
import type { CanonicalChart } from '@shared/v3/canonical';

const PDF_PRICE = 10;

// Whether a stored dasha period is running today, from its dates (the stored status froze when the chart was saved).
const isRunning = (x: any) => {
  if (!x?.startDate || !x?.endDate) return x?.status === 'current';
  const today = new Date().toISOString().slice(0, 10);
  return x.startDate <= today && today < x.endDate;
};

type TransitData = {
  date: string;
  natalLagnaSign: string | null;
  planets: Array<{ planet: string; sign: string; houseFromMoon: number; houseFromLagna: number | null; sav: number | null; retrograde: boolean }>;
  sadeSati: { active: boolean; determined?: boolean; phase: string; saturnSign: string; houseFromMoon: number; note: string; sinceApprox?: string; untilApprox?: string };
  moonSignCertain?: boolean;
  jupiter: { sign: string; houseFromMoon: number; favourable: boolean };
};

type PdfModal = 'confirm' | 'insufficient' | null;

function ConfirmModal({ open, balance, isFree, onConfirm, onCancel, loading }: { open: boolean; balance: number; isFree: boolean; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-text" />
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
              <span className="font-medium text-negative">− ₹{PDF_PRICE}</span>
            </div>
            <div className="border-t border-border pt-1 flex justify-between">
              <span className="text-muted-foreground">Balance after</span>
              <span className="font-semibold">₹{(balance - PDF_PRICE).toFixed(2)}</span>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button onClick={onConfirm} disabled={loading} className="bg-ink hover:bg-highlight">
            {loading ? 'Processing…' : isFree ? 'Download Free' : 'Confirm & Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InsufficientModal({ open, balance, onClose, onRecharge }: { open: boolean; balance: number; onClose: () => void; onRecharge: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-negative" />
            Insufficient Balance
          </DialogTitle>
          <DialogDescription className="pt-1">
            You don't have enough wallet balance to download this report.
          </DialogDescription>
        </DialogHeader>
        <BalanceShortfall balance={balance} required={PDF_PRICE} />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Later</Button>
          <Button onClick={onRecharge} className="bg-ink hover:bg-highlight">
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
  const [sheetSubject, setSheetSubject] = useState<InsightSubject | null>(null);
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

  const { data: transits } = useQuery<TransitData>({
    queryKey: ['/api/kundli', kundliId, 'transits'],
    enabled: !!kundliId && !isPreview,
  });

  // V3 evidence-backed insights: owner route for saved charts, stateless route for guest previews.
  const canonical: CanonicalChart | undefined = (kundli?.chartData as any)?.canonical;
  const { data: insights } = useQuery<KundliInsights>({
    queryKey: isPreview ? ['guest-insights', canonical?.meta?.calculatedAt] : ['/api/kundli', kundliId, 'insights'],
    // An explicit `queryFn: undefined` would override the default fetcher, so only spread it for previews.
    ...(isPreview ? { queryFn: () => apiRequest<KundliInsights>('POST', '/api/kundli/insights', { canonical }) } : {}),
    enabled: isPreview ? !!canonical : !!kundliId,
  });

  useEffect(() => {
    if (kundli) {
      const dashas = (kundli.dashas as any[]) || [];
      const idx = dashas.findIndex(isRunning);
      setExpandedDasha(idx >= 0 ? idx : null);
    }
  }, [kundli]);

  const handlePlanetClick = (planet: any) => {
    if (!canonical || !canonical.planets.some((p) => p.name === planet.planet)) return;
    const seen = new Set<string>();
    const evidence: EvidenceItem[] = [];
    for (const d of insights?.domains ?? []) {
      for (const e of [...d.supporting, ...d.conflicting, ...d.neutral]) {
        if (e.planet === planet.planet && !seen.has(e.explanation)) { seen.add(e.explanation); evidence.push(e); }
      }
    }
    setSheetSubject({ kind: 'planet', planet: planet.planet, chart: canonical, evidence });
    setAiSheetOpen(true);
  };

  const askAbout = (question: string) => {
    const params = new URLSearchParams({ q: question });
    if (kundliId && !isPreview) params.set('kundliId', kundliId);
    navigate(`/ai-astrologer?${params.toString()}`);
  };

  if (!isPreview && isLoading) return <LoadingSpinner />;

  if (!kundli) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Kundli not found</p>
          <Link href="/"><Button className="bg-ink">Go Home</Button></Link>
        </div>
      </div>
    );
  }

  const birthDate = new Date(kundli.dateOfBirth);
  const chartData = kundli.chartData as any;
  // Running periods come from the insights timing, which withholds any period an approximate birth time could change.
  const running = insights ? selectRunningPeriods(insights) : null;
  const exactTime = insights?.headline.timeAccuracy === 'exact';
  const legacyMd = (kundli.dashas as any[] | undefined)?.find(isRunning);
  const legacyAd = legacyMd?.antardashas?.find(isRunning);
  const curPd = exactTime && running?.antar && legacyMd?.planet === running.maha?.lord && legacyAd?.planet === running.antar.lord
    ? legacyAd?.pratyantardashas?.find(isRunning) : undefined;
  const curYogini = exactTime ? (chartData?.yoginiDasha as any[] | undefined)?.find(isRunning) : undefined;
  const periodRange = (p: { start: string; end: string }) => (running?.showDates ? ` (${monthYear(p.start)} – ${monthYear(p.end)})` : '');
  const dashas = (kundli.dashas as any[]) || [];
  const doshas = (kundli.doshas as any) || {};
  const remedies = (kundli.remedies as any[]) || [];
  // A chart the V3 engine could not recalculate: its stored placements are unverified, so none are shown.
  const limited = (kundli as any).chartStatus?.version === 'limited';
  const requestedTab = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab');
  const initialTab = requestedTab && ['overview', 'chart', 'insights', 'dashas', 'remedies'].includes(requestedTab) ? requestedTab : 'overview';
  const chartView: ChartTabView = canonical ? chartTabView(canonical) : { mode: 'exact' };
  const moonSignUncertain = chartView.mode === 'table';

  return (
    <div className="yantra-shell min-h-screen pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <Link href="/">
            <Button variant="outline" className="rounded-[9px] border-border bg-card">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            {!limited && (
              <Button variant="outline" onClick={handleDownloadPDF} disabled={pdfChecking || pdfConfirming} className="hidden rounded-[9px] border-border bg-card sm:flex">
                <Download className="w-4 h-4 mr-2" />
                {pdfChecking ? 'Checking…' : 'Download PDF'}
              </Button>
            )}
            {!limited && <TrustBadge variant="calculated" />}
          </div>
        </div>

        {/* Info Card */}
        <Card className="card-clean mb-6">
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your Kundli</p>
                <CardTitle className="font-display text-2xl mb-1">{kundli.name}</CardTitle>
                {canonical && (
                  <div className="mb-2" data-testid="kundli-headline">
                    <p className="font-display text-lg text-foreground">
                      {canonical.birth.timeAccuracy === 'approximate' ? 'Lagna unknown' : `${canonical.ascendant.sign} Lagna`}
                      {' · '}{canonical.birth.timeAccuracy === 'approximate' && !canonical.uncertainty.moonSignStableAcrossBirthDate
                        ? 'Moon sign uncertain'
                        : `${canonical.planets.find((p) => p.name === 'Moon')?.sign} Moon`}
                      {' · '}{canonical.planets.find((p) => p.name === 'Sun')?.sign} Sun
                    </p>
                    <p className="text-xs text-muted-foreground">Calculated using Swiss Ephemeris · {canonical.meta.ayanamsa} Ayanamsa · {canonical.birth.timezone} (UTC{canonical.birth.utcOffset})</p>
                  </div>
                )}
                {(kundli as any).chartStatus?.version === 'v3-recalculated-from-legacy' && (
                  <div className="mb-2 rounded-[8px] border border-primary/25 bg-primary/10 p-2.5 text-xs text-foreground" data-testid="migration-notice">
                    {(kundli as any).chartStatus.notes.map((n: string) => <p key={n}>{n}</p>)}
                  </div>
                )}
                {limited && (
                  <div className="mb-3 space-y-2 rounded-[8px] border border-line bg-highlight p-3 text-xs text-amber-text" data-testid="limited-chart-notice">
                    <p>{(kundli as any).chartStatus.notes[0]}</p>
                    <p>Its placements are hidden because they cannot be verified. This saved chart stays in your list unchanged.</p>
                    <Link href={recreateHref(kundli as any)}>
                      <Button size="sm" className="rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-recreate-chart">
                        Recreate with birth place
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                )}
                {chartData?.isBirthTimeApproximate && (
                  <p className="text-sm text-muted-foreground">Birth time is approximate; Ascendant and house positions may be unreliable.</p>
                )}
                <div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{birthDate.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{kundli.timeOfBirth}{chartData?.isBirthTimeApproximate ? " (approximate)" : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span>{kundli.placeOfBirth}</span>
                  </div>
                </div>
              </div>
              {!limited && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-primary/15 text-[var(--primary-border)]">
                    {kundli.zodiacSign || '—'}
                  </Badge>
                  <Badge variant="secondary" className="bg-positive/10 text-positive">
                    Moon: {moonSignUncertain ? 'uncertain' : kundli.moonSign || '—'}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        {!limited && (<>
        {/* Tabs */}
        <Tabs defaultValue={initialTab} className="w-full mb-6">
          <TabsList className="grid w-full grid-cols-5 bg-muted p-1">
            <TabsTrigger value="overview" className="rounded-[6px] data-[state=active]:bg-ink data-[state=active]:text-primary">Overview</TabsTrigger>
            <TabsTrigger value="chart" className="rounded-[6px] data-[state=active]:bg-ink data-[state=active]:text-primary">Chart</TabsTrigger>
            <TabsTrigger value="insights" className="rounded-[6px] data-[state=active]:bg-ink data-[state=active]:text-primary">Insights</TabsTrigger>
            <TabsTrigger value="dashas" className="rounded-[6px] data-[state=active]:bg-ink data-[state=active]:text-primary">Dashas</TabsTrigger>
            <TabsTrigger value="remedies" className="rounded-[6px] data-[state=active]:bg-ink data-[state=active]:text-primary">Remedies</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            {insights && (
              <Card className="card-clean mb-4">
                <CardHeader>
                  <CardTitle className="font-display">Your Chart at a Glance</CardTitle>
                  {insights.headline.timeAccuracy === 'approximate' && (
                    <p className="text-xs text-muted-foreground">Birth time is approximate, so house-based indicators are set aside and every confidence is low.</p>
                  )}
                </CardHeader>
                <CardContent>
                  <ChartGlance domains={insights.domains} onWhy={(d) => { setSheetSubject({ kind: 'domain', resolution: d }); setAiSheetOpen(true); }} />
                  <p className="mt-3 text-xs text-muted-foreground">{insights.notes[insights.notes.length - 1]}</p>
                </CardContent>
              </Card>
            )}
            <Card className="card-clean">
              <CardHeader>
                <CardTitle className="font-display">Astrological Overview</CardTitle>
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
                        {moonSignUncertain ? (
                          <span className="text-right text-muted-foreground">Uncertain — the Moon changed sign on this birth date</span>
                        ) : (
                          <span className="font-medium">{kundli.moonSign || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ascendant (Lagna):</span>
                        {canonical?.birth.timeAccuracy === 'approximate' ? (
                          <span className="text-right text-muted-foreground" data-testid="overview-ascendant">Unknown — birth time approximate</span>
                        ) : (
                          <span className="font-medium" data-testid="overview-ascendant">{canonical?.ascendant.sign ?? '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 text-foreground">Planetary Positions</h4>
                    <div className="space-y-1.5 text-sm">
                      {chartData?.planetaryPositions?.filter((p: any) => p.planet !== 'Ascendant').slice(0, 5).map((p: any) => (
                        <div key={p.planet} className="flex justify-between">
                          <span className="text-muted-foreground">{p.planet}:</span>
                          <span className="font-medium">{moonSignUncertain && p.planet === 'Moon' ? 'Uncertain' : `${p.sign} ${p.degree}°${p.isRetrograde ? ' (R)' : ''}`}</span>
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
                  <CardTitle className="font-display">{chartView.mode === 'chandra' ? 'Moon Chart (Chandra Lagna)' : chartView.mode === 'table' ? 'Planet Positions' : 'Birth Chart'}</CardTitle>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <button onClick={() => setChartStyle('north')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${chartStyle === 'north' ? 'bg-ink text-primary' : 'bg-card hover:bg-muted'}`}>
                      North Indian
                    </button>
                    <button onClick={() => setChartStyle('south')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${chartStyle === 'south' ? 'bg-ink text-primary' : 'bg-card hover:bg-muted'}`}>
                      South Indian
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 p-1 sm:p-4">
                  {chartView.mode === 'table' ? (
                    <div className="w-full" data-testid="approximate-planet-table">
                      <p className="mb-3 text-xs text-muted-foreground">Birth time is approximate and the Moon changed sign on this birth date, so no house chart can be drawn. Only sign positions are shown.</p>
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1.5 font-medium">Planet</th><th className="py-1.5 font-medium">Sign</th><th className="py-1.5 font-medium text-right">Degree</th></tr></thead>
                        <tbody>
                          {chartView.rows.map((r) => (
                            <tr key={r.planet} className="border-t border-border/50">
                              <td className="py-1.5">{r.planet}{r.retrograde && r.planet !== 'Rahu' && r.planet !== 'Ketu' ? ' ℞' : ''}</td>
                              <td className="py-1.5">{r.signUncertain ? `${r.sign} at the entered time · may differ` : r.sign}</td>
                              <td className="py-1.5 text-right tabular-nums">{r.signUncertain ? '—' : `${r.degree.toFixed(2)}°`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : chartStyle === 'north' ? (
                    <NorthIndianChartEnhanced chartData={chartView.mode === 'chandra' ? chartView.chartData : chartData} onPlanetClick={handlePlanetClick} />
                  ) : (
                    <div className="text-center text-muted-foreground">South Indian chart coming soon</div>
                  )}
                  {chartView.mode === 'chandra' && (
                    <p className="text-xs text-muted-foreground text-center" data-testid="chandra-lagna-note">Birth time is approximate, so houses are counted from the Moon ({chartView.moonSign}), not from the Lagna.</p>
                  )}
                  {chartView.mode !== 'table' && <p className="text-xs text-muted-foreground text-center">Tap any planet for detailed insights</p>}
                  {chartView.mode !== 'exact' && (
                    <p className="w-full border-t border-border/40 pt-4 text-xs text-muted-foreground text-center" data-testid="vargas-withheld">Divisional charts (D9, D10, D60), yogas and house bindus depend on the exact Lagna, so they are not shown for an approximate birth time.</p>
                  )}

                  {chartView.mode === 'exact' && chartData?.navamsa?.planetaryPositions && (
                    <div className="w-full pt-4 mt-2 border-t border-border/40">
                      <h3 className="text-sm font-semibold text-amber-text text-center mb-1">Navamsa (D9)</h3>
                      <p className="text-xs text-muted-foreground text-center mb-3">Marriage, dharma & true planetary strength</p>
                      <NorthIndianChartEnhanced chartData={chartData.navamsa} />
                    </div>
                  )}
                  {chartView.mode === 'exact' && chartData?.dasamsa?.planetaryPositions && (
                    <div className="w-full pt-4 mt-2 border-t border-border/40">
                      <h3 className="text-sm font-semibold text-amber-text text-center mb-1">Dasamsa (D10)</h3>
                      <p className="text-xs text-muted-foreground text-center mb-3">Career & profession</p>
                      <NorthIndianChartEnhanced chartData={chartData.dasamsa} />
                    </div>
                  )}
                  {chartView.mode === 'exact' && chartData?.shashtiamsa?.planetaryPositions && (
                    <div className="w-full pt-4 mt-2 border-t border-border/40">
                      <h3 className="text-sm font-semibold text-amber-text text-center mb-1">Shashtiamsa (D60)</h3>
                      <p className="text-xs text-muted-foreground text-center mb-3">Past-life karma — accurate only with an exact birth time</p>
                      <NorthIndianChartEnhanced chartData={chartData.shashtiamsa} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {chartView.mode === 'exact' && chartData?.ashtakavarga?.savByHouse && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Ashtakavarga</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-amber-text mb-2">Sarvashtakavarga (SAV) — strength by house</p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {chartData.ashtakavarga.savByHouse.map((b: number, i: number) => (
                        <div key={i} className={`rounded-lg p-2 text-center ${b >= 30 ? 'bg-green-600/15 text-green-700' : b < 25 ? 'bg-red-600/10 text-red-700' : 'bg-muted text-foreground'}`}>
                          <div className="text-xs text-muted-foreground">H{i + 1}</div>
                          <div className="text-sm font-bold">{b}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Higher bindus = stronger house. Total across all houses = 337.</p>
                  </div>

                  {chartData.ashtakavarga.bav && (
                    <div className="overflow-x-auto">
                      <p className="text-xs font-semibold text-amber-text mb-2">Bhinnashtakavarga (BAV) — by sign</p>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-highlight/40">
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

            {/* Lagna-based: only with an exact birth time */}
            {chartData?.functionalRemedies?.length > 0 && chartData?.canonical?.birth?.timeAccuracy !== 'approximate' && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Personalised Remedies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {chartData.functionalRemedies.map((r: any, i: number) => (
                    <div key={i} className="rounded-lg border border-border/40 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.action === 'Strengthen' ? 'bg-green-600/15 text-green-700' : 'bg-highlight text-amber-text'}`}>{r.action}</span>
                        <span className="font-semibold text-sm text-foreground">{r.focus}</span>
                        {r.gemstone && <span className="text-xs text-muted-foreground">· {r.gemstone}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.donation ? `Donate ${r.donation}. ` : ''}Chant <span className="italic">{r.mantra}</span> ({r.japaCount.toLocaleString()}×) on {r.day}; worship {r.deity}.
                      </p>
                      <p className="text-xs text-muted-foreground/80 mt-0.5">{r.reason}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {chartView.mode === 'exact' && chartData?.yogas?.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Yogas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {chartData.yogas.map((y: any, i: number) => (
                    <div key={i} className="rounded-lg border border-border/40 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{y.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-highlight/60 text-amber-text">{y.category}</span>
                        {y.cancelled && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-600/10 text-red-700">cancelled</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{y.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {chartData?.dignities?.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Planetary Dignity &amp; State</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-highlight/40 text-left">
                        <th className="p-1.5 font-medium">Planet</th>
                        <th className="p-1.5 font-medium">Sign</th>
                        <th className="p-1.5 font-medium">Dignity</th>
                        <th className="p-1.5 font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.dignities.map((p: any) => (
                        <tr key={p.planet} className="border-b border-border/40">
                          <td className="p-1.5 font-medium">{p.planet}</td>
                          <td className="p-1.5">{p.sign}</td>
                          <td className={`p-1.5 ${p.dignity === 'Exalted' || p.dignity === 'Own sign' || p.dignity === 'Moolatrikona' ? 'text-green-700' : p.dignity === 'Debilitated' ? 'text-red-700' : ''}`}>
                            {p.dignity}{p.neechaBhanga ? ' (cancelled)' : ''}
                          </td>
                          <td className="p-1.5 text-muted-foreground">
                            {[p.retrograde ? 'R' : '', p.combust ? 'Combust' : '', p.planetaryWar ? `War:${p.planetaryWar}` : '', p.avastha?.split(' ')[0]].filter(Boolean).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {chartData?.bhava?.houseLords?.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Houses &amp; Lords</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-highlight/40 text-left">
                        <th className="p-1.5 font-medium">House</th>
                        <th className="p-1.5 font-medium">Sign</th>
                        <th className="p-1.5 font-medium">Lord</th>
                        <th className="p-1.5 font-medium">Lord placed in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.bhava.houseLords.map((h: any) => (
                        <tr key={h.house} className="border-b border-border/40">
                          <td className="p-1.5 font-medium">{h.house}</td>
                          <td className="p-1.5">{h.sign}</td>
                          <td className="p-1.5">{h.lord}</td>
                          <td className="p-1.5">House {h.lordHouse} ({h.lordSign})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {(running?.maha || curYogini || running?.note) && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Current Periods</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm" data-testid="current-periods">
                  {running?.maha && <p><span className="text-muted-foreground">Mahadasha:</span> <span className="font-medium">{running.maha.lord}</span> <span className="text-xs text-muted-foreground">{periodRange(running.maha)}</span></p>}
                  {running?.antar && <p><span className="text-muted-foreground">Antardasha:</span> <span className="font-medium">{running.antar.lord}</span> <span className="text-xs text-muted-foreground">{periodRange(running.antar)}</span></p>}
                  {curPd && <p><span className="text-muted-foreground">Pratyantardasha:</span> <span className="font-medium">{curPd.planet}</span> <span className="text-xs text-muted-foreground">({curPd.period})</span></p>}
                  {curYogini && <p><span className="text-muted-foreground">Yogini Dasha:</span> <span className="font-medium">{curYogini.yogini} / {curYogini.lord}</span> <span className="text-xs text-muted-foreground">({curYogini.period})</span></p>}
                  {running?.note && <p className="text-xs text-amber-text">{running.note}</p>}
                </CardContent>
              </Card>
            )}

            {transits && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Current Transits (Gochar)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`rounded-xl p-3 ${transits.sadeSati.active ? 'bg-highlight border border-line' : 'bg-muted'}`}>
                    <p className="text-sm font-semibold text-foreground">
                      Sade Sati: {transits.sadeSati.determined === false ? 'Undetermined' : transits.sadeSati.active ? 'Active' : 'Not active'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{transits.sadeSati.phase}</p>
                    {transits.sadeSati.note && <p className="text-xs text-muted-foreground">{transits.sadeSati.note}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Saturn in {transits.sadeSati.saturnSign}
                      {transits.sadeSati.sinceApprox ? ` (~${transits.sadeSati.sinceApprox} – ${transits.sadeSati.untilApprox})` : ''}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-highlight/40 text-left">
                          <th className="p-1.5 font-medium">Planet</th>
                          <th className="p-1.5 font-medium">Sign</th>
                          <th className="p-1.5 font-medium">From Moon</th>
                          <th className="p-1.5 font-medium">From Lagna</th>
                          <th className="p-1.5 font-medium">SAV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transits.planets.map((p) => (
                          <tr key={p.planet} className="border-b border-border/40">
                            <td className="p-1.5">{p.planet}{p.retrograde ? ' (R)' : ''}</td>
                            <td className="p-1.5">{p.sign}</td>
                            <td className="p-1.5 text-center">{transits.moonSignCertain === false ? '—' : p.houseFromMoon}</td>
                            <td className="p-1.5 text-center">{p.houseFromLagna ?? '—'}</td>
                            <td className="p-1.5 text-center">{p.sav ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">As of {transits.date}. {transits.natalLagnaSign ? 'Houses counted from natal Moon and Lagna' : 'Birth time is approximate, so houses are counted from the natal Moon only'}; SAV = bindus of the transited sign.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Insights */}
          <TabsContent value="insights">
            <div className="space-y-3">
              <Card className="card-clean">
                <CardHeader>
                  <CardTitle className="font-display">Life Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  {insights ? (
                    <LifeTimeline periods={insights.timeline} timingNote={insights.timing?.note} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {canonical ? 'Loading your timeline…' : 'This chart predates the V3 engine. Open it again after it has been recalculated, or create it anew.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Dashas */}
          <TabsContent value="dashas">
            <Card className="card-clean">
              <CardHeader>
                <CardTitle className="font-display">Vimshottari Dashas</CardTitle>
                {insights?.timing?.note && <p className="text-xs text-amber-text" data-testid="dashas-timing-note">{insights.timing.note} Dates below are for the time entered.</p>}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashas.length > 0 ? dashas.map((dasha: any, i: number) => (
                    <div key={i} className={`overflow-hidden rounded-[10px] border ${isRunning(dasha) ? 'border-primary/60' : 'border-border'}`}>
                      <button className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors" onClick={() => setExpandedDasha(expandedDasha === i ? null : i)}>
                        <div className="flex items-center gap-3">
                          {expandedDasha === i ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <div>
                            <div className="font-semibold">{dasha.planet} Mahadasha</div>
                            <div className="text-sm text-muted-foreground">{dasha.period}</div>
                          </div>
                        </div>
                        {isRunning(dasha) && <Badge className="bg-ink text-primary">Current</Badge>}
                      </button>
                      {expandedDasha === i && dasha.antardashas?.length > 0 && (
                        <div className="border-t border-border bg-muted/30">
                          {dasha.antardashas.map((ad: any, j: number) => (
                            <div key={j} className={`flex items-center justify-between border-b border-border/50 px-6 py-2.5 text-sm last:border-0 ${isRunning(ad) ? 'bg-primary/10' : ''}`}>
                              <div>
                                <span className="font-medium">{dasha.planet}/{ad.planet}</span>
                                <span className="text-muted-foreground ml-2">{ad.period}</span>
                              </div>
                              {isRunning(ad) && <Badge variant="outline" className="text-xs">Active</Badge>}
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
                <CardTitle className="font-display">Recommended Remedies</CardTitle>
              </CardHeader>
              <CardContent>
                <DeterministicRemedies shadbala={(kundli as any)?.raw?.engineData?.shadbala} fallbackRemedies={remedies} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Calculation Method */}
        <div className="mb-6">
          {canonical ? (
            <CalculationInfo
              ephemeris={`${canonical.meta.ephemeris} ${canonical.meta.ephemerisVersion}`}
              ayanamsa={`${canonical.meta.ayanamsa} (${canonical.meta.ayanamsaDegrees.toFixed(4)}°)`}
              houseSystem="Whole Sign"
              timezone={`${canonical.birth.timezone} (UTC${canonical.birth.utcOffset}), ${canonical.birth.timezoneSource === 'supplied' ? 'as entered' : 'from the birth place'}`}
            />
          ) : (
            <CalculationInfo ephemeris="Legacy engine (pre-V3)" ayanamsa="Lahiri" houseSystem="Whole Sign" timezone="Assumed Indian Standard Time (pre-V3)" />
          )}
        </div>

        {/* AI Astrologer CTA */}
        <Card className="card-clean bg-primary/10 border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-ink">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-foreground">Ask AI Astrologer</h3>
                <p className="text-xs text-muted-foreground">Get personalized answers about your chart</p>
              </div>
            </div>
            <Link href="/ai-astrologer">
              <Button className="w-full rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90">
                Ask a Question
              </Button>
            </Link>
          </CardContent>
        </Card>
        </>)}
      </div>

      {/* PDF Payment Modals */}
      <ConfirmModal open={modal === 'confirm'} balance={walletBalance} isFree={pdfIsFree} onConfirm={handleConfirmPurchase} onCancel={() => setModal(null)} loading={pdfConfirming} />
      <InsufficientModal open={modal === 'insufficient'} balance={walletBalance} onClose={() => setModal(null)} onRecharge={() => { setModal(null); navigate('/wallet'); }} />

      {/* Evidence Sheet */}
      <AIInsightSheet
        open={aiSheetOpen}
        onOpenChange={setAiSheetOpen}
        subject={sheetSubject}
        onAskQuestion={askAbout}
      />
    </div>
  );
}
