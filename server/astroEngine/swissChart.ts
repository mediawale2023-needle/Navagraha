/**
 * Swiss Ephemeris-precision position calculator (Lahiri sidereal).
 *
 * Used ONLY by the Jyotish AI Reading feature (admin-only, server/jyotishEngine.ts)
 * where sub-arcsecond precision matters for nakshatra-pada boundaries and dasha-
 * junction dates during live client sessions. Runs in SEFLG_MOSEPH (Moshier) mode — no
 * external ephemeris (.se1) data files to ship or path-configure, accurate for
 * roughly 3000 BCE–3000 CE (every realistic birth chart) to sub-arcsecond geocentric
 * precision, vastly better than the simplified Keplerian elements in planets.ts
 * (which documents itself as ~1-2° for outer planets).
 *
 * This intentionally does NOT replace planets.ts / index.ts's getKundli(), which the
 * rest of the app (saved kundlis, transits, daily horoscope) keeps using — swapping
 * that engine app-wide is a larger, separate migration outside this feature's scope.
 *
 * Once we have a `sidereal` longitude map + `ascSidereal`, everything downstream
 * (vedic.ts varga charts, dasha.ts, ashtakavarga.ts, dignity.ts, bhava.ts, yogas.ts,
 * remedies.ts, doshas.ts) is reused as-is — those functions only ever consumed plain
 * longitude numbers, never cared which engine produced them.
 */
import sweph from 'sweph';
import { julianDay } from './core.js';

const C = sweph.constants;
const SID_FLAGS = C.SEFLG_SIDEREAL | C.SEFLG_MOSEPH;

let _sidModeSet = false;
function ensureSidMode() {
  if (!_sidModeSet) {
    sweph.set_sid_mode(C.SE_SIDM_LAHIRI, 0, 0);
    _sidModeSet = true;
  }
}

const GRAHA_IDS: Record<string, number> = {
  Sun: C.SE_SUN,
  Moon: C.SE_MOON,
  Mercury: C.SE_MERCURY,
  Venus: C.SE_VENUS,
  Mars: C.SE_MARS,
  Jupiter: C.SE_JUPITER,
  Saturn: C.SE_SATURN,
};

export interface PrecisePositions {
  jd: number;
  sidereal: Record<string, number>; // planet -> sidereal (Lahiri) longitude, includes Rahu/Ketu
  ascSidereal: number;
  mcSidereal: number;
  retroMap: Record<string, boolean>;
}

function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

/**
 * Sidereal (Lahiri) longitudes for all 7 classical grahas + Rahu/Ketu (mean node),
 * plus the Ascendant and MC — via Swiss Ephemeris, Moshier algorithm.
 *
 * @param birthUTC  Birth instant as a UTC Date (caller resolves local time zone)
 * @param latitude  Birth latitude, +N
 * @param longitude Birth longitude, +E
 */
export function computePrecisePositions(
  birthUTC: Date,
  latitude: number,
  longitude: number,
): PrecisePositions {
  ensureSidMode();
  const jd = julianDay(birthUTC);

  const sidereal: Record<string, number> = {};
  const retroMap: Record<string, boolean> = {};

  for (const [name, id] of Object.entries(GRAHA_IDS)) {
    const r = sweph.calc_ut(jd, id, SID_FLAGS);
    sidereal[name] = norm360(r.data[0]);
    retroMap[name] = r.data[3] < 0; // negative longitude speed = retrograde
  }

  // Rahu: mean lunar node. Ketu: always exactly opposite (180°).
  const node = sweph.calc_ut(jd, C.SE_MEAN_NODE, SID_FLAGS);
  const rahuLon = norm360(node.data[0]);
  sidereal['Rahu'] = rahuLon;
  sidereal['Ketu'] = norm360(rahuLon + 180);
  retroMap['Rahu'] = true;
  retroMap['Ketu'] = true;

  // House system letter is irrelevant to the asc/mc points themselves — we only
  // read data.points[0]/[1] (Ascendant/MC) and derive Whole-Sign houses ourselves,
  // matching the convention used everywhere else in astroEngine/.
  const h = sweph.houses_ex(jd, SID_FLAGS, latitude, longitude, 'W');
  const ascSidereal = norm360(h.data.points[0]);
  const mcSidereal = norm360(h.data.points[1]);

  return { jd, sidereal, ascSidereal, mcSidereal, retroMap };
}
