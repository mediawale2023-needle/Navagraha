import { describe, expect, it } from 'vitest';
import { computePanchang } from '../../server/astroEngine/panchang';
import { CalculationError } from '../../server/astroEngine/canonical/compute';
import { BirthInputError } from '../../server/astroEngine/errors';

const minutesApart = (iso: string, expected: string) => Math.abs(Date.parse(iso) - Date.parse(expected)) / 60_000;

// Reference sunrise/sunset: published almanac times (timeanddate.com / NOAA, upper-limb);
// Swiss disc-centre events run ~1 min later at sunrise, so the tolerance is 4 minutes.
describe('Panchang uses the real sunrise, sunset and time zone of the place', () => {
  it('India: New Delhi on the June solstice', () => {
    const p = computePanchang({ date: '2024-06-21', latitude: 28.6139, longitude: 77.209 });
    expect(p.location.timezone).toBe('Asia/Kolkata');
    expect(p.location.utcOffset).toBe('+05:30');
    expect(minutesApart(p.sunriseUTC, '2024-06-20T23:54:00Z')).toBeLessThan(4); // 05:24 IST
    expect(minutesApart(p.sunsetUTC, '2024-06-21T13:52:00Z')).toBeLessThan(4); // 19:22 IST
    expect(p.sunrise).toMatch(/^5:2\d AM$/);
    expect(p.vara).toBe('Friday');
  });

  it('non-India: London in summer reports BST times, not IST', () => {
    const p = computePanchang({ date: '2024-06-21', latitude: 51.5074, longitude: -0.1278 });
    expect(p.location.timezone).toBe('Europe/London');
    expect(p.location.utcOffset).toBe('+01:00');
    expect(minutesApart(p.sunriseUTC, '2024-06-21T03:43:00Z')).toBeLessThan(4); // 04:43 BST
    expect(minutesApart(p.sunsetUTC, '2024-06-21T20:21:00Z')).toBeLessThan(4); // 21:21 BST
    expect(p.sunrise).toMatch(/^4:4\d AM$/);
  });

  it('DST: New York sunrise moves from EST to EDT across the March 2024 change', () => {
    const before = computePanchang({ date: '2024-03-09', latitude: 40.7128, longitude: -74.006 });
    const after = computePanchang({ date: '2024-03-10', latitude: 40.7128, longitude: -74.006 });
    expect(before.location.utcOffset).toBe('-05:00');
    expect(after.location.utcOffset).toBe('-04:00');
    expect(minutesApart(before.sunriseUTC, '2024-03-09T11:19:00Z')).toBeLessThan(4); // 06:19 EST
    expect(minutesApart(after.sunriseUTC, '2024-03-10T11:17:00Z')).toBeLessThan(4); // 07:17 EDT
    expect(before.sunrise).toMatch(/^6:\d\d AM$/);
    expect(after.sunrise).toMatch(/^7:\d\d AM$/);
  });

  it('Rahu Kaal is the weekday eighth of the actual day length', () => {
    const p = computePanchang({ date: '2024-06-21', latitude: 28.6139, longitude: 77.209 }); // Friday → 4th eighth
    const eighth = (Date.parse(p.sunsetUTC) - Date.parse(p.sunriseUTC)) / 8;
    // Date keeps whole milliseconds, so allow 1 ms of truncation.
    expect(Math.abs(Date.parse(p.rahuKaal.startUTC) - (Date.parse(p.sunriseUTC) + 3 * eighth))).toBeLessThanOrEqual(1);
    expect(Math.abs(Date.parse(p.rahuKaal.endUTC) - Date.parse(p.rahuKaal.startUTC) - eighth)).toBeLessThanOrEqual(1);
    expect(eighth / 60_000).toBeGreaterThan(100); // a 14 h summer day, not a fixed 12 h
  });

  it('date boundary: the requested date is the civil date at the place, and "today" is local there', () => {
    const p = computePanchang({ date: '2024-01-01', latitude: -36.8485, longitude: 174.7633 });
    expect(p.location.timezone).toBe('Pacific/Auckland');
    expect(p.date).toBe('2024-01-01');
    expect(p.vara).toBe('Monday');
    expect(p.sunriseUTC.startsWith('2023-12-31')).toBe(true); // ~05:58 NZDT is still 31 Dec in UTC
    const now = new Date('2024-01-01T12:00:00Z');
    expect(computePanchang({ latitude: -36.8485, longitude: 174.7633, now }).date).toBe('2024-01-02');
    expect(computePanchang({ latitude: 21.3069, longitude: -157.8583, now }).date).toBe('2024-01-01');
  });

  it('tithi at sunrise matches known lunar phases', () => {
    // 8 Apr 2024 (total solar eclipse, new moon 18:21 UTC): Amavasya at Delhi sunrise.
    const amavasya = computePanchang({ date: '2024-04-08', latitude: 28.6139, longitude: 77.209 });
    expect(amavasya.tithi).toEqual({ name: 'Purnima/Amavasya', paksha: 'Krishna', number: 30 });
    // 23 Apr 2024: Chaitra Purnima runs from ~03:25 IST on the 23rd, so it is current at sunrise.
    const purnima = computePanchang({ date: '2024-04-23', latitude: 28.6139, longitude: 77.209 });
    expect(purnima.tithi).toEqual({ name: 'Purnima/Amavasya', paksha: 'Shukla', number: 15 });
  });

  it('refuses rather than inventing a sunrise during polar day', () => {
    expect(() => computePanchang({ date: '2024-06-21', latitude: 69.6492, longitude: 18.9553 })).toThrow(CalculationError);
  });

  it('rejects malformed input', () => {
    expect(() => computePanchang({ date: '2024-02-30', latitude: 28.6, longitude: 77.2 })).toThrow(BirthInputError);
    expect(() => computePanchang({ date: 'today', latitude: 28.6, longitude: 77.2 })).toThrow(BirthInputError);
    expect(() => computePanchang({ date: '2024-01-01', latitude: 'x', longitude: 77.2 })).toThrow(BirthInputError);
    expect(() => computePanchang({ date: '2024-01-01', latitude: 28.6, longitude: 77.2, timezone: 'Mars/Olympus' })).toThrow(BirthInputError);
  });
});
