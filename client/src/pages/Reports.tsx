import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ReportReader } from '@/components/reports/ReportReader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { isApiError } from '@/lib/apiError';
import { BalanceShortfall } from '@/components/BalanceShortfall';
import { downloadReportPdf, type ReportContent } from '@/lib/reportPdf';
import { Clock } from 'lucide-react';
import { PageHeader, PageBody } from '@/components/shell/PageHeader';
import { birthDetailsReady, chartOrderable, chartSummary, type SavedChart } from '@/lib/reportOrderForm';

interface ReportType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  price: string;
}
interface ReportOrder {
  id: string;
  reportTypeId: string;
  status: string;
  amount: string;
  subjectName?: string | null;
  content: ReportContent | null;
  createdAt: string;
  refundedAt?: string | null;
  reportName?: string | null;
}
type Kundli = SavedChart;

export default function Reports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [selected, setSelected] = useState<ReportType | null>(null);
  const [kundliId, setKundliId] = useState<string>('');
  const [orderMode, setOrderMode] = useState<'saved' | 'details'>('saved');
  const emptyBirth = { name: '', gender: 'male', dateOfBirth: '', timeOfBirth: '', placeOfBirth: '' };
  const [birth, setBirth] = useState(emptyBirth);
  const [birthCoords, setBirthCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [viewing, setViewing] = useState<ReportOrder | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Why the last order attempt failed, when the dialog can offer a way forward.
  const [orderProblem, setOrderProblem] = useState<{ kind: 'balance' } | { kind: 'chart'; message: string } | null>(null);
  const { data: wallet } = useQuery<{ balance: number | string }>({ queryKey: ['/api/wallet'] });
  const walletBalance = wallet ? Number(wallet.balance) || 0 : null;

  const openOrder = (t: ReportType) => {
    setSelected(t);
    setOrderProblem(null);
    const firstOrderable = kundlis?.find(chartOrderable);
    setOrderMode(kundlis && kundlis.length > 0 ? 'saved' : 'details');
    setKundliId(firstOrderable?.id ?? '');
    setBirth(emptyBirth);
    setBirthCoords(null);
  };
  const birthValid = birthDetailsReady(birth, birthCoords);

  const handleDownload = async (content: ReportContent | null) => {
    if (!content) return;
    setDownloading(true);
    try {
      await downloadReportPdf(content);
    } catch {
      toast({ title: 'Download failed', description: 'Could not generate the PDF. Please try again.', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const { data: types, isLoading } = useQuery<ReportType[]>({ queryKey: ['/api/reports/types'] });
  const { data: config } = useQuery<{ reportsAvailable?: boolean }>({ queryKey: ['/api/config'], refetchOnWindowFocus: false });
  // Reports are AI-written; without the AI service none can be prepared, so none are sold.
  const reportsAvailable = config?.reportsAvailable !== false;
  const { data: kundlis } = useQuery<Kundli[]>({ queryKey: ['/api/kundli'] });
  const { data: myReports } = useQuery<ReportOrder[]>({
    queryKey: ['/api/reports/orders'],
    enabled: tab === 'mine',
    refetchInterval: (q) => (q.state.data as ReportOrder[] | undefined)?.some((r) => r.status === 'processing') ? 4000 : false,
  });

  const orderReport = useMutation({
    mutationFn: async () => {
      // The price shown is confirmed by the server before anything is charged.
      const body: any = { reportTypeId: selected!.id, expectedPrice: parseFloat(selected!.price) };
      if (orderMode === 'details') {
        // Send raw birth details; the server computes the chart for this report
        // only and does NOT save it to the user's charts.
        body.birthDetails = {
          name: birth.name,
          gender: birth.gender,
          dateOfBirth: birth.dateOfBirth,
          timeOfBirth: birth.timeOfBirth,
          placeOfBirth: birth.placeOfBirth,
          latitude: birthCoords?.lat,
          longitude: birthCoords?.lng,
        };
      } else {
        body.kundliId = kundliId || undefined;
      }
      const res = await apiRequest('POST', '/api/reports/order', body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Report ordered', description: 'Your report is being prepared. If it cannot be prepared, you will be refunded automatically.' });
      setSelected(null);
      setKundliId('');
      setBirth(emptyBirth);
      setBirthCoords(null);
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/reports/orders'] });
      setTab('mine');
    },
    onError: (err: any) => {
      // Payment and chart problems stay in the dialog with a way forward; the server decides (admins ride free).
      if (isApiError(err) && err.status === 402) {
        setOrderProblem({ kind: 'balance' });
        queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
        return;
      }
      if (isApiError(err) && err.status === 409 && (err.body as { code?: string })?.code === 'price_changed') {
        queryClient.invalidateQueries({ queryKey: ['/api/reports/types'] });
        toast({ title: 'Price updated', description: err.message });
        setSelected(null);
        return;
      }
      if (isApiError(err) && err.status === 409) {
        setOrderProblem({ kind: 'chart', message: err.message });
        return;
      }
      toast({ title: 'Could not order', description: err?.message || 'Please try again', variant: 'destructive' });
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const typeById = (id: string) => types?.find((t) => t.id === id);

  return (
    <div>
      <PageHeader title="Reports" sub="Written from your own chart, checked before delivery" />

      <PageBody className="flex flex-col gap-6">
        {viewing?.content ? (
          <ReportReader
            content={viewing.content}
            title={viewing.content.title || typeById(viewing.reportTypeId)?.name || viewing.reportName || 'Report'}
            refunded={!!viewing.refundedAt}
            downloading={downloading}
            onDownload={() => handleDownload(viewing.content)}
            onBack={() => setViewing(null)}
          />
        ) : (<>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'browse' | 'mine')}>
          <TabsList aria-label="Reports">
            <TabsTrigger value="browse" data-testid="tab-browse">Browse</TabsTrigger>
            <TabsTrigger value="mine" data-testid="tab-mine">My reports</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'browse' && !reportsAvailable && (
          <p className="rounded-md border border-line bg-highlight px-4 py-3 text-sm" data-testid="text-reports-unavailable">
            Report preparation is temporarily unavailable, so reports cannot be ordered right now. Your saved reports remain under My reports.
          </p>
        )}
        {tab === 'browse' && (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
            {types?.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 md:p-[22px]" data-testid={`report-${t.slug}`}>
                <h2 className="m-0 font-display text-card-title font-semibold">{t.name}</h2>
                <p className="flex-1 text-sm text-ink-muted">{t.description}</p>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-hairline pt-3">
                  <span className="font-display text-card-title font-semibold tabular-nums">₹{parseFloat(t.price).toFixed(0)}</span>
                  <Button onClick={() => openOrder(t)} disabled={!reportsAvailable} data-testid={`button-order-${t.slug}`}>
                    {reportsAvailable ? 'Get report' : 'Unavailable'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === 'mine' && (
          <div className="flex flex-col gap-3">
            {(!myReports || myReports.length === 0) && (
              <p className="py-12 text-center text-ink-muted">No reports yet.</p>
            )}
            {myReports && myReports.length > 0 && (
              <ul className="m-0 list-none overflow-hidden rounded-lg border border-line bg-surface p-0">
                {myReports.map((r) => {
                  const t = typeById(r.reportTypeId);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 last:border-0 md:px-[22px]" data-testid={`my-report-${r.id}`}>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="font-display text-card-title font-semibold">{r.content?.title || t?.name || r.reportName || 'Report'}</p>
                        {(r.content?.birthDetails?.name || r.subjectName) && (
                          <p className="text-sm">
                            {r.content?.birthDetails?.name || r.subjectName}
                            {r.content?.birthDetails?.dateOfBirth ? ` · ${r.content.birthDetails.dateOfBirth}` : ''}
                            {r.content?.birthDetails?.placeOfBirth ? ` · ${r.content.birthDetails.placeOfBirth}` : ''}
                          </p>
                        )}
                        <p className="text-caption tabular-nums text-ink-muted">{new Date(r.createdAt).toLocaleDateString()} · ₹{parseFloat(r.amount).toFixed(0)}</p>
                      </div>
                      {r.status === 'ready' && r.refundedAt ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" title="This report did not meet our standard, and what you paid was returned to your wallet.">Refunded</Badge>
                          <Button variant="outline" onClick={() => setViewing(r)} data-testid={`button-view-${r.id}`}>Read</Button>
                        </div>
                      ) : r.status === 'ready' ? (
                        <Button onClick={() => setViewing(r)} data-testid={`button-view-${r.id}`}>Read</Button>
                      ) : r.status === 'failed' && r.refundedAt ? (
                        <Badge variant="outline" title="This report could not be prepared, and what you paid was returned to your wallet.">Not delivered · refunded</Badge>
                      ) : r.status === 'failed' ? (
                        <Badge variant="outline" className="text-negative">Failed</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Preparing…</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        </>)}
      </PageBody>

      {/* Order dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setOrderProblem(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{selected?.description}</p>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={orderMode === 'saved' ? 'default' : 'outline'}
              className={`rounded-[9px] ${orderMode === 'saved' ? 'bg-ink text-primary hover:bg-ink/90' : ''}`}
              onClick={() => setOrderMode('saved')}
              data-testid="mode-saved"
            >
              Saved chart
            </Button>
            <Button
              type="button"
              variant={orderMode === 'details' ? 'default' : 'outline'}
              className={`rounded-[9px] ${orderMode === 'details' ? 'bg-ink text-primary hover:bg-ink/90' : ''}`}
              onClick={() => setOrderMode('details')}
              data-testid="mode-details"
            >
              Enter birth details
            </Button>
          </div>

          {orderMode === 'saved' ? (
            kundlis && kundlis.length > 0 ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" data-testid="saved-charts">
                <legend className="mb-1 text-sm font-medium">Choose a saved chart</legend>
                {kundlis.map((k) => {
                  const orderable = chartOrderable(k);
                  const on = kundliId === k.id;
                  return (
                    <label
                      key={k.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md px-3.5 py-3 ${on ? 'border-[1.5px] border-ink bg-surface' : 'border border-line bg-surface hover:bg-highlight'} ${orderable ? '' : 'cursor-not-allowed opacity-60'}`}
                      data-testid={`saved-chart-${k.id}`}
                    >
                      <input
                        type="radio"
                        name="saved-chart"
                        className="mt-1"
                        checked={on}
                        disabled={!orderable}
                        onChange={() => { setKundliId(k.id); setOrderProblem(null); }}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold">{k.name}</span>
                        <span className="text-caption text-ink-muted break-words">{chartSummary(k) || 'Birth details saved'}</span>
                        {!orderable && <span className="text-caption text-amber-text">Needs its birth place: open the chart to recreate it.</span>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm" data-testid="no-saved-charts">
                <p className="m-0">You have no saved charts yet. Create one once and use it for every report, or enter birth details for this report only.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/kundli/new"><Button size="sm" variant="outline">Create a chart</Button></Link>
                  <Button size="sm" variant="ghost" onClick={() => setOrderMode('details')}>Enter birth details</Button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Full name</label>
                <Input className="mt-1 rounded-[10px]" placeholder="Full name" value={birth.name} onChange={(e) => setBirth({ ...birth, name: e.target.value })} data-testid="input-bd-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Date of birth</label>
                  <Input type="date" className="mt-1 rounded-[10px]" value={birth.dateOfBirth} onChange={(e) => setBirth({ ...birth, dateOfBirth: e.target.value })} data-testid="input-bd-date" />
                </div>
                <div>
                  <label className="text-sm font-medium">Time of birth</label>
                  <Input type="time" className="mt-1 rounded-[10px]" value={birth.timeOfBirth} onChange={(e) => setBirth({ ...birth, timeOfBirth: e.target.value })} data-testid="input-bd-time" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Gender</label>
                <select className="w-full mt-1 rounded-[10px] border border-border bg-background px-3 py-2 text-sm" value={birth.gender} onChange={(e) => setBirth({ ...birth, gender: e.target.value })} data-testid="select-bd-gender">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Place of birth</label>
                <div className="mt-1">
                  <PlacesAutocomplete
                    value={birth.placeOfBirth}
                    onChange={(v) => { setBirth((b) => ({ ...b, placeOfBirth: v })); setBirthCoords(null); }}
                    onPlaceSelect={(place) => setBirthCoords({ lat: place.lat, lng: place.lng })}
                    placeholder="City, State, Country"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1" data-testid="place-hint">
                  {birth.placeOfBirth.trim() && !birthCoords
                    ? 'Pick the town from the suggestions: its coordinates and time zone fix the chart.'
                    : 'Exact time & place give the most accurate chart.'}
                </p>
              </div>
            </div>
          )}

          {orderProblem?.kind === 'balance' && selected && (
            <div className="space-y-2" data-testid="order-insufficient-balance">
              <p className="text-sm font-medium text-foreground">Your wallet balance doesn't cover this report.</p>
              {walletBalance !== null ? (
                <BalanceShortfall balance={walletBalance} required={parseFloat(selected.price)} />
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="order-balance-unavailable">
                  Your wallet balance is temporarily unavailable. Open the wallet to check your balance.
                </p>
              )}
              <Link href="/wallet">
                <Button className="w-full rounded-[9px] bg-ink text-primary hover:bg-ink/90" data-testid="button-recharge-wallet">Recharge wallet</Button>
              </Link>
            </div>
          )}
          {orderProblem?.kind === 'chart' && (
            <div className="rounded-[8px] border border-line bg-highlight p-3 text-xs text-amber-text" data-testid="order-chart-problem">
              <p>{orderProblem.message}</p>
              {(kundliId || kundlis?.[0]?.id) && (
                <Link href={`/kundli/${kundliId || kundlis![0].id}`}><span className="mt-1 inline-block font-semibold underline">Open the chart to recreate it</span></Link>
              )}
            </div>
          )}

          <Button
            className="w-full rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={orderReport.isPending || (orderMode === 'saved' ? !kundliId : !birthValid)}
            onClick={() => orderReport.mutate()}
            data-testid="button-confirm-order"
          >
            {orderReport.isPending ? 'Generating…' : `Pay ₹${selected ? parseFloat(selected.price).toFixed(0) : ''} from Wallet`}
          </Button>
          <p className="text-xs text-center text-muted-foreground" data-testid="order-wallet-balance">
            Paid from your wallet{walletBalance !== null ? ` · balance ₹${walletBalance.toFixed(2)}` : ''}. <Link href="/wallet"><span className="font-medium text-amber-text">Recharge</span></Link> if needed.
          </p>
        </DialogContent>
      </Dialog>

    </div>
  );
}
