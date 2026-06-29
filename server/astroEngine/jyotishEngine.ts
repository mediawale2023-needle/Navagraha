/**
 * Jyotish AI Reading orchestrator — admin-only professional tool.
 *
 * Computes a single precise (Swiss Ephemeris, Lahiri sidereal, via
 * swissChart.ts) position set and feeds it through every existing pure
 * astroEngine module (dasha, yogas, doshas, dignity, bhava, ashtakavarga,
 * vargas) PLUS the new Jaimini (jaimini.ts) and Mahavidya (mahavidya.ts)
 * layers and the gemstone-contraindication checks in remedies.ts.
 *
 * This is intentionally a SEPARATE entry point from getKundli() in index.ts:
 * the consumer-facing kundli flow keeps using the existing ~1-2°-accuracy
 * Keplerian engine (planets.ts) so its behaviour doesn't change. This
 * orchestrator is the only caller of swissChart.ts in the app.
 */
import { computePrecisePositions } from './swissChart.js';
import {
  SIGNS, signFromLon, degreeInSign, nakshatraFromLon, nakshatraPada,
  houseFromLon, signOfHouse, navamsaSign, navamsaDegree, dasamsaSign, getRemedies,
} from './vedic.js';
import { calculateDashas, calculateYoginiDasha } from './dasha.js';
import { computeAshtakavarga } from './ashtakavarga.js';
import { computeDignities } from './dignity.js';
import { computeBhava } from './bhava.js';
import { detectYogas } from './yogas.js';
import { computeRemedies, checkGemstoneContraindications } from './remedies.js';
import { hasMangalDosha, hasKaalSarpDosha, hasPitraDosha, hasVishaYoga } from './doshas.js';
import { computeCharKarakas, computeKarakamsha, calculateCharaDasha } from './jaimini.js';
import { computeMahavidyaMapping } from './mahavidya.js';

const PLANET_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

/**
 * Parse birth date/time (assumed IST, +05:30) into a UTC Date.
 * Deliberately duplicated from astroEngine/index.ts's private helper of the
 * same name rather than exporting/importing it, to avoid touching the
 * existing kundli pipeline.
 */
function parseBirthDateTime(dateOfBirth: Date | string, timeOfBirth: string): Date {
  const d = new Date(dateOfBirth);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const [hh, mm, ss = '0'] = timeOfBirth.split(':');
  const istOffsetMin = 5 * 60 + 30;
  const localMin = parseInt(hh, 10) * 60 + parseInt(mm, 10) + parseInt(ss, 10) / 60;
  const utcMin = localMin - istOffsetMin;
  const utc = new Date(Date.UTC(y, mo - 1, day, 0, 0, 0));
  utc.setUTCMinutes(utc.getUTCMinutes() + utcMin);
  return utc;
}

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
  yogas: ReturnType<typeof detectYogas>;
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
  };
  remedies: {
    functional: ReturnType<typeof computeRemedies>;
    nakshatraBased: ReturnType<typeof getRemedies>;
    gemstoneContraindications: ReturnType<typeof checkGemstoneContraindications>;
  };
}

export interface JyotishChartSummary {
  zodiacSign: string;
  moonSign: string;
  ascendant: string;
  nakshatra: string;
  chartData: JyotishChartData;
}

export function computeJyotishChart(
  dateOfBirth: Date | string,
  timeOfBirth: string,
  latitude: number,
  longitude: number,
): JyotishChartSummary {
  const birthUTC = parseBirthDateTime(dateOfBirth, timeOfBirth);
  const { jd, sidereal, ascSidereal, retroMap } = computePrecisePositions(birthUTC, latitude, longitude);

  const sunSign = signFromLon(sidereal['Sun']);
  const moonSign = signFromLon(sidereal['Moon']);
  const lagnaSign = signFromLon(ascSidereal);
  const moonNakshatra = nakshatraFromLon(sidereal['Moon']);

  const ascSignIndex = Math.floor((((ascSidereal % 360) + 360) % 360) / 30);
  const moonSignIndex = Math.floor((((sidereal['Moon'] % 360) + 360) % 360) / 30);

  const planets: JyotishPlanetEntry[] = PLANET_NAMES.map((name) => {
    const lon = sidereal[name] ?? 0;
    const nak = nakshatraFromLon(lon);
    return {
      planet: name,
      sign: signFromLon(lon),
      degree: parseFloat(degreeInSign(lon).toFixed(4)),
      house: houseFromLon(lon, ascSidereal),
      isRetrograde: retroMap[name] ?? false,
      nakshatra: nak.name,
      nakshatraLord: nak.lord,
      pada: nakshatraPada(lon),
      deity: nak.deity,
      shakti: nak.shakti,
    };
  });

  const ascNak = nakshatraFromLon(ascSidereal);

  // 12 houses (Whole Sign)
  const houses = Array.from({ length: 12 }, (_, i) => ({
    house: i + 1,
    sign: signOfHouse(i + 1, ascSidereal),
    planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
  }));

  // ─── Navamsa (D9) ───────────────────────────────────────────
  const ascNavSign = navamsaSign(ascSidereal);
  const navamsaPositions = PLANET_NAMES.map((name) => {
    const lon = sidereal[name] ?? 0;
    const navSign = navamsaSign(lon);
    return {
      planet: name,
      sign: SIGNS[navSign],
      degree: parseFloat(navamsaDegree(lon).toFixed(2)),
      house: ((navSign - ascNavSign + 12) % 12) + 1,
    };
  });
  const navamsaHouses = Array.from({ length: 12 }, (_, i) => {
    const signIdx = (ascNavSign + i) % 12;
    return { house: i + 1, sign: SIGNS[signIdx], planets: navamsaPositions.filter((p) => p.house === i + 1).map((p) => p.planet) };
  });

  // ─── Dasamsa (D10) ──────────────────────────────────────────
  const ascDasSign = dasamsaSign(ascSidereal);
  const dasamsaPositions = PLANET_NAMES.map((name) => {
    const lon = sidereal[name] ?? 0;
    const dasSign = dasamsaSign(lon);
    return { planet: name, sign: SIGNS[dasSign], degree: 0, house: ((dasSign - ascDasSign + 12) % 12) + 1 };
  });
  const dasamsaHouses = Array.from({ length: 12 }, (_, i) => {
    const signIdx = (ascDasSign + i) % 12;
    return { house: i + 1, sign: SIGNS[signIdx], planets: dasamsaPositions.filter((p) => p.house === i + 1).map((p) => p.planet) };
  });

  // ─── Ashtakavarga ───────────────────────────────────────────
  const avSignIndex: Record<string, number> = { Ascendant: ascSignIndex };
  for (const p of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
    avSignIndex[p] = Math.floor((((sidereal[p] ?? 0) % 360) + 360) % 360 / 30);
  }
  const av = computeAshtakavarga(avSignIndex);
  const ashtakavarga = {
    ascSignIndex,
    bav: av.bav,
    sav: av.sav,
    savByHouse: Array.from({ length: 12 }, (_, h) => av.sav[(ascSignIndex + h) % 12]),
  };

  // ─── Dignity, Bhava, Yogas ──────────────────────────────────
  const dignities = computeDignities(sidereal, ascSignIndex, retroMap);
  const bhava = computeBhava(sidereal, ascSidereal);
  const yogas = detectYogas(sidereal, ascSignIndex, moonSignIndex, dignities, bhava.houseLords);

  // ─── Dashas: Vimshottari + Yogini (Parashari) ──────────────
  const vimshottariDasha = calculateDashas(sidereal['Moon'], birthUTC);
  const yoginiDasha = calculateYoginiDasha(sidereal['Moon'], birthUTC);

  // ─── Jaimini layer ──────────────────────────────────────────
  const charKarakas = computeCharKarakas(sidereal);
  const karakamsha = computeKarakamsha(sidereal, charKarakas);
  const charaDasha = calculateCharaDasha(ascSidereal, sidereal, birthUTC);

  // ─── Mahavidya (Kamakhya Tantric) ──────────────────────────
  const mahavidya = computeMahavidyaMapping(ascSidereal, charKarakas);

  // ─── Doshas ─────────────────────────────────────────────────
  const marsHouse = planets.find((p) => p.planet === 'Mars')?.house ?? 0;
  const doshas = {
    mangalDosha: hasMangalDosha(marsHouse),
    kaalSarpDosha: hasKaalSarpDosha(sidereal),
    pitruDosha: hasPitraDosha(sidereal['Sun'] ?? 0, sidereal['Rahu'] ?? 0),
    vishaYoga: hasVishaYoga(sidereal['Moon'] ?? 0, sidereal['Saturn'] ?? 0),
  };

  // ─── Remedies ───────────────────────────────────────────────
  const functionalRemedies = computeRemedies(dignities, bhava.houseLords);
  const nakshatraBasedRemedies = getRemedies(moonNakshatra.lord);
  const gemstoneContraindications = checkGemstoneContraindications(ascSignIndex, sidereal, dignities);

  return {
    zodiacSign: sunSign,
    moonSign,
    ascendant: lagnaSign,
    nakshatra: moonNakshatra.name,
    chartData: {
      meta: { jd, engine: 'sweph (Moshier mode, Lahiri sidereal)', ayanamsa: 'Lahiri', birthUTC: birthUTC.toISOString() },
      ascendant: { sign: lagnaSign, degree: parseFloat(degreeInSign(ascSidereal).toFixed(4)), siderealLon: ascSidereal, nakshatra: ascNak.name, nakshatraLord: ascNak.lord, pada: nakshatraPada(ascSidereal) },
      planets,
      houses,
      navamsa: { houses: navamsaHouses, planetaryPositions: navamsaPositions },
      dasamsa: { houses: dasamsaHouses, planetaryPositions: dasamsaPositions },
      ashtakavarga,
      dignities,
      bhava,
      yogas,
      vimshottariDasha,
      yoginiDasha,
      jaimini: { charKarakas, karakamsha, charaDasha },
      mahavidya,
      doshas,
      remedies: { functional: functionalRemedies, nakshatraBased: nakshatraBasedRemedies, gemstoneContraindications },
    },
  };
}
