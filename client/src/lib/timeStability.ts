import type { CanonicalChart } from '@shared/v3/canonical';

/**
 * Which planetary facts an approximate birth time can support (the server's `chartData.timeStability`,
 * derived on read). A fact is known only when it holds at every moment of the birth date.
 */
export interface PlanetFacts { sign: boolean; nakshatra: boolean; dignity: boolean; combust: boolean; retrograde: boolean; signs: string[] }
export interface TimeStability { planets: Record<string, PlanetFacts> }

const ALL_KNOWN: PlanetFacts = { sign: true, nakshatra: true, dignity: true, combust: true, retrograde: true, signs: [] };
const NONE_KNOWN: PlanetFacts = { sign: false, nakshatra: false, dignity: false, combust: false, retrograde: false, signs: [] };

/** What may be stated about a planet. Exact time: everything. Approximate without stability data: nothing beyond the Moon flags. */
export function planetFacts(chart: CanonicalChart, stability: TimeStability | null | undefined, planet: string): PlanetFacts {
  if (chart.birth.timeAccuracy !== 'approximate') return ALL_KNOWN;
  const facts = stability?.planets?.[planet];
  if (facts) return facts;
  if (planet !== 'Moon') return NONE_KNOWN;
  return { ...NONE_KNOWN, sign: chart.uncertainty.moonSignStableAcrossBirthDate, nakshatra: chart.uncertainty.moonNakshatraStableAcrossBirthDate };
}

/**
 * Whether a planet's dignity line holds all day. A debilitated planet's Neecha Bhanga is judged from
 * the Lagna, so whether its debilitation is cancelled is unknown with an approximate time.
 */
export function dignityKnown(chart: CanonicalChart, stability: TimeStability | null | undefined, planet: string): boolean {
  if (chart.birth.timeAccuracy !== 'approximate') return true;
  const f = planetFacts(chart, stability, planet);
  const d = chart.strength.dignities.find((x) => x.planet === planet);
  return f.sign && f.dignity && f.combust && d?.dignity !== 'Debilitated';
}
