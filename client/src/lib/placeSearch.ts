/**
 * Birth-place search over Google Places API (New): `AutocompleteSuggestion` for the
 * list and `Place.fetchFields` for the picked place's coordinates.
 *
 * The legacy `places.Autocomplete` widget is deliberately not used: it takes over
 * the <input>, and when the key cannot call the legacy API it disables the field
 * mid-typing (dropping focus) and paints its own error icon over ours.
 */

export const MIN_QUERY_LENGTH = 2;

export interface SelectedPlace {
  address: string;
  lat: number;
  lng: number;
}

export interface PlaceSuggestion {
  id: string;
  primary: string;
  secondary: string;
  /** Looks up the place's coordinates; rejects rather than returning a guessed location. */
  select(): Promise<SelectedPlace>;
}

/** The subset of `google.maps.places` this module calls. */
export interface PlacesLibrary {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      includedPrimaryTypes?: string[];
      sessionToken?: unknown;
    }): Promise<{ suggestions: Array<{ placePrediction?: PlacePrediction | null }> }>;
  };
  AutocompleteSessionToken: new () => unknown;
}

interface PlacePrediction {
  placeId: string;
  text?: { toString(): string } | null;
  mainText?: { toString(): string } | null;
  secondaryText?: { toString(): string } | null;
  toPlace(): {
    fetchFields(options: { fields: string[] }): Promise<unknown>;
    formattedAddress?: string | null;
    displayName?: string | null;
    location?: { lat(): number; lng(): number } | null;
  };
}

export class PlaceLookupError extends Error {}

/** `google.maps.places` when Places API (New) is loaded, else null. */
export function placesLibrary(win: unknown): PlacesLibrary | null {
  const places = (win as any)?.google?.maps?.places;
  return places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions && places.AutocompleteSessionToken ? places : null;
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const str = (v: { toString(): string } | null | undefined) => (v ? v.toString() : '');

export async function fetchPlaceSuggestions(places: PlacesLibrary, input: string, sessionToken: unknown): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (query.length < MIN_QUERY_LENGTH) return [];
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    includedPrimaryTypes: ['(cities)'],
    sessionToken,
  });
  return suggestions.flatMap(({ placePrediction: p }) => {
    if (!p?.placeId) return [];
    const full = str(p.text);
    const primary = str(p.mainText) || full;
    if (!primary) return [];
    return [{ id: p.placeId, primary, secondary: str(p.secondaryText), select: () => resolvePlace(p, full || primary) }];
  });
}

async function resolvePlace(prediction: PlacePrediction, label: string): Promise<SelectedPlace> {
  const place = prediction.toPlace();
  await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
  const lat = place.location?.lat();
  const lng = place.location?.lng();
  if (!isValidCoordinate(lat, lng)) throw new PlaceLookupError('This place has no usable coordinates.');
  return { address: place.formattedAddress || place.displayName || label, lat: lat as number, lng: lng as number };
}

/** Arrow-key movement through the list, wrapping at both ends; -1 means nothing highlighted. */
export function nextActiveIndex(current: number, count: number, key: 'ArrowDown' | 'ArrowUp'): number {
  if (count === 0) return -1;
  if (key === 'ArrowDown') return current >= count - 1 ? 0 : current + 1;
  return current <= 0 ? count - 1 : current - 1;
}
