import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { NorthIndianChartEnhanced } from '@/components/NorthIndianChartEnhanced';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { downloadReportPdf, type ReportContent } from '@/lib/reportPdf';
import { ArrowLeft, FileText, Sparkles, Clock, CheckCircle2, Download } from 'lucide-react';

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
}
interface Kundli { id: string; name: string }

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

  const openOrder = (t: ReportType) => {
    setSelected(t);
    setOrderMode(kundlis && kundlis.length > 0 ? 'saved' : 'details');
    setKundliId('');
    setBirth(emptyBirth);
    setBirthCoords(null);
  };
  const birthValid = !!(birth.name.trim() && birth.dateOfBirth && birth.timeOfBirth && birth.placeOfBirth.trim());

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
  const { data: kundlis } = useQuery<Kundli[]>({ queryKey: ['/api/kundli'] });
  const { data: myReports } = useQuery<ReportOrder[]>({
    queryKey: ['/api/reports/orders'],
    enabled: tab === 'mine',
    refetchInterval: (q) => (q.state.data as ReportOrder[] | undefined)?.some((r) => r.status === 'processing') ? 4000 : false,
  });

  const orderReport = useMutation({
    mutationFn: async () => {
      const body: any = { reportTypeId: selected!.id };
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
      toast({ title: 'Report ordered', description: 'Your report is being prepared. It will be ready shortly.' });
      setSelected(null);
      setKundliId('');
      setBirth(emptyBirth);
      setBirthCoords(null);
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/reports/orders'] });
      setTab('mine');
    },
    onError: (err: any) => toast({ title: 'Could not order', description: err?.message || 'Please try again', variant: 'destructive' }),
  });

  if (isLoading) return <LoadingSpinner />;

  const typeById = (id: string) => types?.find((t) => t.id === id);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-8">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3 flex items-center gap-3">
          <Link href="/"><button className="p-1.5 rounded-lg hover:bg-muted" data-testid="button-back"><ArrowLeft className="w-5 h-5" /></button></Link>
          <h1 className="font-bold text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-nava-royal-purple" /> Astrology Reports</h1>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6">
        <div className="flex gap-2 mb-6">
          <Button variant={tab === 'browse' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setTab('browse')} data-testid="tab-browse">Browse</Button>
          <Button variant={tab === 'mine' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setTab('mine')} data-testid="tab-mine">My Reports</Button>
        </div>

        {tab === 'browse' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types?.map((t) => (
              <Card key={t.id} className="border-border/50 shadow-sm flex flex-col" data-testid={`report-${t.slug}`}>
                <CardContent className="p-5 flex flex-col flex-1">
                  <div className="w-10 h-10 rounded-xl bg-nava-lavender/50 flex items-center justify-center mb-3">
                    <Sparkles className="w-5 h-5 text-nava-royal-purple" />
                  </div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-muted-foreground mt-1 flex-1">{t.description}</p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-lg font-bold">₹{parseFloat(t.price).toFixed(0)}</span>
                    <Button size="sm" className="rounded-lg bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white" onClick={() => openOrder(t)} data-testid={`button-order-${t.slug}`}>
                      Get Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === 'mine' && (
          <div className="space-y-3">
            {(!myReports || myReports.length === 0) && (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No reports yet.</p>
              </div>
            )}
            {myReports?.map((r) => {
              const t = typeById(r.reportTypeId);
              return (
                <Card key={r.id} className="border-border/50 shadow-sm" data-testid={`my-report-${r.id}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{r.content?.title || t?.name || 'Report'}</p>
                      {(r.content?.birthDetails?.name || r.subjectName) && (
                        <p className="text-xs text-foreground/80">
                          {r.content?.birthDetails?.name || r.subjectName}
                          {r.content?.birthDetails?.dateOfBirth ? ` · ${r.content.birthDetails.dateOfBirth}` : ''}
                          {r.content?.birthDetails?.placeOfBirth ? ` · ${r.content.birthDetails.placeOfBirth}` : ''}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()} · ₹{parseFloat(r.amount).toFixed(0)}</p>
                    </div>
                    {r.status === 'ready' ? (
                      <Button size="sm" className="rounded-lg" onClick={() => setViewing(r)} data-testid={`button-view-${r.id}`}>
                        <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" /> View
                      </Button>
                    ) : r.status === 'failed' ? (
                      <Badge variant="destructive">Failed</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3 animate-pulse" /> Preparing…</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Order dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{selected?.description}</p>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={orderMode === 'saved' ? 'default' : 'outline'}
              className="rounded-lg"
              disabled={!kundlis || kundlis.length === 0}
              onClick={() => setOrderMode('saved')}
              data-testid="mode-saved"
            >
              Saved chart
            </Button>
            <Button
              type="button"
              variant={orderMode === 'details' ? 'default' : 'outline'}
              className="rounded-lg"
              onClick={() => setOrderMode('details')}
              data-testid="mode-details"
            >
              Enter birth details
            </Button>
          </div>

          {orderMode === 'saved' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select birth chart</label>
              {kundlis && kundlis.length > 0 ? (
                <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={kundliId} onChange={(e) => setKundliId(e.target.value)} data-testid="select-kundli">
                  <option value="">Most recent chart</option>
                  {kundlis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground">No saved chart. Switch to <span className="font-medium text-nava-royal-purple">Enter birth details</span>.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Full name</label>
                <Input className="mt-1" placeholder="Full name" value={birth.name} onChange={(e) => setBirth({ ...birth, name: e.target.value })} data-testid="input-bd-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Date of birth</label>
                  <Input type="date" className="mt-1" value={birth.dateOfBirth} onChange={(e) => setBirth({ ...birth, dateOfBirth: e.target.value })} data-testid="input-bd-date" />
                </div>
                <div>
                  <label className="text-sm font-medium">Time of birth</label>
                  <Input type="time" className="mt-1" value={birth.timeOfBirth} onChange={(e) => setBirth({ ...birth, timeOfBirth: e.target.value })} data-testid="input-bd-time" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Gender</label>
                <select className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" value={birth.gender} onChange={(e) => setBirth({ ...birth, gender: e.target.value })} data-testid="select-bd-gender">
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
                    onChange={(v) => setBirth((b) => ({ ...b, placeOfBirth: v }))}
                    onPlaceSelect={(place) => setBirthCoords({ lat: place.lat, lng: place.lng })}
                    placeholder="City, State, Country"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Exact time &amp; place give the most accurate chart.</p>
              </div>
            </div>
          )}

          <Button
            className="w-full bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white"
            disabled={orderReport.isPending || (orderMode === 'saved' ? (!kundlis || kundlis.length === 0) : !birthValid)}
            onClick={() => orderReport.mutate()}
            data-testid="button-confirm-order"
          >
            {orderReport.isPending ? 'Generating…' : `Pay ₹${selected ? parseFloat(selected.price).toFixed(0) : ''} from Wallet`}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Paid from your wallet. <Link href="/wallet"><span className="text-nava-royal-purple font-medium">Recharge</span></Link> if needed.</p>
        </DialogContent>
      </Dialog>

      {/* Report viewer */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">{viewing?.content?.title}</DialogTitle>
          </DialogHeader>
          {viewing?.content && (
            <div className="space-y-5">
              <Button
                size="sm"
                className="rounded-lg bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white"
                disabled={downloading}
                onClick={() => handleDownload(viewing.content)}
                data-testid="button-download-pdf"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {downloading ? 'Preparing PDF…' : 'Download PDF'}
              </Button>

              {/* Birth details */}
              {viewing.content.birthDetails && (
                <div className="rounded-xl border border-border/50 p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                  {viewing.content.birthDetails.name && <div><span className="text-muted-foreground">Name:</span> {viewing.content.birthDetails.name}</div>}
                  {viewing.content.birthDetails.dateOfBirth && <div><span className="text-muted-foreground">DOB:</span> {viewing.content.birthDetails.dateOfBirth}</div>}
                  {viewing.content.birthDetails.timeOfBirth && <div><span className="text-muted-foreground">Time:</span> {viewing.content.birthDetails.timeOfBirth}</div>}
                  {viewing.content.birthDetails.placeOfBirth && <div><span className="text-muted-foreground">Place:</span> {viewing.content.birthDetails.placeOfBirth}</div>}
                  {viewing.content.birthDetails.ascendant && <div><span className="text-muted-foreground">Lagna:</span> {viewing.content.birthDetails.ascendant}</div>}
                  {viewing.content.birthDetails.moonSign && <div><span className="text-muted-foreground">Moon:</span> {viewing.content.birthDetails.moonSign}</div>}
                </div>
              )}

              {/* Kundli chart */}
              {viewing.content.chartData?.planetaryPositions && (
                <div>
                  <h3 className="font-semibold text-nava-royal-purple mb-2">Birth Chart (D1)</h3>
                  <NorthIndianChartEnhanced chartData={viewing.content.chartData} />
                </div>
              )}
              {viewing.content.chartData?.navamsa?.planetaryPositions && (
                <div>
                  <h3 className="font-semibold text-nava-royal-purple mb-2">Navamsa (D9)</h3>
                  <NorthIndianChartEnhanced chartData={viewing.content.chartData.navamsa} />
                </div>
              )}

              {/* Planetary positions */}
              {viewing.content.planetaryPositions && viewing.content.planetaryPositions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-nava-royal-purple mb-2">Planetary Positions</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-nava-lavender/40 text-left">
                          <th className="p-2 font-medium">Planet</th>
                          <th className="p-2 font-medium">Sign</th>
                          <th className="p-2 font-medium">House</th>
                          <th className="p-2 font-medium">Degree</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewing.content.planetaryPositions.map((p, i) => (
                          <tr key={i} className="border-b border-border/40">
                            <td className="p-2">{p.planet}{p.retrograde ? ' (R)' : ''}</td>
                            <td className="p-2">{p.sign || '—'}</td>
                            <td className="p-2">{p.house ?? '—'}</td>
                            <td className="p-2">{p.degree != null ? `${p.degree}°` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Dasha timeline */}
              {viewing.content.dashaTimeline && viewing.content.dashaTimeline.length > 0 && (
                <div>
                  <h3 className="font-semibold text-nava-royal-purple mb-2">Vimshottari Dasha Timeline</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-nava-lavender/40 text-left">
                          <th className="p-2 font-medium">Mahadasha</th>
                          <th className="p-2 font-medium">Period</th>
                          <th className="p-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewing.content.dashaTimeline.map((d, i) => (
                          <tr key={i} className={`border-b border-border/40 ${d.status === 'current' ? 'bg-nava-lavender/30 font-medium' : ''}`}>
                            <td className="p-2">{d.planet}</td>
                            <td className="p-2">{d.period || '—'}</td>
                            <td className="p-2 capitalize">{d.status || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ashtakavarga (SAV by house) */}
              {viewing.content.chartData?.ashtakavarga?.savByHouse?.length === 12 && (
                <div>
                  <h3 className="font-semibold text-nava-royal-purple mb-2">Ashtakavarga — House Strength (SAV)</h3>
                  <div className="grid grid-cols-6 gap-1.5">
                    {viewing.content.chartData.ashtakavarga.savByHouse.map((b: number, i: number) => (
                      <div key={i} className={`rounded-lg p-2 text-center ${b >= 30 ? 'bg-green-600/15 text-green-700' : b < 25 ? 'bg-red-600/10 text-red-700' : 'bg-muted text-foreground'}`}>
                        <div className="text-[10px] text-muted-foreground">H{i + 1}</div>
                        <div className="text-sm font-bold">{b}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Narrative */}
              {viewing.content.summary && <p className="text-sm text-muted-foreground italic">{viewing.content.summary}</p>}
              {viewing.content.sections?.map((s, i) => (
                <div key={i}>
                  <h3 className="font-semibold text-nava-royal-purple">{s.heading}</h3>
                  <p className="text-sm whitespace-pre-line mt-1">{s.body}</p>
                </div>
              ))}
              {viewing.content.remedies && viewing.content.remedies.length > 0 && (
                <div>
                  <h3 className="font-semibold text-nava-royal-purple">Recommended Remedies</h3>
                  <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                    {viewing.content.remedies.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
