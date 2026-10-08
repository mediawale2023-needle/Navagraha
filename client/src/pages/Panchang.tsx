import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { ArrowLeft, Sun, Moon, Sparkles, Clock, CalendarDays, LocateFixed } from 'lucide-react';

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
  location: { latitude: number; longitude: number; timezone: string; utcOffset: string; place: string | null; isDefault: boolean };
}

interface Place { name: string; lat: number; lng: number }

// The device's calendar date (toISOString would give the UTC date).
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Panchang() {
  const [date, setDate] = useState(localToday);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeText, setPlaceText] = useState('');
  const [geoError, setGeoError] = useState<string | null>(null);

  const params = new URLSearchParams({ date });
  if (place) { params.set('lat', String(place.lat)); params.set('lng', String(place.lng)); params.set('place', place.name); }
  const url = `/api/panchang?${params}`;

  const { data, isLoading, error } = useQuery<PanchangData>({
    queryKey: [url],
    queryFn: async () => {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not compute the Panchang');
      return body;
    },
    retry: false,
  });

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError('Location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPlace({ name: 'Your location', lat: pos.coords.latitude, lng: pos.coords.longitude }); setPlaceText('Your location'); },
      () => setGeoError('Location permission was denied. Search for a city instead.'),
      { timeout: 10000 },
    );
  };

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
        <div className="flex flex-col sm:flex-row gap-2">
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="sm:max-w-[11rem] rounded-[10px]" data-testid="input-date" />
          <div className="flex-1">
            <PlacesAutocomplete
              value={placeText}
              onChange={setPlaceText}
              onPlaceSelect={(p) => setPlace({ name: p.address, lat: p.lat, lng: p.lng })}
              placeholder="City for sunrise and timings"
              testId="input-panchang-place"
            />
          </div>
          <Button type="button" variant="outline" onClick={useMyLocation} className="rounded-[10px]" data-testid="button-my-location">
            <LocateFixed className="w-4 h-4 mr-1" /> My location
          </Button>
        </div>
        {geoError && <p className="text-xs text-destructive">{geoError}</p>}

        {error ? (
          <Card className="yantra-card"><CardContent className="p-5 text-sm" data-testid="panchang-error">{(error as Error).message}</CardContent></Card>
        ) : isLoading || !data ? <LoadingSpinner /> : (
          <>
            <p className="text-xs text-muted-foreground" data-testid="panchang-location">
              For {data.location.place ?? `${data.location.latitude.toFixed(2)}, ${data.location.longitude.toFixed(2)}`}
              {data.location.isDefault && ' (default — choose your city for local timings)'} · {data.location.timezone} (UTC{data.location.utcOffset})
            </p>
            <Card className="yantra-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-lg">{data.vara}</p>
                  <span className="text-sm text-muted-foreground">{new Date(`${data.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                </div>
                <Limb label="Tithi" value={data.tithi.name} sub={`${data.tithi.paksha} Paksha`} />
                <Limb label="Nakshatra" value={data.nakshatra.name} sub={`Lord: ${data.nakshatra.lord}`} />
                <Limb label="Yoga" value={data.yoga} />
                <Limb label="Karana" value={data.karana} />
                <p className="text-[11px] text-muted-foreground mt-2">Limbs at local sunrise.</p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="yantra-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <Sun className="w-6 h-6 text-nava-amber" />
                  <div><div className="text-xs text-muted-foreground">Sunrise</div><div className="font-semibold" data-testid="text-sunrise">{data.sunrise}</div></div>
                </CardContent>
              </Card>
              <Card className="yantra-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <Moon className="w-6 h-6 text-[var(--primary-border)]" />
                  <div><div className="text-xs text-muted-foreground">Sunset</div><div className="font-semibold" data-testid="text-sunset">{data.sunset}</div></div>
                </CardContent>
              </Card>
            </div>

            <Card className="yantra-card">
              <CardContent className="p-5">
                <p className="font-semibold mb-1 flex items-center gap-2"><Clock className="w-4 h-4 text-red-500" /> Inauspicious Timings</p>
                <Limb label="Rahu Kaal" value={`${data.rahuKaal.start} – ${data.rahuKaal.end}`} />
                <Limb label="Gulika Kaal" value={`${data.gulikaKaal.start} – ${data.gulikaKaal.end}`} />
                <Limb label="Yamaganda" value={`${data.yamaganda.start} – ${data.yamaganda.end}`} />
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Local times in {data.location.timezone}, from the actual sunrise and sunset at this place.</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
