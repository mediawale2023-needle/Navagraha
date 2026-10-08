/**
 * Birth resolution: local civil birth date/time + place → coordinates, IANA
 * time zone, the historical UTC offset in force at that instant, and the UTC
 * birth instant. Nothing here is assumed: no default city, no default zone,
 * no default time. Anything that cannot be resolved unambiguously throws a
 * BirthInputError so the caller returns 400 before any calculation.
 *
 * Offsets come from the IANA tz database shipped with Node's ICU, which carries
 * historical rules (e.g. India's 1942–45 war time of +06:30, pre-1906 Madras
 * time of +05:21:10, US/EU daylight saving history).
 */
// The 'all' dataset keeps zones whose pre-1970 history differs (default merges them).
import { find as findTimeZones } from 'geo-tz/all';
import { BirthInputError } from './errors.js';
import { geocodePlace, validCoordinates } from '../geocode.js';

export type TimeAccuracy = 'exact' | 'approximate';

export interface BirthInput {
  date: string;            // YYYY-MM-DD (local civil date at the birthplace)
  time: string;            // HH:MM or HH:MM:SS (local civil time)
  place?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  timezone?: string | null;  // explicit IANA zone; otherwise looked up from coordinates
  utcOffset?: string | null; // only to disambiguate a repeated hour at a DST fall-back
  timeAccuracy: TimeAccuracy;
}

export interface ResolvedBirth {
  localDate: string;
  localTime: string;       // always HH:MM:SS
  place: string;
  latitude: number;
  longitude: number;
  timezone: string;
  utcOffset: string;       // ±HH:MM or ±HH:MM:SS (historical LMT offsets carry seconds)
  utcOffsetSeconds: number;
  birthUTC: string;        // ISO-8601 instant
  timeAccuracy: TimeAccuracy;
  coordinateSource: 'supplied' | 'geocoded';
  timezoneSource: 'supplied' | 'coordinates';
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const OFFSET_RE = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (seconds east of UTC) of `timeZone` at the given instant. */
export function offsetSecondsAt(timeZone: string, epochMs: number): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(epochMs))
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  if (part === 'GMT') return 0;
  const m = /^GMT([+-])(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(part);
  if (!m) throw new BirthInputError(`Unable to read the UTC offset for time zone ${timeZone}`);
  const secs = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return m[1] === '-' ? -secs : secs;
}

export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  const ss = abs % 60;
  return `${sign}${hh}:${mm}${ss ? `:${String(ss).padStart(2, '0')}` : ''}`;
}

function parseOffset(value: string): number {
  const m = OFFSET_RE.exec(value.trim());
  if (!m) throw new BirthInputError('utcOffset must look like +05:30 or -04:00');
  const secs = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return m[1] === '-' ? -secs : secs;
}

export function parseLocalDateTime(date: string, time: string) {
  const d = DATE_RE.exec(typeof date === 'string' ? date.trim() : '');
  const t = TIME_RE.exec(typeof time === 'string' ? time.trim() : '');
  if (!d) throw new BirthInputError('Birth date must be a valid YYYY-MM-DD date');
  if (!t) throw new BirthInputError('Birth time must be HH:MM or HH:MM:SS between 00:00 and 23:59:59');
  const [y, mo, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hh, mm, ss] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  // The wall-clock reading expressed as if it were UTC; real UTC = this − offset.
  const wallMs = Date.UTC(y, mo - 1, day, hh, mm, ss);
  const check = new Date(wallMs);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== day) {
    throw new BirthInputError('Birth date must be a valid calendar date');
  }
  const localTime = `${t[1]}:${t[2]}:${t[3] ?? '00'}`;
  return { wallMs, localDate: d[0], localTime };
}

/**
 * Convert a local wall-clock reading in `timeZone` to a UTC instant. Rejects
 * times that never occurred (spring-forward gap) and, unless `utcOffset`
 * selects one, times that occurred twice (fall-back fold).
 */
export function localToUtc(wallMs: number, timeZone: string, utcOffset?: string | null): { utcMs: number; offsetSeconds: number } {
  // Every offset that could apply is one in force within a day of the reading.
  const probes = [-36, -12, 0, 12, 36].map((h) => offsetSecondsAt(timeZone, wallMs + h * 3600_000));
  const candidates = Array.from(new Set(probes));
  const valid = candidates.filter((off) => offsetSecondsAt(timeZone, wallMs - off * 1000) === off);

  if (utcOffset) {
    const wanted = parseOffset(utcOffset);
    if (!valid.includes(wanted)) {
      throw new BirthInputError(`utcOffset ${utcOffset} is not valid for ${timeZone} at that local time`);
    }
    return { utcMs: wallMs - wanted * 1000, offsetSeconds: wanted };
  }
  if (valid.length === 0) {
    throw new BirthInputError(`That local time did not exist in ${timeZone} (clocks moved forward). Please check the birth time.`);
  }
  if (valid.length > 1) {
    const opts = valid.map(formatOffset).join(' or ');
    throw new BirthInputError(`That local time occurred twice in ${timeZone} (clocks moved back). Please specify the UTC offset (${opts}).`);
  }
  return { utcMs: wallMs - valid[0] * 1000, offsetSeconds: valid[0] };
}

/** IANA zone for coordinates; ambiguous border points must be disambiguated by the caller. */
export function timeZoneForCoordinates(lat: number, lng: number, atUtcMs?: number): string {
  const zones = findTimeZones(lat, lng);
  if (zones.length === 0) throw new BirthInputError('Could not determine the time zone for the birth place');
  if (zones.length === 1) return zones[0];
  // Distinct zone names that agree on the offset at the birth instant are interchangeable.
  if (atUtcMs !== undefined) {
    const offsets = new Set(zones.map((z) => offsetSecondsAt(z, atUtcMs)));
    if (offsets.size === 1) return zones[0];
  }
  throw new BirthInputError(`The birth place lies on a time-zone boundary (${zones.join(', ')}). Please specify the time zone.`);
}

/** Resolve with already-known coordinates (no network). */
export function resolveBirthWithCoordinates(
  input: Omit<BirthInput, 'latitude' | 'longitude'> & { latitude: number; longitude: number },
  coordinateSource: ResolvedBirth['coordinateSource'] = 'supplied',
): ResolvedBirth {
  const coords = validCoordinates(input.latitude, input.longitude);
  if (!coords) throw new BirthInputError('Valid birth coordinates are required');
  if (input.timeAccuracy !== 'exact' && input.timeAccuracy !== 'approximate') {
    throw new BirthInputError('timeAccuracy must be "exact" or "approximate"');
  }
  const { wallMs, localDate, localTime } = parseLocalDateTime(input.date, input.time);

  let timezone: string;
  let timezoneSource: ResolvedBirth['timezoneSource'];
  if (input.timezone) {
    if (!isValidTimeZone(input.timezone)) throw new BirthInputError(`Unknown time zone: ${input.timezone}`);
    timezone = input.timezone;
    timezoneSource = 'supplied';
  } else {
    // Wall time is within ±14h of UTC, close enough to compare border-zone offsets.
    timezone = timeZoneForCoordinates(coords.lat, coords.lng, wallMs);
    timezoneSource = 'coordinates';
  }

  const { utcMs, offsetSeconds } = localToUtc(wallMs, timezone, input.utcOffset);
  return {
    localDate,
    localTime,
    place: (input.place ?? '').toString().trim(),
    latitude: coords.lat,
    longitude: coords.lng,
    timezone,
    utcOffset: formatOffset(offsetSeconds),
    utcOffsetSeconds: offsetSeconds,
    birthUTC: new Date(utcMs).toISOString(),
    timeAccuracy: input.timeAccuracy,
    coordinateSource,
    timezoneSource,
  };
}

/** Full resolution: supplied coordinates, else geocode the supplied place, else 400. */
export async function resolveBirth(input: BirthInput): Promise<ResolvedBirth> {
  const supplied = validCoordinates(input.latitude, input.longitude);
  if (supplied) return resolveBirthWithCoordinates({ ...input, latitude: supplied.lat, longitude: supplied.lng }, 'supplied');
  const geocoded = await geocodePlace(input.place ?? undefined);
  if (!geocoded) {
    throw new BirthInputError('Could not determine coordinates for the birth place. Please choose the place from the suggestions.');
  }
  return resolveBirthWithCoordinates({ ...input, latitude: geocoded.lat, longitude: geocoded.lng }, 'geocoded');
}
