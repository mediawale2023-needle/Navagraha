import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  MIN_QUERY_LENGTH,
  fetchPlaceSuggestions,
  nextActiveIndex,
  placesLibrary,
  type PlaceSuggestion,
  type PlacesLibrary,
  type SelectedPlace,
} from '@/lib/placeSearch';

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: SelectedPlace) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

const CB = '__gmapsReady__';
const DEBOUNCE_MS = 250;

let placesPromise: Promise<PlacesLibrary | null> | null = null;

/** Loads the Maps JS places library once per page; resolves null if it cannot load. */
function loadPlaces(apiKey: string): Promise<PlacesLibrary | null> {
  const ready = placesLibrary(window);
  if (ready) return Promise.resolve(ready);
  if (placesPromise) return placesPromise;
  placesPromise = new Promise((resolve) => {
    (window as any)[CB] = () => resolve(placesLibrary(window));
    const script = document.createElement('script');
    // NOTE: do NOT mix loading=async with callback= — they are mutually exclusive
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${CB}`;
    script.async = true;
    script.dataset.gmaps = '1';
    script.onerror = () => {
      placesPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return placesPromise;
}

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'unavailable';

const MESSAGES: Partial<Record<Status, string>> = {
  loading: 'Searching places…',
  empty: 'No matching places. Check the spelling.',
  error: 'Place search is not responding. Please try again.',
  unavailable: 'Place suggestions could not load. Check your connection and reload the page.',
};

export function PlacesAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = 'Enter location',
  className = '',
  testId = 'input-place',
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: PlacesAutocompleteProps) {
  const listId = useId();
  const [places, setPlaces] = useState<PlacesLibrary | null>(null);
  const [mapsFailed, setMapsFailed] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const tokenRef = useRef<unknown>(null);

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({ queryKey: ['/api/config'] });
  const apiKey = config?.googleMapsApiKey;

  useEffect(() => {
    if (!apiKey) return;
    let live = true;
    loadPlaces(apiKey).then((lib) => {
      if (!live) return;
      setPlaces(lib);
      setMapsFailed(!lib);
    });
    return () => { live = false; };
  }, [apiKey]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const search = (query: string, lib: PlacesLibrary) => {
    const seq = ++seqRef.current;
    clearTimeout(timerRef.current);
    setActive(-1);
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    timerRef.current = setTimeout(async () => {
      tokenRef.current ??= new lib.AutocompleteSessionToken();
      try {
        const found = await fetchPlaceSuggestions(lib, query, tokenRef.current);
        if (seq !== seqRef.current) return;
        setSuggestions(found);
        setStatus(found.length ? 'ready' : 'empty');
      } catch (e) {
        if (seq !== seqRef.current) return;
        console.warn('Place search failed:', e);
        setSuggestions([]);
        setStatus('error');
      }
    }, DEBOUNCE_MS);
  };

  // A query typed while the library was still loading is searched once it arrives.
  useEffect(() => {
    if (places && document.activeElement === inputRef.current) search(value, places);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  const choose = async (s: PlaceSuggestion) => {
    const seq = ++seqRef.current;
    setResolving(true);
    try {
      const place = await s.select();
      if (seq !== seqRef.current) return;
      tokenRef.current = null;
      onChange(place.address);
      onPlaceSelect?.(place);
      setSuggestions([]);
      setStatus('idle');
      setOpen(false);
    } catch (e) {
      if (seq !== seqRef.current) return;
      console.warn('Place lookup failed:', e);
      setStatus('error');
    } finally {
      if (seq === seqRef.current) setResolving(false);
    }
  };

  const shownStatus: Status = mapsFailed && value.trim().length >= MIN_QUERY_LENGTH ? 'unavailable' : status;
  const message = resolving ? 'Getting location…' : MESSAGES[shownStatus];
  const showList = open && shownStatus === 'ready' && suggestions.length > 0 && !resolving;
  const showPanel = open && (showList || !!message);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden />
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          setOpen(true);
          if (places) search(next, places);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!suggestions.length) return;
            e.preventDefault();
            setOpen(true);
            setActive((i) => nextActiveIndex(i, suggestions.length, e.key as 'ArrowDown' | 'ArrowUp'));
          } else if (e.key === 'Enter' && showList && active >= 0) {
            e.preventDefault();
            choose(suggestions[active]);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={`flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${className}`}
        data-testid={testId}
        autoComplete="off"
        spellCheck={false}
      />
      {(shownStatus === 'loading' || resolving) && open && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" aria-hidden />
      )}
      {showPanel && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[10px] border border-border bg-popover text-popover-foreground shadow-md"
          data-testid={`${testId}-panel`}
        >
          {showList ? (
            <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1" data-testid={`${testId}-suggestions`}>
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(s)}
                  className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${i === active ? 'bg-muted' : ''}`}
                  data-testid={`${testId}-option`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{s.primary}</span>
                    {s.secondary && <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" aria-live="polite" className="px-3 py-2 text-xs text-muted-foreground" data-testid={`${testId}-status`}>
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
