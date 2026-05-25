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
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, FileText, Sparkles, Clock, CheckCircle2 } from 'lucide-react';

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
  content: { title: string; summary: string; sections: { heading: string; body: string }[]; remedies: string[] } | null;
  createdAt: string;
}
interface Kundli { id: string; name: string }

export default function Reports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [selected, setSelected] = useState<ReportType | null>(null);
  const [kundliId, setKundliId] = useState<string>('');
  const [viewing, setViewing] = useState<ReportOrder | null>(null);

  const { data: types, isLoading } = useQuery<ReportType[]>({ queryKey: ['/api/reports/types'] });
  const { data: kundlis } = useQuery<Kundli[]>({ queryKey: ['/api/kundli'] });
  const { data: myReports } = useQuery<ReportOrder[]>({
    queryKey: ['/api/reports/orders'],
    enabled: tab === 'mine',
    refetchInterval: (q) => (q.state.data as ReportOrder[] | undefined)?.some((r) => r.status === 'processing') ? 4000 : false,
  });

  const orderReport = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/reports/order', { reportTypeId: selected!.id, kundliId: kundliId || undefined });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Report ordered', description: 'Your report is being prepared. It will be ready shortly.' });
      setSelected(null);
      setKundliId('');
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
                    <Button size="sm" className="rounded-lg bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white" onClick={() => setSelected(t)} data-testid={`button-order-${t.slug}`}>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{selected?.description}</p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Select birth chart</label>
            {kundlis && kundlis.length > 0 ? (
              <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={kundliId} onChange={(e) => setKundliId(e.target.value)} data-testid="select-kundli">
                <option value="">Most recent chart</option>
                {kundlis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">No chart found. <Link href="/kundli/new"><span className="text-nava-royal-purple font-medium">Generate your Kundli</span></Link> first.</p>
            )}
          </div>
          <Button
            className="w-full bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white"
            disabled={orderReport.isPending || !kundlis || kundlis.length === 0}
            onClick={() => orderReport.mutate()}
            data-testid="button-confirm-order"
          >
            {orderReport.isPending ? 'Ordering…' : `Pay ₹${selected ? parseFloat(selected.price).toFixed(0) : ''} from Wallet`}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Paid from your wallet. <Link href="/wallet"><span className="text-nava-royal-purple font-medium">Recharge</span></Link> if needed.</p>
        </DialogContent>
      </Dialog>

      {/* Report viewer */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewing?.content?.title}</DialogTitle></DialogHeader>
          {viewing?.content && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground italic">{viewing.content.summary}</p>
              {viewing.content.sections?.map((s, i) => (
                <div key={i}>
                  <h3 className="font-semibold text-nava-royal-purple">{s.heading}</h3>
                  <p className="text-sm whitespace-pre-line mt-1">{s.body}</p>
                </div>
              ))}
              {viewing.content.remedies?.length > 0 && (
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
