import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Sun, Moon, Sparkles, Clock, CalendarDays } from 'lucide-react';

interface PanchangData {
  date: string;
  vara: string;
  tithi: { name: string; paksha: string; number: number };
  nakshatra: { name: string; lord: string };
  yoga: string;
  karana: string;
  sunrise: string;
  sunset: string;
  rahuKaal: { start: string; end: string };
  gulikaKaal: { start: string; end: string };
  yamaganda: { start: string; end: string };
}

export default function Panchang() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useQuery<PanchangData>({
    queryKey: ['/api/panchang', date],
    queryFn: async () => {
      const res = await fetch(`/api/panchang?date=${date}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const Limb = ({ label, value, sub }: { label: string; value?: string; sub?: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-right">{value}{sub && <span className="block text-xs font-normal text-muted-foreground">{sub}</span>}</span>
    </div>
  );

  return (
    <div className="yantra-shell min-h-screen pb-24 text-foreground md:pb-8">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="w-full max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
          <Link href="/"><button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted" data-testid="button-back"><ArrowLeft className="w-5 h-5" /></button></Link>
          <h1 className="font-display text-xl flex items-center gap-2"><CalendarDays className="w-5 h-5 text-[var(--primary-border)]" /> Panchang</h1>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-4">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-xs rounded-[10px]" data-testid="input-date" />

        {isLoading || !data ? <LoadingSpinner /> : (
          <>
            <Card className="yantra-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-lg">{data.vara}</p>
                  <span className="text-sm text-muted-foreground">{new Date(data.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <Limb label="Tithi" value={data.tithi.name} sub={`${data.tithi.paksha} Paksha`} />
                <Limb label="Nakshatra" value={data.nakshatra.name} sub={`Lord: ${data.nakshatra.lord}`} />
                <Limb label="Yoga" value={data.yoga} />
                <Limb label="Karana" value={data.karana} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="yantra-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <Sun className="w-6 h-6 text-nava-amber" />
                  <div><div className="text-xs text-muted-foreground">Sunrise</div><div className="font-semibold">{data.sunrise}</div></div>
                </CardContent>
              </Card>
              <Card className="yantra-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <Moon className="w-6 h-6 text-[var(--primary-border)]" />
                  <div><div className="text-xs text-muted-foreground">Sunset</div><div className="font-semibold">{data.sunset}</div></div>
                </CardContent>
              </Card>
            </div>

            <Card className="yantra-card">
              <CardContent className="p-5">
                <p className="font-semibold mb-1 flex items-center gap-2"><Clock className="w-4 h-4 text-red-500" /> Inauspicious Timings</p>
                <Limb label="Rahu Kaal" value={`${data.rahuKaal.start} – ${data.rahuKaal.end}`} />
                <Limb label="Gulika Kaal" value={`${data.gulikaKaal.start} – ${data.gulikaKaal.end}`} />
                <Limb label="Yamaganda" value={`${data.yamaganda.start} – ${data.yamaganda.end}`} />
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Timings are for IST and approximate (based on a standard sunrise/sunset).</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
