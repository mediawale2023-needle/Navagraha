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

// Global callback name to avoid conflicts
const GMAPS_CALLBACK = '__gmapsReady__';

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

  // Keep refs in sync without triggering effects
  onChangeRef.current = onChange;
  onPlaceSelectRef.current = onPlaceSelect;

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ['/api/config'],
  });

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current) return;
    const g = (window as any).google;
    if (!g?.maps?.places) return;
    try {
      const ac = new g.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry', 'name'],
        types: ['(cities)'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        const address = place.formatted_address || place.name || '';
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        onChangeRef.current(address);
        onPlaceSelectRef.current?.({ address, lat, lng });
      });
      autocompleteRef.current = ac;
    } catch {
      // silently fail — user can still type manually
    } finally {
      setScriptLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!config?.googleMapsApiKey) return;

    // Already loaded — init immediately
    if ((window as any).google?.maps?.places) {
      initAutocomplete();
      return;
    }

    // Script already injected — wait for callback
    if (document.querySelector('script[data-gmaps]')) {
      // Register to be called when it finishes loading
      const prev = (window as any)[GMAPS_CALLBACK];
      (window as any)[GMAPS_CALLBACK] = () => {
        prev?.();
        initAutocomplete();
      };
      return;
    }

    setScriptLoading(true);

    // Register global callback before injecting script
    (window as any)[GMAPS_CALLBACK] = () => {
      initAutocomplete();
      setScriptLoading(false);
    };

    const script = document.createElement('script');
    // Use callback= for reliable async loading; loading=async for performance
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsApiKey}&libraries=places&loading=async&callback=${GMAPS_CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.dataset.gmaps = '1';
    script.onerror = () => setScriptLoading(false);
    document.head.appendChild(script);
  }, [config, initAutocomplete]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-3 w-5 h-5 text-muted-foreground z-10" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pl-10 pr-8 ${className}`}
        data-testid={testId}
        autoComplete="off"
      />
      {scriptLoading && (
        <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
