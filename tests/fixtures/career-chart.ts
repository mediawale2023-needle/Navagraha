import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
export const ASOF = new Date('2026-10-15T06:00:00Z');
export const fixtureChart = (date = '1991-11-13', time = '12:30', latitude = 15.8497, longitude = 74.4977) => ({ chartData: { canonical: computeCanonicalChart(resolveBirthWithCoordinates({ date, time, latitude, longitude, timeAccuracy: 'exact' })) } });
