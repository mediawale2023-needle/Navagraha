/**
 * Boot-time check of the V3 calculation dependencies. Charts are served only
 * after this passes; on failure the server stays up but unready (/api/health
 * reports the reason) — there is no approximate-astronomy fallback.
 */
import { siderealPositions, siderealAngles, nextSunEvent, julianDayUT } from './canonical/compute.js';
import { timeZoneForCoordinates, offsetSecondsAt } from './birthResolver.js';

// Reference at J2000.0 from the independent golden reference (scripts/golden/reference.ts:
// astronomy-engine, J2000 ecliptic, Lahiri K) — Swiss agrees to <1″; tolerance is the golden 30″.
// The ayanamsa is checked to 0.01° because Swiss reports the true (nutated) value.
const REF_INSTANT = new Date('2000-01-01T12:00:00Z');
const REF = { sun: 256.51555, moon: 199.47070, ayanamsa: 23.8532 };
const TOL_DEG = 30 / 3600;

export interface SelfCheckResult { ok: boolean; failures: string[] }

export function runAstronomySelfCheck(): SelfCheckResult {
  const failures: string[] = [];
  const check = (label: string, fn: () => void) => {
    try { fn(); } catch (err) { failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`); }
  };

  check('Swiss Ephemeris positions', () => {
    const { bodies, ayanamsa } = siderealPositions(REF_INSTANT);
    const off = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    if (off(bodies.Sun.longitude, REF.sun) > TOL_DEG) throw new Error(`Sun ${bodies.Sun.longitude.toFixed(4)}° ≠ ${REF.sun}°`);
    if (off(bodies.Moon.longitude, REF.moon) > TOL_DEG) throw new Error(`Moon ${bodies.Moon.longitude.toFixed(4)}° ≠ ${REF.moon}°`);
    if (Math.abs(ayanamsa - REF.ayanamsa) > 0.01) throw new Error(`Lahiri ayanamsa ${ayanamsa.toFixed(4)}° ≠ ${REF.ayanamsa}°`);
  });
  check('Swiss Ephemeris houses', () => {
    const { ascendant } = siderealAngles(julianDayUT(REF_INSTANT), 28.6139, 77.209);
    if (!Number.isFinite(ascendant)) throw new Error('Ascendant not finite');
  });
  check('Swiss Ephemeris sunrise', () => {
    const jd = nextSunEvent(julianDayUT(REF_INSTANT), 28.6139, 77.209, 'rise');
    if (!(jd > julianDayUT(REF_INSTANT) && jd < julianDayUT(REF_INSTANT) + 1)) throw new Error('sunrise outside the next day');
  });
  check('geo-tz (full historical dataset)', () => {
    // The merged default dataset maps Nairobi to Asia/Riyadh; only geo-tz/all gives Africa/Nairobi.
    const nairobi = timeZoneForCoordinates(-1.2921, 36.8219);
    if (nairobi !== 'Africa/Nairobi') throw new Error(`Nairobi resolved to ${nairobi}`);
    const delhi = timeZoneForCoordinates(28.6139, 77.209);
    if (delhi !== 'Asia/Kolkata') throw new Error(`New Delhi resolved to ${delhi}`);
  });
  check('ICU historical time-zone data', () => {
    // India used +06:30 war time in 1943; a small-ICU build would report +05:30.
    const o = offsetSecondsAt('Asia/Kolkata', Date.parse('1943-06-01T00:00:00Z'));
    if (o !== 23400) throw new Error(`Asia/Kolkata 1943 offset ${o}s, expected 23400s`);
    const ny = offsetSecondsAt('America/New_York', Date.parse('2024-07-01T12:00:00Z'));
    if (ny !== -14400) throw new Error(`America/New_York summer offset ${ny}s, expected -14400s`);
  });

  return { ok: failures.length === 0, failures };
}
