/** The city a viewer last chose for Panchang timings, remembered in this browser only. */
export interface PanchangPlace { name: string; lat: number; lng: number }

const KEY = 'navagraha.panchangPlace';

export function loadPanchangPlace(): PanchangPlace | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return p && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  } catch {
    return null;
  }
}

export function savePanchangPlace(place: PanchangPlace): void {
  try { localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* storage unavailable: the choice lasts this visit only */ }
}

/** The device's calendar date (toISOString would give the UTC date). */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function panchangUrl(date: string, place: PanchangPlace | null): string {
  const params = new URLSearchParams({ date });
  if (place) { params.set('lat', String(place.lat)); params.set('lng', String(place.lng)); params.set('place', place.name); }
  return `/api/panchang?${params}`;
}
