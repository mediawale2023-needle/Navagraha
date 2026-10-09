/**
 * Professional Jyotish chart (admin Jyotish Reading + Astrologer Pro).
 *
 * V3: a projection of the same CanonicalChart the consumer Kundli uses — one
 * Swiss Ephemeris/Lahiri calculation, the birthplace's historical time zone,
 * and the shared rule layers. Traditions (Parashar, K.N. Rao, Kamakhya)
 * interpret this chart differently but never recompute its astronomy.
 * Adds the professional-only layers: Jaimini Chara Dasha detail, Mahavidya,
 * and gemstone contraindications.
 */
import { SIGN_NAMES, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { navamsaDegree, getRemedies, NAKSHATRAS } from './vedic.js';
import { calculateDashas, calculateYoginiDasha } from './dasha.js';
import { computeDignities } from './dignity.js';
import { computeBhava } from './bhava.js';
import { computeRemedies, checkGemstoneContraindications, isFunctionalMaleficLord } from './remedies.js';
import { computeCharKarakas, computeKarakamsha, calculateCharaDasha } from './jaimini.js';
import { computeMahavidyaMapping } from './mahavidya.js';
import { resolveBirthWithCoordinates, type TimeAccuracy } from './birthResolver.js';
import { computeCanonicalChart } from './canonical/compute.js';
import { birthDateString } from './index.js';

export interface JyotishPlanetEntry {
  planet: string;
  sign: string;
  degree: number;
  house: number;
  isRetrograde: boolean;
  nakshatra: string;
  nakshatraLord: string;
  pada: number;
  deity: string;
  shakti: string;
}

export interface JyotishChartData {
  meta: { jd: number; engine: string; ayanamsa: string; birthUTC: string };
  ascendant: { sign: string; degree: number; siderealLon: number; nakshatra: string; nakshatraLord: string; pada: number };
  planets: JyotishPlanetEntry[];
  houses: Array<{ house: number; sign: string; planets: string[] }>;
  navamsa: { houses: Array<{ house: number; sign: string; planets: string[] }>; planetaryPositions: Array<{ planet: string; sign: string; degree: number; house: number }> };
  dasamsa: { houses: Array<{ house: number; sign: string; planets: string[] }>; planetaryPositions: Array<{ planet: string; sign: string; degree: number; house: number }> };
  ashtakavarga: { ascSignIndex: number; bav: Record<string, number[]>; sav: number[]; savByHouse: number[] };
  dignities: ReturnType<typeof computeDignities>;
  bhava: ReturnType<typeof computeBhava>;
  yogas: CanonicalChart['yogas'];
  vimshottariDasha: ReturnType<typeof calculateDashas>;
  yoginiDasha: ReturnType<typeof calculateYoginiDasha>;
  jaimini: {
    charKarakas: ReturnType<typeof computeCharKarakas>;
    karakamsha: ReturnType<typeof computeKarakamsha>;
    charaDasha: ReturnType<typeof calculateCharaDasha>;
  };
  mahavidya: ReturnType<typeof computeMahavidyaMapping>;
  doshas: {
    mangalDosha: boolean;   // a.k.a. Kuja Dosha — same affliction, see doshas.ts
    kaalSarpDosha: boolean;
    pitruDosha: boolean;
    vishaYoga: boolean;
    /** Cancellation conditions met by a house-rule Mangal Dosha (then `mangalDosha` is false). */
    mangalCancelledBy: string[];
  };
  remedies: {
    functional: ReturnType<typeof computeRemedies>;
    nakshatraBased: ReturnType<typeof getRemedies>;
    nakshatraLord: string;
    /** True when this chart's functional rules forbid the birth-star gemstone (see isFunctionalMaleficLord). */
    nakshatraGemstoneAdvisedAgainst: boolean;
    gemstoneContraindications: ReturnType<typeof checkGemstoneContraindications>;
  };
}

export interface JyotishChartSummary {
  zodiacSign: string;
  moonSign: string;
  ascendant: string;
  nakshatra: string;
  chartData: JyotishChartData & { canonical: CanonicalChart };
}

export interface JyotishChartOptions { timeAccuracy?: TimeAccuracy; timezone?: string | null; utcOffset?: string | null }

export function computeJyotishChart(
  dateOfBirth: Date | string,
  timeOfBirth: string,
  latitude: number,
  longitude: number,
  opts: JyotishChartOptions = {},
): JyotishChartSummary {
  const canonical = computeCanonicalChart(resolveBirthWithCoordinates({
    date: birthDateString(dateOfBirth), time: timeOfBirth, latitude, longitude,
    timezone: opts.timezone ?? null, utcOffset: opts.utcOffset ?? null, timeAccuracy: opts.timeAccuracy ?? 'exact',
  }));
  return projectJyotishChart(canonical);
}

/** Professional view of a CanonicalChart (no astronomy here). */
export function projectJyotishChart(canonical: CanonicalChart): JyotishChartSummary {
  const sidereal = Object.fromEntries(canonical.planets.map((p) => [p.name, p.longitude])) as Record<Graha, number>;
  const ascSidereal = canonical.ascendant.longitude;
  const ascSignIndex = canonical.ascendant.signIndex;
  const birthUTC = new Date(canonical.birth.birthUTC);
  const retroMap = Object.fromEntries(canonical.planets.map((p) => [p.name, p.retrograde]));

  const planets: JyotishPlanetEntry[] = canonical.planets.map((p) => ({
    planet: p.name,
    sign: p.sign,
    degree: parseFloat(p.degreeInSign.toFixed(4)),
    house: p.house,
    isRetrograde: p.retrograde,
    nakshatra: p.nakshatra.name,
    nakshatraLord: p.nakshatra.lord,
    pada: p.nakshatra.pada,
    deity: NAKSHATRAS[p.nakshatra.index].deity,
    shakti: NAKSHATRAS[p.nakshatra.index].shakti,
  }));
  const houses = canonical.houses.map((h) => ({ house: h.house, sign: h.sign as string, planets: h.occupants as string[] }));

  const vargaView = (d: 'D9' | 'D10', degreeOf?: (l: number) => number) => {
    const v = canonical.vargas[d];
    const positions = v.placements.map((p) => ({ planet: p.planet as string, sign: p.sign as string, degree: degreeOf ? parseFloat(degreeOf(sidereal[p.planet]).toFixed(2)) : 0, house: p.house }));
    return {
      houses: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: SIGN_NAMES[(v.ascendantSignIndex + i) % 12] as string, planets: positions.filter((p) => p.house === i + 1).map((p) => p.planet) })),
      planetaryPositions: positions,
    };
  };

  const dignities = computeDignities(sidereal, ascSignIndex, retroMap);
  const bhava = computeBhava(sidereal, ascSidereal);
  const charKarakas = computeCharKarakas(sidereal);
  const karakamsha = computeKarakamsha(sidereal, charKarakas);
  const moon = canonical.planets.find((p) => p.name === 'Moon')!;
  const dosha = (id: string) => canonical.doshas.find((d) => d.id === id)!.present;

  return {
    zodiacSign: canonical.planets.find((p) => p.name === 'Sun')!.sign,
    moonSign: moon.sign,
    ascendant: canonical.ascendant.sign,
    nakshatra: moon.nakshatra.name,
    chartData: {
      meta: { jd: canonical.meta.julianDayUT, engine: `${canonical.meta.ephemeris}, ${canonical.meta.ayanamsa} sidereal`, ayanamsa: canonical.meta.ayanamsa, birthUTC: canonical.birth.birthUTC },
      ascendant: {
        sign: canonical.ascendant.sign, degree: parseFloat(canonical.ascendant.degreeInSign.toFixed(4)), siderealLon: ascSidereal,
        nakshatra: canonical.ascendant.nakshatra.name, nakshatraLord: canonical.ascendant.nakshatra.lord, pada: canonical.ascendant.nakshatra.pada,
      },
      planets,
      houses,
      navamsa: vargaView('D9', navamsaDegree),
      dasamsa: vargaView('D10'),
      ashtakavarga: { ascSignIndex, bav: canonical.strength.ashtakavarga.bav as Record<string, number[]>, sav: canonical.strength.ashtakavarga.sav, savByHouse: canonical.strength.ashtakavarga.savByHouse },
      dignities,
      bhava,
      yogas: canonical.yogas,
      vimshottariDasha: calculateDashas(moon.longitude, birthUTC),
      yoginiDasha: calculateYoginiDasha(moon.longitude, birthUTC),
      jaimini: { charKarakas, karakamsha, charaDasha: calculateCharaDasha(ascSidereal, sidereal, birthUTC) },
      mahavidya: computeMahavidyaMapping(ascSidereal, charKarakas),
      doshas: { mangalDosha: dosha('mangal'), kaalSarpDosha: dosha('kaalSarp'), pitruDosha: dosha('pitru'), vishaYoga: dosha('vishaYoga'), mangalCancelledBy: canonical.doshas.find((d) => d.id === 'mangal')!.cancelledBy ?? [] },
      remedies: {
        functional: computeRemedies(dignities, bhava.houseLords),
        // Generic birth-star list, kept for the practitioner; flagged when this chart's functional rules forbid its stone.
        nakshatraBased: getRemedies(moon.nakshatra.lord),
        nakshatraLord: moon.nakshatra.lord,
        nakshatraGemstoneAdvisedAgainst: isFunctionalMaleficLord(moon.nakshatra.lord, bhava.houseLords),
        gemstoneContraindications: checkGemstoneContraindications(ascSignIndex, sidereal, dignities),
      },
      canonical,
    },
  };
}
