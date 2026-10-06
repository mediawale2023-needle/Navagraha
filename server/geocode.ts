/** Accept numeric coordinates only, including genuine zero coordinates. */
export function validCoordinates(latitude: unknown, longitude: unknown): { lat: number; lng: number } | null {
  const numeric = (value: unknown) =>
    typeof value === 'number' ? value :
    typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  const lat = numeric(latitude), lng = numeric(longitude);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/**
 * Server-side geocoding of a birth place to coordinates, so a chart is never
 * computed from a fabricated/default location (a wrong Ascendant ruins every
 * downstream prediction). Uses the Google Geocoding API when a key is present;
 * degrades to null (caller must refuse) otherwise.
 */
export async function geocodePlace(place: string | undefined | null): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const query = typeof place === 'string' ? place.trim() : '';
  if (!key || !query) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    return validCoordinates(loc?.lat, loc?.lng);
  } catch {
    return null;
  }
}

/**
 * Resolve coordinates from explicit lat/long or, failing that, by geocoding the
 * place name. Returns null when no reliable location can be determined.
 */
export async function resolveBirthCoords(
  latitude: unknown,
  longitude: unknown,
  placeOfBirth?: string,
): Promise<{ lat: number; lng: number } | null> {
  const coords = validCoordinates(latitude, longitude);
  if (coords) return coords;
  return geocodePlace(placeOfBirth);
}
