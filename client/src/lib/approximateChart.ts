import { SIGN_NAMES, type CanonicalChart } from '@shared/v3/canonical';
import { planetFacts, type TimeStability } from './timeStability';

/**
 * What the Chart tab may draw. With an approximate birth time the Lagna, houses
 * and divisional charts are unknowable. Houses can still be counted from the
 * Moon (Chandra Lagna), but only when every planet kept one sign for the whole
 * birth date; otherwise only sign positions are stated, and no degrees.
 */
export type ChartTabView =
  | { mode: 'exact' }
  | { mode: 'chandra'; moonSign: string; chartData: { planetaryPositions: ChandraPosition[]; houses: Array<{ house: number; sign: string }> } }
  | { mode: 'table'; changedSign: string[]; rows: Array<{ planet: string; sign: string; signs: string[]; retrograde: boolean; signUncertain: boolean }> };

interface ChandraPosition { planet: string; sign: string; house: number; isRetrograde: boolean }

/**
 * `stability` is the server's `chartData.timeStability`; without it only the Moon's sign is checked.
 */
export function chartTabView(chart: CanonicalChart, stability?: TimeStability): ChartTabView {
  if (chart.birth.timeAccuracy !== 'approximate') return { mode: 'exact' };
  const moon = chart.planets.find((p) => p.name === 'Moon');
  const signKnown = (planet: string) => (planet === 'Moon' ? chart.uncertainty.moonSignStableAcrossBirthDate : !stability || planetFacts(chart, stability, planet).sign);
  const retroKnown = (planet: string) => !stability || planetFacts(chart, stability, planet).retrograde;
  const changedSign = chart.planets.filter((p) => !signKnown(p.name)).map((p) => (p.name === 'Moon' ? 'the Moon' : p.name));
  if (moon && !changedSign.length) {
    const houseFromMoon = (signIndex: number) => ((signIndex - moon.signIndex + 12) % 12) + 1;
    return {
      mode: 'chandra',
      moonSign: moon.sign,
      chartData: {
        planetaryPositions: chart.planets.map((p) => ({
          planet: p.name, sign: p.sign, house: houseFromMoon(p.signIndex), isRetrograde: p.retrograde && retroKnown(p.name),
        })),
        houses: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: SIGN_NAMES[(moon.signIndex + i) % 12] })),
      },
    };
  }
  return {
    mode: 'table',
    changedSign,
    rows: chart.planets.map((p) => {
      const uncertain = !signKnown(p.name);
      const signs = uncertain ? (stability ? planetFacts(chart, stability, p.name).signs : []) : [p.sign];
      return { planet: p.name, sign: p.sign, signs: signs.length ? signs : [p.sign], retrograde: p.retrograde && retroKnown(p.name), signUncertain: uncertain };
    }),
  };
}
