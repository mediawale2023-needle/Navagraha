import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ['/api/config'],
  });

  useEffect(() => {
    if (!config?.googleMapsApiKey) {
      setError('Google Maps API key not configured');
      setIsLoading(false);
      return;
    }

    const apiKey = config.googleMapsApiKey;

    const loadGoogleMaps = async () => {
      try {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAutocomplete`;
        script.async = true;
        script.defer = true;

        (window as any).initAutocomplete = () => {
          if (!inputRef.current) return;

          const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
            fields: ['formatted_address', 'geometry', 'name', 'address_components'],
            types: ['(cities)'],
          });

          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            
            if (!place.geometry || !place.geometry.location) {
              return;
            }

            const address = place.formatted_address || place.name || '';
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();

            onChange(address);
            
            if (onPlaceSelect) {
              onPlaceSelect({ address, lat, lng });
            }
          });

          setIsLoading(false);
        };

        document.head.appendChild(script);
      } catch (err) {
        console.error('Error loading Google Maps:', err);
        setError('Failed to load Google Maps');
        setIsLoading(false);
      }
    };

    if (!(window as any).google || !(window as any).google.maps || !(window as any).google.maps.places) {
      loadGoogleMaps();
    } else {
      // Google Maps already loaded, initialize directly
      if (inputRef.current) {
        const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'geometry', 'name', 'address_components'],
          types: ['(cities)'],
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          
          if (!place.geometry || !place.geometry.location) {
            return;
          }

          const address = place.formatted_address || place.name || '';
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          onChange(address);
          
          if (onPlaceSelect) {
            onPlaceSelect({ address, lat, lng });
          }
        });

        setIsLoading(false);
      }
    }

    return () => {
      delete (window as any).initAutocomplete;
    };
  }, [config, onChange, onPlaceSelect]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isLoading ? 'Loading autocomplete...' : placeholder}
        className={`pl-10 ${className}`}
        disabled={isLoading}
        data-testid={testId}
      />
      {error && (
        <p className="text-xs text-muted-foreground mt-1">
          {error}. Please enter location manually.
        </p>
      )}
    </div>
  );
}
