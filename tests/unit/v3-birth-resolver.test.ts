import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBirth, resolveBirthWithCoordinates, localToUtc, parseLocalDateTime } from '../../server/astroEngine/birthResolver';
import { BirthInputError } from '../../server/astroEngine/errors';

const at = (date: string, time: string, latitude: number, longitude: number, extra: Record<string, unknown> = {}) =>
  resolveBirthWithCoordinates({ date, time, latitude, longitude, timeAccuracy: 'exact', ...extra } as any);

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

// Expected offsets are tz-database facts, not engine output.
describe('historical UTC offsets', () => {
  it.each([
    ['Bengaluru, modern IST', '1990-08-15', '06:30', 12.9716, 77.5946, 'Asia/Kolkata', '+05:30', '1990-08-15T01:00:00.000Z'],
    ['Kolkata, 1942–45 war time', '1943-06-01', '12:00', 22.5726, 88.3639, 'Asia/Kolkata', '+06:30', '1943-06-01T05:30:00.000Z'],
    ['New York, summer EDT', '1990-07-04', '12:00', 40.7128, -74.006, 'America/New_York', '-04:00', '1990-07-04T16:00:00.000Z'],
    ['New York, winter EST', '1990-01-15', '12:00', 40.7128, -74.006, 'America/New_York', '-05:00', '1990-01-15T17:00:00.000Z'],
    ['London, BST', '1985-07-01', '09:15', 51.5074, -0.1278, 'Europe/London', '+01:00', '1985-07-01T08:15:00.000Z'],
    ['Sydney, southern-summer DST', '2001-01-10', '20:00', -33.8688, 151.2093, 'Australia/Sydney', '+11:00', '2001-01-10T09:00:00.000Z'],
    ['Kathmandu before 1986', '1980-01-01', '05:30', 27.7172, 85.324, 'Asia/Kathmandu', '+05:30', '1980-01-01T00:00:00.000Z'],
    ['Kathmandu after 1986', '1995-01-01', '05:45', 27.7172, 85.324, 'Asia/Kathmandu', '+05:45', '1995-01-01T00:00:00.000Z'],
    ['New York local mean time (1870)', '1870-06-01', '12:00', 40.7128, -74.006, 'America/New_York', '-04:56:02', '1870-06-01T16:56:02.000Z'],
  ])('%s', (_l, date, time, lat, lng, tz, offset, utc) => {
    const r = at(date, time, lat, lng);
    expect(r.timezone).toBe(tz);
    expect(r.utcOffset).toBe(offset);
    expect(r.birthUTC).toBe(utc);
    expect(r.timezoneSource).toBe('coordinates');
  });
});

describe('local time preservation', () => {
  it('keeps local date/time, coordinates, offset and accuracy', () => {
    const r = at('1990-08-15', '06:30:45', 12.9716, 77.5946, { place: 'Bengaluru', timeAccuracy: 'approximate' });
    expect(r).toMatchObject({
      localDate: '1990-08-15', localTime: '06:30:45', place: 'Bengaluru', latitude: 12.9716, longitude: 77.5946,
      utcOffsetSeconds: 19800, birthUTC: '1990-08-15T01:00:45.000Z', timeAccuracy: 'approximate', coordinateSource: 'supplied',
    });
  });
  it('accepts genuine zero coordinates', () => {
    expect(at('2000-06-01', '12:00', 0, 0).latitude).toBe(0);
  });
  it('honours an explicit IANA zone over the coordinate lookup', () => {
    const r = at('1990-08-15', '06:30', 12.9716, 77.5946, { timezone: 'UTC' });
    expect(r).toMatchObject({ timezone: 'UTC', utcOffset: '+00:00', birthUTC: '1990-08-15T06:30:00.000Z', timezoneSource: 'supplied' });
  });
});

describe('daylight-saving edges', () => {
  it('rejects a time inside the spring-forward gap', () => {
    expect(() => at('2021-03-14', '02:30', 40.7128, -74.006)).toThrow(/did not exist/);
  });
  it('rejects the repeated fall-back hour unless an offset selects it', () => {
    expect(() => at('2021-11-07', '01:30', 40.7128, -74.006)).toThrow(/occurred twice/);
    expect(at('2021-11-07', '01:30', 40.7128, -74.006, { utcOffset: '-04:00' }).birthUTC).toBe('2021-11-07T05:30:00.000Z');
    expect(at('2021-11-07', '01:30', 40.7128, -74.006, { utcOffset: '-05:00' }).birthUTC).toBe('2021-11-07T06:30:00.000Z');
  });
  it('rejects an offset that never applied at that time', () => {
    expect(() => at('1990-07-04', '12:00', 40.7128, -74.006, { utcOffset: '-05:00' })).toThrow(BirthInputError);
  });
  it('handles the hours adjacent to a transition', () => {
    expect(at('2021-03-14', '01:59', 40.7128, -74.006).utcOffset).toBe('-05:00');
    expect(at('2021-03-14', '03:00', 40.7128, -74.006).utcOffset).toBe('-04:00');
  });
});

describe('invalid input never falls back', () => {
  it.each([
    ['bad date', '1990-02-30', '06:30', {}],
    ['bad time', '1990-08-15', '24:00', {}],
    ['empty time', '1990-08-15', '', {}],
    ['unknown zone', '1990-08-15', '06:30', { timezone: 'Mars/Olympus' }],
    ['bad accuracy', '1990-08-15', '06:30', { timeAccuracy: 'roughly' }],
  ])('%s', (_l, date, time, extra) => {
    expect(() => at(date, time, 12.97, 77.59, extra)).toThrow(BirthInputError);
  });
  it.each([[NaN, 77], [91, 77], [12, 181], ['', 77]])('invalid coordinates %s,%s', (lat, lng) => {
    expect(() => at('1990-08-15', '06:30', lat as number, lng as number)).toThrow(BirthInputError);
  });
  it('refuses when neither coordinates nor a geocodable place exist', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    await expect(resolveBirth({ date: '1990-08-15', time: '06:30', place: 'Bengaluru', timeAccuracy: 'exact' })).rejects.toBeInstanceOf(BirthInputError);
  });
  it('geocodes the supplied place when coordinates are absent', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ geometry: { location: { lat: 40.7128, lng: -74.006 } } }] }) }));
    const r = await resolveBirth({ date: '1990-07-04', time: '12:00', place: 'New York', timeAccuracy: 'exact' });
    expect(r).toMatchObject({ timezone: 'America/New_York', coordinateSource: 'geocoded', birthUTC: '1990-07-04T16:00:00.000Z' });
  });
});

describe('low-level helpers', () => {
  it('localToUtc round-trips a fixed zone', () => {
    const { wallMs } = parseLocalDateTime('2000-01-01', '00:00');
    expect(localToUtc(wallMs, 'Asia/Kolkata')).toEqual({ utcMs: Date.UTC(1999, 11, 31, 18, 30), offsetSeconds: 19800 });
  });
});
