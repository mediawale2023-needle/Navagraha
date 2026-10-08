/**
 * Recreating a chart the V3 engine could not recalculate (no stored birth place):
 * carry over the person's details, never the place, which must be picked again
 * so its coordinates and time zone are exact.
 */
export interface ChartPrefill {
  name?: string;
  gender?: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  timeOfBirth?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const GENDERS = new Set(['male', 'female', 'other']);

/** The stored birth date as YYYY-MM-DD, read from its ISO prefix so no time zone can shift the day. */
function datePart(value: unknown): string | undefined {
  const s = typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : '';
  const d = s.slice(0, 10);
  return DATE.test(d) ? d : undefined;
}

export function recreateHref(k: { name?: string | null; gender?: string | null; dateOfBirth?: unknown; timeOfBirth?: string | null }): string {
  const params = new URLSearchParams();
  if (k.name) params.set('name', k.name);
  if (k.gender && GENDERS.has(k.gender)) params.set('gender', k.gender);
  const dob = datePart(k.dateOfBirth);
  if (dob) params.set('dob', dob);
  const tob = (k.timeOfBirth ?? '').slice(0, 5);
  if (TIME.test(tob)) params.set('tob', tob);
  const q = params.toString();
  return q ? `/kundli/new?${q}` : '/kundli/new';
}

export function prefillFromSearch(search: string): ChartPrefill {
  const p = new URLSearchParams(search);
  const out: ChartPrefill = {};
  const name = p.get('name')?.trim();
  if (name) out.name = name.slice(0, 100);
  const gender = p.get('gender');
  if (gender && GENDERS.has(gender)) out.gender = gender as ChartPrefill['gender'];
  const dob = p.get('dob');
  if (dob && DATE.test(dob) && !Number.isNaN(Date.parse(dob))) out.dateOfBirth = dob;
  const tob = p.get('tob');
  if (tob && TIME.test(tob)) out.timeOfBirth = tob;
  return out;
}
