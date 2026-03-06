import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: {
    address: string;
    lat: number;
    lng: number;
  }) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
}

// Unique global callback name
const CB = '__gmapsReady__';

export function PlacesAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Enter location",
  className = "",
  testId = "input-place",
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const [scriptLoading, setScriptLoading] = useState(false);

  onChangeRef.current = onChange;
  onPlaceSelectRef.current = onPlaceSelect;

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ['/api/config'],
  });

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current) return;
    const g = (window as any).google;
    if (!g?.maps?.places?.Autocomplete) return;
    try {
      const ac = new g.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry', 'name'],
        types: ['(cities)'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place?.geometry?.location) return;
        const address = place.formatted_address || place.name || '';
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        onChangeRef.current(address);
        onPlaceSelectRef.current?.({ address, lat, lng });
      });
      autocompleteRef.current = ac;
    } catch (e) {
      console.warn('PlacesAutocomplete init failed:', e);
    } finally {
      setScriptLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!config?.googleMapsApiKey) return;

    // Already loaded — attach immediately
    if ((window as any).google?.maps?.places?.Autocomplete) {
      initAutocomplete();
      return;
    }

    // Script tag already injected — piggyback on existing callback
    if (document.querySelector('script[data-gmaps]')) {
      const prev = (window as any)[CB];
      (window as any)[CB] = () => { prev?.(); initAutocomplete(); };
      return;
    }

    setScriptLoading(true);

    // Register callback BEFORE injecting the script tag
    (window as any)[CB] = () => {
      setScriptLoading(false);
      initAutocomplete();
    };

    const script = document.createElement('script');
    // NOTE: do NOT mix loading=async with callback= — they are mutually exclusive
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsApiKey}&libraries=places&callback=${CB}`;
    script.async = true;
    script.defer = true;
    script.dataset.gmaps = '1';
    script.onerror = () => {
      setScriptLoading(false);
      console.warn('Google Maps script failed to load. Check API key restrictions.');
    };
    document.head.appendChild(script);
  }, [config, initAutocomplete]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pl-9 pr-8 ${className}`}
        data-testid={testId}
        autoComplete="off"
      />
      {scriptLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
