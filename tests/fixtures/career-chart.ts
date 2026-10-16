import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
export const ASOF = new Date('2026-10-15T06:00:00Z');
// The default is an invented chart (30 Oct 1977, 10:25 IST, Kolkata city centre): a debilitated Sun, a mixed work
// style and one weakly supported field (advisory).
export const fixtureChart = (date = '1977-10-30', time = '10:25', latitude = 22.5726, longitude = 88.3639) => ({ chartData: { canonical: computeCanonicalChart(resolveBirthWithCoordinates({ date, time, latitude, longitude, timeAccuracy: 'exact' })) } });
