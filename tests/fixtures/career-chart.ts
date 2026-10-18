import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
export const ASOF = new Date('2026-10-15T06:00:00Z');
// The default is an invented chart (30 Oct 1977, 10:25 IST, Kolkata city centre): a debilitated Sun, a mixed work
// style and one weakly supported field (advisory).
export const fixtureChart = (date = '1977-10-30', time = '10:25', latitude = 22.5726, longitude = 88.3639) => ({ chartData: { canonical: computeCanonicalChart(resolveBirthWithCoordinates({ date, time, latitude, longitude, timeAccuracy: 'exact' })) } });
/** Seven invented births (no real person) with contrasting Lagnas, periods and career pictures. */
export const SYNTHETIC_CHARTS = {
  delhi: ['1985-03-22', '06:15', 28.6139, 77.209],
  kolkata: ['1977-10-30', '10:25', 22.5726, 88.3639],
  mumbai: ['2000-07-04', '18:45', 19.076, 72.8777],
  chennai: ['1992-12-08', '23:40', 13.0827, 80.2707],
  bengaluru: ['1968-05-17', '04:05', 12.9716, 77.5946],
  jaipur: ['2003-01-26', '14:30', 26.9124, 75.7873],
  pune: ['1995-09-02', '08:50', 18.5204, 73.8567],
} as const;
