/**
 * Projection of a CanonicalChart into the pre-V3 `chartData`/dashas/doshas
 * shape that existing UI, reports and PDFs read. Pure: no astronomy here —
 * every value comes from the canonical longitudes and their rule layers.
 */
import { GRAHAS, SIGN_NAMES, type CanonicalChart, type Graha } from '@shared/v3/canonical';
import { navamsaDegree, getRemedies } from '../vedic.js';
import { computeBhava } from '../bhava.js';
import { computeRemedies } from '../remedies.js';
import { calculateDashas } from '../dasha.js';

const r2 = (x: number) => parseFloat(x.toFixed(2));

export function legacyView(chart: CanonicalChart) {
  const lon = Object.fromEntries(chart.planets.map((p) => [p.name, p.longitude])) as Record<Graha, number>;
  const ascLon = chart.ascendant.longitude;
  const now = Date.now();
  const birthMs = Date.parse(chart.birth.birthUTC);

  const planetaryPositions = chart.planets.map((p) => ({
    planet: p.name, sign: p.sign as string, degree: r2(p.degreeInSign), house: p.house, isRetrograde: p.retrograde,
  }));
  const ascEntry = { planet: 'Ascendant', sign: chart.ascendant.sign as string, degree: r2(chart.ascendant.degreeInSign), house: 1, isRetrograde: false };
  const houses = chart.houses.map((h) => ({ house: h.house, sign: h.sign as string, planets: h.occupants as string[] }));

  const vargaView = (d: keyof CanonicalChart['vargas'], degreeOf?: (l: number) => number) => {
    const v = chart.vargas[d];
    const positions = v.placements.map((p) => ({
      planet: p.planet as string, sign: p.sign as string, degree: degreeOf ? r2(degreeOf(lon[p.planet])) : 0, house: p.house,
      isRetrograde: chart.planets.find((x) => x.name === p.planet)!.retrograde,
    }));
    return {
      houses: Array.from({ length: 12 }, (_, i) => {
        const s = (v.ascendantSignIndex + i) % 12;
        return { house: i + 1, sign: SIGN_NAMES[s] as string, planets: positions.filter((p) => p.house === i + 1).map((p) => p.planet) };
      }),
      planetaryPositions: [
        { planet: 'Ascendant', sign: SIGN_NAMES[v.ascendantSignIndex] as string, degree: degreeOf ? r2(degreeOf(ascLon)) : 0, house: 1, isRetrograde: false },
        ...positions,
      ],
    };
  };

  const bhava = computeBhava(lon, ascLon);
  const dignities = chart.strength.dignities;
  const yogini = chart.dashas.yogini.periods
    .filter((p) => Date.parse(p.end) > birthMs)
    .map((p) => {
      const start = Math.max(Date.parse(p.start), birthMs);
      const end = Date.parse(p.end);
      const s = new Date(start).toISOString().slice(0, 10);
      const e = new Date(end).toISOString().slice(0, 10);
      return {
        yogini: p.yogini, lord: p.lord, period: `${s.slice(0, 7)} – ${e.slice(0, 7)}`,
        status: (now >= start && now <= end ? 'current' : now > end ? 'past' : 'upcoming') as 'past' | 'current' | 'upcoming',
        startDate: s, endDate: e,
      };
    });
  const dosha = (id: string) => chart.doshas.find((d) => d.id === id)!.present;
  const moon = chart.planets.find((p) => p.name === 'Moon')!;

  return {
    zodiacSign: chart.planets.find((p) => p.name === 'Sun')!.sign as string,
    moonSign: moon.sign as string,
    ascendant: chart.ascendant.sign as string,
    nakshatra: moon.nakshatra.name,
    chartData: {
      isBirthTimeApproximate: chart.birth.timeAccuracy === 'approximate',
      houses,
      planetaryPositions: [ascEntry, ...planetaryPositions],
      navamsa: vargaView('D9', navamsaDegree),
      dasamsa: vargaView('D10'),
      shashtiamsa: vargaView('D60'),
      ashtakavarga: {
        ascSignIndex: chart.ascendant.signIndex,
        bav: chart.strength.ashtakavarga.bav as Record<string, number[]>,
        sav: chart.strength.ashtakavarga.sav,
        savByHouse: chart.strength.ashtakavarga.savByHouse,
      },
      dignities,
      bhava,
      yoginiDasha: yogini,
      yogas: chart.yogas,
      functionalRemedies: computeRemedies(dignities as any, bhava.houseLords),
      canonical: chart,
    },
    dashas: calculateDashas(moon.longitude, new Date(chart.birth.birthUTC)).map((d) => ({
      planet: d.planet, period: d.period, status: d.status, startDate: d.startDate, endDate: d.endDate, antardashas: d.antardashas,
    })),
    doshas: { mangalDosha: dosha('mangal'), kaalSarpDosha: dosha('kaalSarp'), pitruDosha: dosha('pitru') },
    remedies: getRemedies(moon.nakshatra.lord),
    raw: { ayanamsa: chart.meta.ayanamsaDegrees, jd: chart.meta.julianDayUT },
  };
}

export type LegacyKundli = ReturnType<typeof legacyView>;
export { GRAHAS };
