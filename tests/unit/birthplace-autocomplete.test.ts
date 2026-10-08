import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MIN_QUERY_LENGTH,
  PlaceLookupError,
  fetchPlaceSuggestions,
  isValidCoordinate,
  nextActiveIndex,
  placesLibrary,
  type PlacesLibrary,
} from '../../client/src/lib/placeSearch';
import { resolveBirthCoords } from '../../server/geocode';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';

const component = readFileSync('client/src/components/PlacesAutocomplete.tsx', 'utf8');
const kundliNew = readFileSync('client/src/pages/KundliNew.tsx', 'utf8');

const text = (s: string) => ({ toString: () => s });

/** A Places API (New) double; `location` mirrors google.maps.LatLng. Values recorded from the live API. */
function fakePlaces(opts: {
  predictions?: Array<{ placeId: string; main: string; secondary: string; address?: string; lat?: number; lng?: number }>;
  fail?: Error;
  detailsFail?: Error;
} = {}) {
  const fetchAutocompleteSuggestions = vi.fn(async (_req: { input: string; includedPrimaryTypes?: string[]; sessionToken?: unknown }) => {
    if (opts.fail) throw opts.fail;
    return {
      suggestions: (opts.predictions ?? []).map((p) => ({
        placePrediction: {
          placeId: p.placeId,
          text: text(`${p.main}, ${p.secondary}`),
          mainText: text(p.main),
          secondaryText: text(p.secondary),
          toPlace: () => {
            const place: any = {
              fetchFields: vi.fn(async () => {
                if (opts.detailsFail) throw opts.detailsFail;
                place.formattedAddress = p.address;
                place.location = p.lat === undefined ? null : { lat: () => p.lat, lng: () => p.lng };
              }),
            };
            return place;
          },
        },
      })),
    };
  });
  const lib = { AutocompleteSuggestion: { fetchAutocompleteSuggestions }, AutocompleteSessionToken: class {} } as unknown as PlacesLibrary;
  return { lib, fetchAutocompleteSuggestions };
}

const VARANASI = { placeId: 'ChIJ-varanasi', main: 'Varanasi', secondary: 'Uttar Pradesh, India', address: 'Varanasi, Uttar Pradesh, India', lat: 25.317645199999998, lng: 82.9739144 };
const VALENCIA = { placeId: 'ChIJ-valencia', main: 'Valencia', secondary: 'Spain', address: 'Valencia, Spain', lat: 39.4699075, lng: -0.3762881 };

describe('birthplace search (Places API New)', () => {
  it('does not query Google until the minimum length, so the first keystroke never reaches the API', async () => {
    const { lib, fetchAutocompleteSuggestions } = fakePlaces({ predictions: [VARANASI] });
    expect(await fetchPlaceSuggestions(lib, 'V', null)).toEqual([]);
    expect(await fetchPlaceSuggestions(lib, '  V ', null)).toEqual([]);
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it('searches cities with the session token and maps each prediction to a two-line suggestion', async () => {
    const { lib, fetchAutocompleteSuggestions } = fakePlaces({ predictions: [VARANASI, VALENCIA] });
    const token = {};
    const list = await fetchPlaceSuggestions(lib, ' Va ', token);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({ input: 'Va', includedPrimaryTypes: ['(cities)'], sessionToken: token });
    expect(list.map(({ id, primary, secondary }) => ({ id, primary, secondary }))).toEqual([
      { id: 'ChIJ-varanasi', primary: 'Varanasi', secondary: 'Uttar Pradesh, India' },
      { id: 'ChIJ-valencia', primary: 'Valencia', secondary: 'Spain' },
    ]);
  });

  it('every successive prefix of a continuously typed name is searched as typed, never truncated', async () => {
    const { lib, fetchAutocompleteSuggestions } = fakePlaces({ predictions: [VARANASI] });
    const name = 'Varanasi, Uttar Pradesh';
    for (let i = 1; i <= name.length; i++) await fetchPlaceSuggestions(lib, name.slice(0, i), null);
    const inputs = fetchAutocompleteSuggestions.mock.calls.map(([req]) => req.input);
    expect(inputs.at(-1)).toBe(name);
    expect(inputs).toHaveLength(name.length - 1);
  });

  it('returns an empty list (not an error) when nothing matches, and drops predictions without a place id', async () => {
    expect(await fetchPlaceSuggestions(fakePlaces({ predictions: [] }).lib, 'zzqxjvwk', null)).toEqual([]);
    const { lib } = fakePlaces({ predictions: [{ ...VARANASI, placeId: '' }] });
    expect(await fetchPlaceSuggestions(lib, 'Varanasi', null)).toEqual([]);
  });

  it('propagates API errors so the field can show its error state', async () => {
    const { lib } = fakePlaces({ fail: new Error('ApiTargetBlockedMapError') });
    await expect(fetchPlaceSuggestions(lib, 'Mumbai', null)).rejects.toThrow('ApiTargetBlockedMapError');
  });

  it('selecting a suggestion yields the exact address and coordinates Google returned', async () => {
    const [s] = await fetchPlaceSuggestions(fakePlaces({ predictions: [VARANASI] }).lib, 'Varanasi', null);
    expect(await s.select()).toEqual({ address: 'Varanasi, Uttar Pradesh, India', lat: 25.317645199999998, lng: 82.9739144 });
  });

  it('keeps western/southern coordinates signed (no abs, no rounding)', async () => {
    const [s] = await fetchPlaceSuggestions(fakePlaces({ predictions: [VALENCIA] }).lib, 'Valencia', null);
    expect(await s.select()).toMatchObject({ lat: 39.4699075, lng: -0.3762881 });
  });

  it('never substitutes coordinates: a place without a location, or with invalid ones, rejects', async () => {
    for (const bad of [{ lat: undefined }, { lat: Number.NaN, lng: 10 }, { lat: 95, lng: 10 }, { lat: 10, lng: 181 }]) {
      const [s] = await fetchPlaceSuggestions(fakePlaces({ predictions: [{ ...VARANASI, ...bad }] }).lib, 'Varanasi', null);
      await expect(s.select()).rejects.toBeInstanceOf(PlaceLookupError);
    }
    const [s] = await fetchPlaceSuggestions(fakePlaces({ predictions: [VARANASI], detailsFail: new Error('details down') }).lib, 'Varanasi', null);
    await expect(s.select()).rejects.toThrow('details down');
  });

  it('validates coordinates strictly', () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-33.8688, 151.2093)).toBe(true);
    expect(isValidCoordinate('19', 72)).toBe(false);
    expect(isValidCoordinate(Infinity, 72)).toBe(false);
    expect(isValidCoordinate(-91, 72)).toBe(false);
  });

  it('only treats a page as ready when Places API (New) is loaded, not the legacy widget alone', () => {
    expect(placesLibrary(undefined)).toBeNull();
    expect(placesLibrary({ google: { maps: { places: { Autocomplete: class {}, AutocompleteService: class {} } } } })).toBeNull();
    const places = { AutocompleteSuggestion: { fetchAutocompleteSuggestions() {} }, AutocompleteSessionToken: class {} };
    expect(placesLibrary({ google: { maps: { places } } })).toBe(places);
  });

  it('arrow keys wrap through the list', () => {
    expect(nextActiveIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(nextActiveIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(nextActiveIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(nextActiveIndex(-1, 3, 'ArrowUp')).toBe(2);
    expect(nextActiveIndex(0, 0, 'ArrowDown')).toBe(-1);
  });
});

describe('PlacesAutocomplete keeps the field usable (focus retention)', () => {
  it('never hands the input to the legacy Google widget, which disables it on an API error', () => {
    expect(component).not.toMatch(/places\.Autocomplete\b|\.Autocomplete\(/);
    expect(component).not.toMatch(/AutocompleteService|PlacesService/);
    expect(component).not.toMatch(/\bdisabled=/);
  });

  it('renders the input as controlled by its value prop, with no mirrored state that can reset it mid-typing', () => {
    expect(component).toMatch(/value=\{value\}/);
    expect(component).not.toMatch(/useState\(value\)/);
  });

  it('options keep focus in the input on mouse/touch and are reachable by keyboard', () => {
    expect(component).toMatch(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
    expect(component).toMatch(/role="combobox"/);
    expect(component).toMatch(/role="listbox"/);
    expect(component).toMatch(/role="option"/);
    expect(component).toMatch(/aria-activedescendant/);
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) expect(component).toContain(`'${key}'`);
  });

  it('ignores stale responses so a slow earlier query cannot replace newer suggestions', () => {
    expect(component).toMatch(/seq !== seqRef\.current/);
  });

  it('shows loading, empty, error and unavailable states instead of failing silently', () => {
    for (const s of ['loading', 'empty', 'error', 'unavailable']) expect(component).toMatch(new RegExp(`\\b${s}: '`));
  });

  it('the pin icon is not stacked over the text (input is padded on both icon sides)', () => {
    expect(component).toMatch(/pl-9 pr-9/);
    expect(component).toMatch(/left-3 top-1\/2[^"]*pointer-events-none/);
  });
});

describe('Kundli form location data integrity', () => {
  it('typing clears coordinates and only a picked place sets them', () => {
    expect(kundliNew).toMatch(/field\.onChange\(value\);\s*setCoordinates\(null\);/);
    expect(kundliNew).toMatch(/onPlaceSelect=\{\(place\) => \{\s*setCoordinates\(\{ lat: place\.lat, lng: place\.lng \}\);/);
    expect(kundliNew).toMatch(/latitude: coordinates\?\.lat,\s*longitude: coordinates\?\.lng,/);
  });

  it('coordinates from a picked place are used as supplied and give the place its historical time zone', async () => {
    const coords = await resolveBirthCoords(VARANASI.lat, VARANASI.lng, 'Varanasi, Uttar Pradesh, India');
    expect(coords).toEqual({ lat: VARANASI.lat, lng: VARANASI.lng });
    const birth = resolveBirthWithCoordinates({ date: '1990-05-15', time: '10:30', place: VARANASI.address, latitude: coords!.lat, longitude: coords!.lng, timeAccuracy: 'exact' });
    expect(birth).toMatchObject({ timezone: 'Asia/Kolkata', utcOffset: '+05:30', coordinateSource: 'supplied', timezoneSource: 'coordinates', birthUTC: '1990-05-15T05:00:00.000Z' });

    const valencia = resolveBirthWithCoordinates({ date: '1990-07-01', time: '12:00', place: VALENCIA.address, latitude: VALENCIA.lat, longitude: VALENCIA.lng, timeAccuracy: 'exact' });
    expect(valencia).toMatchObject({ timezone: 'Europe/Madrid', utcOffset: '+02:00' });
  });
});
