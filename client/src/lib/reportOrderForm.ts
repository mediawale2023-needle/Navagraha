/** A saved chart as GET /api/kundli lists it (only the fields the report dialog reads). */
export interface SavedChart {
  id: string;
  name: string;
  dateOfBirth?: string | null;
  timeOfBirth?: string | null;
  placeOfBirth?: string | null;
  listStatus?: 'v3' | 'recalculated' | 'limited';
}

/** "15 May 1990 · 14:30 · Khamgaon, Maharashtra": what identifies a saved chart in the picker. */
export function chartSummary(c: SavedChart): string {
  const day = c.dateOfBirth ? new Date(c.dateOfBirth) : null;
  const date = day && !Number.isNaN(day.getTime())
    ? day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;
  return [date, c.timeOfBirth || null, c.placeOfBirth || null].filter(Boolean).join(' · ');
}

/** A chart without coordinates or a valid time cannot be reported on (the server refuses it). */
export function chartOrderable(c: SavedChart): boolean {
  return c.listStatus !== 'limited';
}

export interface BirthEntry { name: string; dateOfBirth: string; timeOfBirth: string; placeOfBirth: string }

/**
 * Entered birth details are complete only with a place picked from the suggestions: its
 * coordinates fix the Ascendant and the historical time zone, and free text never does.
 */
export function birthDetailsReady(birth: BirthEntry, coords: { lat: number; lng: number } | null): boolean {
  return Boolean(birth.name.trim() && birth.dateOfBirth && birth.timeOfBirth && birth.placeOfBirth.trim() && coords);
}
