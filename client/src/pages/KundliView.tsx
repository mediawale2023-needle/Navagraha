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
import { ArrowLeft, Calendar, Clock, MapPin, Download, Wallet, Sparkles, Info, ArrowRight } from 'lucide-react';
import { PageHeader, PageBody } from '@/components/shell/PageHeader';
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
import { RashiChart } from '@/components/kundli/RashiChart';
import { ChartToggles } from '@/components/kundli/ChartToggles';
import { GrahaGrid, GrahaStrip, grahaCards } from '@/components/kundli/GrahaGrid';
import { VimshottariScale } from '@/components/kundli/VimshottariScale';
import { summariseYogasAndDoshas } from '@/lib/kundliSummary';
import { SIGN_HI } from '@/lib/jyotishNames';
import type { ChartLabels } from '@/lib/rashiChart';
import { AIInsightSheet, type InsightSubject } from '@/components/AIInsightSheet';
import { ChartGlance } from '@/components/v3/ChartGlance';
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
  const [labels, setLabels] = useState<ChartLabels>('hi');
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

  // The dasha periods and life timeline moved to their own page; old ?tab= links land there.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (kundliId && !isPreview && (tab === 'dashas' || tab === 'insights')) navigate(`/kundli/${kundliId}/dasha`, { replace: true });
  }, [kundliId, isPreview, navigate]);

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
      <div>
        <PageHeader title="Kundli not found" back={{ href: '/kundli', label: 'Kundli' }} />
        <PageBody>
          <p className="text-muted-foreground mb-4">This chart does not exist or is not yours.</p>
          <Link href="/kundli"><Button variant="secondary">Your charts</Button></Link>
        </PageBody>
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
  const doshas = (kundli.doshas as any) || {};
  const remedies = (kundli.remedies as any[]) || [];
  // A chart the V3 engine could not recalculate: its stored placements are unverified, so none are shown.
  const limited = (kundli as any).chartStatus?.version === 'limited';
  const requestedTab = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab');
  const initialTab = requestedTab && ['overview', 'chart', 'remedies'].includes(requestedTab) ? requestedTab : 'overview';
  const chartView: ChartTabView = canonical ? chartTabView(canonical) : { mode: 'exact' };
  const moonSignUncertain = chartView.mode === 'table';

  const moonPlanet = canonical?.planets.find((p) => p.name === 'Moon');
  const sunPlanet = canonical?.planets.find((p) => p.name === 'Sun');
  const exactTimeV3 = canonical?.birth.timeAccuracy === 'exact';
  const nakshatraKnown = !!canonical && (exactTimeV3 || canonical.uncertainty.moonNakshatraStableAcrossBirthDate);
  const lagnaLine = canonical ? (exactTimeV3 ? `${canonical.ascendant.sign} Lagna` : 'Lagna unknown') : null;
  const moonLine = moonPlanet ? (moonSignUncertain ? 'Moon sign uncertain' : `${moonPlanet.sign} Moon${nakshatraKnown ? ` in ${moonPlanet.nakshatra.name}` : ''}`) : null;
  const cards = canonical ? grahaCards(canonical, { lagnaKnown: chartView.mode === 'exact', moonSignKnown: !moonSignUncertain, nakshatraKnown, maha: running?.maha?.lord, antar: running?.antar?.lord }) : [];
  const placements = canonical?.planets.map((p) => ({ planet: p.name, signIndex: p.signIndex, retrograde: p.retrograde })) ?? [];
  const firstHouseSign = chartView.mode === 'chandra' ? moonPlanet!.signIndex : canonical?.ascendant.signIndex ?? 0;
  const selectPlanet = (planet: string) => handlePlanetClick({ planet });
  const chartTitle = `${chartView.mode === 'chandra' ? 'Chandra Lagna' : 'North Indian'} chart for ${kundli.name}`;
  const yogaLine = canonical ? summariseYogasAndDoshas(canonical).map((seg, i) => (seg.bold ? <b key={i}>{seg.text}</b> : <span key={i}>{seg.text}</span>)) : null;

  return (
    <div>
      <PageHeader
        title={canonical ? (exactTimeV3 ? <><span lang="hi">{SIGN_HI[canonical.ascendant.sign]} लग्न</span> · {lagnaLine}</> : lagnaLine) : kundli.name}
        sub={canonical ? [kundli.name, moonLine, `${sunPlanet?.sign} Sun`].filter(Boolean).join(' · ') : undefined}
        back={isPreview ? undefined : { href: '/kundli', label: 'Kundli' }}
        desktop={false}
      />

      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 pb-12 pt-4 md:gap-8 md:px-10 md:pt-9">
        {/* Which chart this is and the page actions: one line, since the mockup assumes a single chart. */}
        <div className="hidden flex-wrap items-center justify-between gap-x-4 gap-y-2 md:flex" data-testid="kundli-identity">
          <p className="min-w-0 text-sm text-ink-muted">
            {!isPreview && <><Link href="/kundli" className="hover:text-amber-text">← Kundli</Link>{' · '}</>}
            <span className="font-semibold text-ink">{kundli.name}</span>
            {' · '}{birthDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {kundli.timeOfBirth}{chartData?.isBirthTimeApproximate ? ' (approximate)' : ''} · {kundli.placeOfBirth}
          </p>
          {!limited && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfChecking || pdfConfirming} className="gap-2">
                <Download className="h-4 w-4" />
                {pdfChecking ? 'Checking…' : 'Download PDF'}
              </Button>
              <TrustBadge variant="calculated" />
            </div>
          )}
        </div>
        {canonical && !exactTimeV3 && (
          <div className="rounded-md border border-line bg-highlight px-4 py-3 text-sm text-ink" data-testid="kundli-headline">
            <p>Birth time is approximate; Ascendant and house positions may be unreliable.</p>
            <p className="text-ink-muted">
              <span data-testid="overview-ascendant">Lagna: Unknown — birth time approximate</span>
              {moonSignUncertain && <> · Uncertain — the Moon changed sign on this birth date</>}
            </p>
          </div>
        )}
        {!canonical && chartData?.isBirthTimeApproximate && (
          <p className="text-caption text-ink-muted">Birth time is approximate; Ascendant and house positions may be unreliable.</p>
        )}

        {(kundli as any).chartStatus?.version === 'v3-recalculated-from-legacy' && (
          <div className="rounded-md border border-line bg-highlight p-3 text-sm text-ink" data-testid="migration-notice">
            {(kundli as any).chartStatus.notes.map((n: string) => <p key={n}>{n}</p>)}
          </div>
        )}
        {limited && (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-[22px] text-base" data-testid="limited-chart-notice">
            <p>{(kundli as any).chartStatus.notes[0]}</p>
            <p className="text-ink-muted">Its placements are hidden because they cannot be verified. This saved chart stays in your list unchanged.</p>
            <Link href={recreateHref(kundli as any)}>
              <Button data-testid="button-recreate-chart">
                Recreate with birth place
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        {!limited && (<>
        {canonical && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <section aria-label="Rashi chart" className="flex flex-col items-center gap-3.5">
              <p className="hidden self-start font-display text-lg text-ink-muted md:block">
                {chartView.mode === 'chandra' ? <><span lang="hi">चन्द्र लग्न</span> · Moon chart</> : <><span lang="hi">राशि चक्र</span> · Rashi chart</>}
              </p>
              {chartView.mode === 'table' ? (
                <div className="w-full rounded-lg border border-line bg-surface p-4" data-testid="approximate-planet-table">
                  <p className="mb-3 text-caption text-ink-muted">Birth time is approximate and the Moon changed sign on this birth date, so no house chart can be drawn. Only sign positions are shown.</p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-caption text-ink-muted"><th className="py-1.5 font-medium">Planet</th><th className="py-1.5 font-medium">Sign</th><th className="py-1.5 text-right font-medium">Degree</th></tr></thead>
                    <tbody>
                      {chartView.rows.map((r) => (
                        <tr key={r.planet} className="border-t border-hairline">
                          <td className="py-1.5">{r.planet}{r.retrograde && r.planet !== 'Rahu' && r.planet !== 'Ketu' ? ' ℞' : ''}</td>
                          <td className="py-1.5">{r.signUncertain ? `${r.sign} at the entered time · may differ` : r.sign}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.signUncertain ? '—' : `${r.degree.toFixed(2)}°`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <div className="border border-frame bg-surface p-[5px] md:p-2">
                    <div className="border-[3px] border-double border-frame p-1.5 md:p-2.5">
                      <div className="md:hidden"><RashiChart placements={placements} firstHouseSign={firstHouseSign} firstHouse={chartView.mode === 'chandra' ? 'chandra' : 'lagna'} labels={labels} style={chartStyle} size={320} title={chartTitle} onSelect={selectPlanet} /></div>
                      <div className="hidden md:block"><RashiChart placements={placements} firstHouseSign={firstHouseSign} firstHouse={chartView.mode === 'chandra' ? 'chandra' : 'lagna'} labels={labels} style={chartStyle} size={380} title={chartTitle} onSelect={selectPlanet} /></div>
                    </div>
                  </div>
                  <div className="hidden md:block"><ChartToggles labels={labels} style={chartStyle} onChange={(l, st) => { setLabels(l); setChartStyle(st); }} /></div>
                  {chartView.mode === 'chandra' && (
                    <p className="text-center text-caption text-ink-muted" data-testid="chandra-lagna-note">Birth time is approximate, so houses are counted from the Moon ({chartView.moonSign}), not from the Lagna.</p>
                  )}
                </>
              )}
            </section>

            <section aria-labelledby="kundli-grahas" className="flex min-w-0 flex-col gap-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1 id="kundli-grahas" className="m-0 font-display text-section font-semibold max-md:sr-only md:text-title">Nine grahas <span lang="hi" className="text-lg font-normal text-ink-muted md:text-subhead">नवग्रह</span></h1>
                <span className="hidden text-sm text-ink-muted md:inline">{[lagnaLine, moonSignUncertain ? null : `${moonPlanet?.sign} Moon`].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="hidden md:block"><GrahaGrid cards={cards} onSelect={selectPlanet} /></div>
              <div className="flex flex-col gap-2 md:hidden"><GrahaStrip cards={cards} onSelect={selectPlanet} />{chartView.mode !== 'table' && <ChartToggles labels={labels} style={chartStyle} onChange={(l, st) => { setLabels(l); setChartStyle(st); }} />}</div>
              {yogaLine && <p className="text-nav" data-testid="yoga-line">{yogaLine}</p>}
              {chartView.mode !== 'exact' && (
                <p className="text-caption text-ink-muted" data-testid="vargas-withheld">Divisional charts (D9, D10, D60), yogas and house bindus depend on the exact Lagna, so they are not shown for an approximate birth time.</p>
              )}
            </section>
          </div>
        )}

        {insights && canonical && (
          <VimshottariScale
            periods={insights.timeline}
            birth={new Date(canonical.birth.birthUTC)}
            maha={running?.maha?.lord}
            antar={running?.antar?.lord}
            note={insights.timing?.note}
          />
        )}
        {insights && canonical && !isPreview && kundliId && (
          <Link href={`/kundli/${kundliId}/dasha`} className="-mt-4 self-start text-sm underline hover:text-amber-text" data-testid="link-dasha-timeline">
            Every Mahadasha and Antardasha, with what each engages →
          </Link>
        )}

        {/* Tabs */}
        <Tabs defaultValue={initialTab} className="w-full" id="kundli-tabs">
          <TabsList aria-label="More about this chart">
            <TabsTrigger value="overview">Life areas</TabsTrigger>
            <TabsTrigger value="chart">Divisional charts &amp; strength</TabsTrigger>
            <TabsTrigger value="remedies">Remedies</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            {insights ? (
              <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-[22px]" aria-labelledby="kundli-areas">
                <h2 id="kundli-areas" className="m-0 font-display text-subhead font-semibold">Life areas, ranked</h2>
                {insights.headline.timeAccuracy === 'approximate' && (
                  <p className="text-caption text-ink-muted">Birth time is approximate, so house-based indicators are set aside and every confidence is low.</p>
                )}
                <ChartGlance domains={insights.domains} onWhy={(d) => { setSheetSubject({ kind: 'domain', resolution: d }); setAiSheetOpen(true); }} />
                <p className="text-caption text-ink-muted">{insights.notes[insights.notes.length - 1]}</p>
              </section>
            ) : (
              <p className="text-sm text-ink-muted" role="status">{canonical ? 'Reading the evidence for each life area…' : 'This chart predates the V3 engine; open it again after it has been recalculated.'}</p>
            )}
          </TabsContent>

          {/* Chart */}
          <TabsContent value="chart" className="flex flex-col gap-4">
            {chartView.mode !== 'exact' && (
              <p className="text-sm text-ink-muted">Divisional charts (D9, D10, D60), yogas and house bindus depend on the exact Lagna, so they are not shown for an approximate birth time.</p>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              {chartView.mode === 'exact' && chartData?.navamsa?.planetaryPositions && canonical && (
                <figure className="m-0 flex flex-col items-center gap-2 rounded-lg border border-line bg-surface p-4">
                  <figcaption className="text-center"><span className="font-display text-card-title font-semibold">Navamsa (D9)</span><span className="block text-caption text-ink-muted">Marriage, dharma and planetary strength</span></figcaption>
                  <RashiChart placements={canonical.vargas.D9.placements.map((v) => ({ planet: v.planet, signIndex: v.signIndex, retrograde: false }))} firstHouseSign={canonical.vargas.D9.ascendantSignIndex} firstHouse="lagna" labels={labels} style={chartStyle} size={280} title={`Navamsa (D9) chart for ${kundli.name}`} />
                </figure>
              )}
              {chartView.mode === 'exact' && chartData?.dasamsa?.planetaryPositions && canonical && (
                <figure className="m-0 flex flex-col items-center gap-2 rounded-lg border border-line bg-surface p-4">
                  <figcaption className="text-center"><span className="font-display text-card-title font-semibold">Dasamsa (D10)</span><span className="block text-caption text-ink-muted">Career and profession</span></figcaption>
                  <RashiChart placements={canonical.vargas.D10.placements.map((v) => ({ planet: v.planet, signIndex: v.signIndex, retrograde: false }))} firstHouseSign={canonical.vargas.D10.ascendantSignIndex} firstHouse="lagna" labels={labels} style={chartStyle} size={280} title={`Dasamsa (D10) chart for ${kundli.name}`} />
                </figure>
              )}
              {chartView.mode === 'exact' && chartData?.shashtiamsa?.planetaryPositions && canonical && (
                <figure className="m-0 flex flex-col items-center gap-2 rounded-lg border border-line bg-surface p-4">
                  <figcaption className="text-center"><span className="font-display text-card-title font-semibold">Shashtiamsa (D60)</span><span className="block text-caption text-ink-muted">Accurate only with an exact birth time</span></figcaption>
                  <RashiChart placements={canonical.vargas.D60.placements.map((v) => ({ planet: v.planet, signIndex: v.signIndex, retrograde: false }))} firstHouseSign={canonical.vargas.D60.ascendantSignIndex} firstHouse="lagna" labels={labels} style={chartStyle} size={280} title={`Shashtiamsa (D60) chart for ${kundli.name}`} />
                </figure>
              )}
            </div>

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
                        <div key={i} className={`rounded-lg p-2 text-center ${b >= 30 ? 'bg-positive/10 text-positive' : b < 25 ? 'bg-negative/10 text-negative' : 'bg-highlight text-ink'}`}>
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
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.action === 'Strengthen' ? 'bg-positive/10 text-positive' : 'bg-highlight text-amber-text'}`}>{r.action}</span>
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
                        {y.cancelled && <span className="text-xs px-1.5 py-0.5 rounded-full bg-negative/10 text-negative">cancelled</span>}
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
                          <td className={`p-1.5 ${p.dignity === 'Exalted' || p.dignity === 'Own sign' || p.dignity === 'Moolatrikona' ? 'text-positive' : p.dignity === 'Debilitated' ? 'text-negative' : ''}`}>
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

        {!limited && (
          <div className="flex flex-wrap items-center gap-2 md:hidden">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfChecking || pdfConfirming} className="gap-2">
              <Download className="h-4 w-4" />
              {pdfChecking ? 'Checking…' : 'Download PDF'}
            </Button>
            <TrustBadge variant="calculated" />
          </div>
        )}

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
