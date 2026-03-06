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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep refs in sync without triggering effects
  onChangeRef.current = onChange;
  onPlaceSelectRef.current = onPlaceSelect;

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ['/api/config'],
  });

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current) return;

    const ac = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'geometry', 'name', 'address_components'],
      types: ['(cities)'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry || !place.geometry.location) return;

      const address = place.formatted_address || place.name || '';
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      onChangeRef.current(address);
      onPlaceSelectRef.current?.({ address, lat, lng });
    });

    autocompleteRef.current = ac;
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (config === undefined) return;
    if (!config.googleMapsApiKey) {
      setError('Google Maps API key not configured');
      setIsLoading(false);
      return;
    }

    setError(null);

    // Already loaded
    if ((window as any).google?.maps?.places) {
      initAutocomplete();
      return;
    }

    // Load script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsApiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => initAutocomplete();
    script.onerror = () => {
      setError('Failed to load Google Maps');
      setIsLoading(false);
    };
    document.head.appendChild(script);
  }, [config, initAutocomplete]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pl-10 pr-8 ${className}`}
        data-testid={testId}
      />
      {isLoading && !error && (
        <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-muted-foreground" />
      )}
      {error && (
        <p className="text-xs text-muted-foreground mt-1">
          {error}. Please enter location manually.
        </p>
      )}
    </div>
  );
}
