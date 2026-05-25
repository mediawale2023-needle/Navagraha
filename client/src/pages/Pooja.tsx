import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Flame, Check, CalendarDays } from 'lucide-react';

interface Pooja {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  benefits: string[] | null;
  price: string;
  durationText: string | null;
}
interface PoojaBooking {
  id: string;
  poojaName: string;
  status: string;
  amount: string;
  devoteeName: string;
  preferredDate: string | null;
  createdAt: string;
}

export default function Pooja() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [selected, setSelected] = useState<Pooja | null>(null);
  const [form, setForm] = useState({ devoteeName: '', gotra: '', preferredDate: '', sankalpNotes: '' });

  const { data: poojas, isLoading } = useQuery<Pooja[]>({ queryKey: ['/api/poojas'] });
  const { data: bookings } = useQuery<PoojaBooking[]>({ queryKey: ['/api/poojas/bookings'], enabled: tab === 'mine' });

  const book = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/poojas/book', { poojaId: selected!.id, ...form });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Pooja booked!', description: 'Our priests will perform it as scheduled.' });
      setSelected(null);
      setForm({ devoteeName: '', gotra: '', preferredDate: '', sankalpNotes: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/poojas/bookings'] });
      setTab('mine');
    },
    onError: (err: any) => toast({ title: 'Could not book', description: err?.message || 'Please try again', variant: 'destructive' }),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-8">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3 flex items-center gap-3">
          <Link href="/"><button className="p-1.5 rounded-lg hover:bg-muted" data-testid="button-back"><ArrowLeft className="w-5 h-5" /></button></Link>
          <h1 className="font-bold text-lg flex items-center gap-2"><Flame className="w-5 h-5 text-nava-amber" /> Book a Pooja</h1>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6">
        <div className="flex gap-2 mb-6">
          <Button variant={tab === 'browse' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setTab('browse')} data-testid="tab-browse">Browse</Button>
          <Button variant={tab === 'mine' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setTab('mine')} data-testid="tab-mine">My Bookings</Button>
        </div>

        {tab === 'browse' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {poojas?.map((p) => (
              <Card key={p.id} className="border-border/50 shadow-sm flex flex-col" data-testid={`pooja-${p.slug}`}>
                <CardContent className="p-5 flex flex-col flex-1">
                  <p className="font-semibold text-base">{p.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                  {p.benefits && p.benefits.length > 0 && (
                    <ul className="mt-3 space-y-1 flex-1">
                      {p.benefits.map((b, i) => (
                        <li key={i} className="text-xs flex items-center gap-2 text-foreground/80">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.durationText && <Badge variant="outline" className="w-fit mt-3 text-[10px] gap-1"><CalendarDays className="w-3 h-3" /> {p.durationText}</Badge>}
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-lg font-bold">₹{parseFloat(p.price).toFixed(0)}</span>
                    <Button size="sm" className="rounded-lg bg-nava-amber hover:bg-nava-amber/90 text-nava-navy font-semibold" onClick={() => setSelected(p)} data-testid={`button-book-${p.slug}`}>
                      Book Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === 'mine' && (
          <div className="space-y-3">
            {(!bookings || bookings.length === 0) && (
              <div className="text-center py-16 text-muted-foreground">
                <Flame className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No pooja bookings yet.</p>
              </div>
            )}
            {bookings?.map((b) => (
              <Card key={b.id} className="border-border/50 shadow-sm" data-testid={`booking-${b.id}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{b.poojaName}</p>
                    <p className="text-xs text-muted-foreground">For {b.devoteeName} · {new Date(b.createdAt).toLocaleDateString()} · ₹{parseFloat(b.amount).toFixed(0)}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{b.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Booking dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Devotee full name *" value={form.devoteeName} onChange={(e) => setForm({ ...form, devoteeName: e.target.value })} data-testid="input-devotee" />
            <Input placeholder="Gotra (optional)" value={form.gotra} onChange={(e) => setForm({ ...form, gotra: e.target.value })} data-testid="input-gotra" />
            <div>
              <label className="text-xs text-muted-foreground">Preferred date (optional)</label>
              <Input type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} data-testid="input-date" />
            </div>
            <Textarea placeholder="Sankalp / special intention (optional)" value={form.sankalpNotes} onChange={(e) => setForm({ ...form, sankalpNotes: e.target.value })} data-testid="input-sankalp" />
          </div>
          <Button
            className="w-full bg-nava-amber hover:bg-nava-amber/90 text-nava-navy font-semibold"
            disabled={book.isPending || !form.devoteeName.trim()}
            onClick={() => book.mutate()}
            data-testid="button-confirm-booking"
          >
            {book.isPending ? 'Booking…' : `Pay ₹${selected ? parseFloat(selected.price).toFixed(0) : ''} from Wallet`}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">Paid from your wallet. <Link href="/wallet"><span className="text-nava-royal-purple font-medium">Recharge</span></Link> if needed.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
