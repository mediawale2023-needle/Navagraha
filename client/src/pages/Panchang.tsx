import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { LocateFixed } from 'lucide-react';
import { tithiName, tithiHi, nakshatraHi, yogaHi, karanaHi, VARA_HI } from '@/lib/jyotishNames';
import { loadPanchangPlace, savePanchangPlace, localToday, panchangUrl, type PanchangPlace } from '@/lib/panchangPlace';
import { PageHeader, PageBody } from '@/components/shell/PageHeader';

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

type Place = PanchangPlace;


export default function Panchang() {
  const [date, setDate] = useState(() => localToday());
  const [place, setPlaceState] = useState<Place | null>(loadPanchangPlace);
  const [placeText, setPlaceText] = useState(() => loadPanchangPlace()?.name ?? '');
  // Today's Panchang hero uses the same city.
  const setPlace = (p: Place) => { setPlaceState(p); savePanchangPlace(p); };
  const [geoError, setGeoError] = useState<string | null>(null);

  const url = panchangUrl(date, place);

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

  const vara = data ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(data.vara) : -1;
  const tithi = data ? tithiName(data.tithi.name, data.tithi.number) : '';
  const limbs = data ? [
    { k: 'Tithi', hi: tithiHi(tithi), v: tithi, sub: `${data.tithi.paksha} Paksha` },
    { k: 'Nakshatra', hi: nakshatraHi(data.nakshatra.name), v: data.nakshatra.name, sub: `Lord ${data.nakshatra.lord}` },
    { k: 'Yoga', hi: yogaHi(data.yoga), v: data.yoga },
    { k: 'Karana', hi: karanaHi(data.karana), v: data.karana },
    { k: 'Vara', hi: vara >= 0 ? VARA_HI[vara] : null, v: data.vara },
  ] : [];
  const Row = ({ label, value, testId }: { label: string; value: string; testId?: string }) => (
    <div className="flex justify-between gap-3 border-b border-hairline py-2.5 last:border-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="m-0 text-base font-semibold tabular-nums" data-testid={testId}>{value}</dd>
    </div>
  );

  return (
    <div>
      <PageHeader title="Panchang" gloss="पञ्चाङ्ग" sub="The five limbs of the day at local sunrise, with the day's timings" />

      <PageBody className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="md:max-w-[12rem]" data-testid="input-date" />
          <div className="min-w-0 flex-1 md:max-w-md">
            <PlacesAutocomplete
              value={placeText}
              onChange={setPlaceText}
              onPlaceSelect={(p) => setPlace({ name: p.address, lat: p.lat, lng: p.lng })}
              placeholder="City for sunrise and timings"
              testId="input-panchang-place"
            />
          </div>
          <Button type="button" variant="outline" onClick={useMyLocation} className="gap-1" data-testid="button-my-location">
            <LocateFixed className="h-4 w-4" /> My location
          </Button>
        </div>
        {geoError && <p className="text-sm text-negative">{geoError}</p>}

        {error ? (
          <p className="rounded-lg border border-line bg-surface p-4 text-base" data-testid="panchang-error">{(error as Error).message}</p>
        ) : isLoading || !data ? <LoadingSpinner /> : (
          <>
            <div className="flex flex-col gap-1">
              <p className="font-display text-card-title font-semibold text-amber-text md:text-heading">
                {data.vara}, {new Date(`${data.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </p>
              <p className="text-sm text-ink-muted" data-testid="panchang-location">
                For {data.location.place ?? `${data.location.latitude.toFixed(2)}, ${data.location.longitude.toFixed(2)}`}
                {data.location.isDefault && ' (default: choose your city for local timings)'} · {data.location.timezone} (UTC{data.location.utcOffset})
              </p>
            </div>

            <ul className="m-0 grid list-none grid-cols-2 gap-0 overflow-hidden rounded-lg border border-line bg-surface p-0 md:grid-cols-5" aria-label="The five limbs">
              {limbs.map((l, i) => (
                <li key={l.k} className={`flex flex-col gap-0.5 border-hairline p-4 md:p-[22px] ${i < limbs.length - 1 ? 'border-b md:border-b-0 md:border-r' : ''} ${i % 2 === 0 ? 'max-md:border-r' : ''}`}>
                  <span className="text-sm text-ink-muted">{l.k}</span>
                  {l.hi && <span lang="hi" className="font-display text-subhead font-semibold leading-tight md:text-heading">{l.hi}</span>}
                  <span className="text-base font-semibold">{l.v}</span>
                  {l.sub && <span className="text-caption text-ink-muted">{l.sub}</span>}
                </li>
              ))}
            </ul>
            <p className="-mt-3 text-caption text-ink-muted">Limbs at local sunrise.</p>

            <div className="grid gap-6 md:grid-cols-2">
              <section aria-labelledby="sun-h" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
                <h2 id="sun-h" className="m-0 font-display text-card-title font-semibold">Sun</h2>
                <dl className="m-0">
                  <Row label="Sunrise" value={data.sunrise} testId="text-sunrise" />
                  <Row label="Sunset" value={data.sunset} testId="text-sunset" />
                </dl>
              </section>
              <section aria-labelledby="kaal-h" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
                <h2 id="kaal-h" className="m-0 font-display text-card-title font-semibold">Inauspicious periods</h2>
                <dl className="m-0">
                  <Row label="Rahu Kaal" value={`${data.rahuKaal.start} – ${data.rahuKaal.end}`} />
                  <Row label="Gulika Kaal" value={`${data.gulikaKaal.start} – ${data.gulikaKaal.end}`} />
                  <Row label="Yamaganda" value={`${data.yamaganda.start} – ${data.yamaganda.end}`} />
                </dl>
                <p className="text-caption text-ink-muted">Local times in {data.location.timezone}, from the actual sunrise and sunset at this place.</p>
              </section>
            </div>
          </>
        )}
      </PageBody>
    </div>
  );
}
