/**
 * Server-side geocoding of a birth place to coordinates, so a chart is never
 * computed from a fabricated/default location (a wrong Ascendant ruins every
 * downstream prediction). Uses the Google Geocoding API when a key is present;
 * degrades to null (caller must refuse) otherwise.
 */
export async function geocodePlace(place: string | undefined | null): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const query = (place || '').trim();
  if (!key || !query) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
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
  const lat = latitude != null && latitude !== '' ? parseFloat(String(latitude)) : NaN;
  const lon = longitude != null && longitude !== '' ? parseFloat(String(longitude)) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lng: lon };
  return geocodePlace(placeOfBirth);
}
