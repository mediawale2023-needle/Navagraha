import { SIGN_NAMES, type CanonicalChart } from '@shared/v3/canonical';

/**
 * What the Chart tab may draw. With an approximate birth time the Lagna, houses
 * and divisional charts are unknowable. Houses can still be counted from the
 * Moon (Chandra Lagna), but only when the Moon kept one sign for the whole
 * birth date; otherwise only sign positions are stated.
 */
export type ChartTabView =
  | { mode: 'exact' }
  | { mode: 'chandra'; moonSign: string; chartData: { planetaryPositions: ChandraPosition[]; houses: Array<{ house: number; sign: string }> } }
  | { mode: 'table'; rows: Array<{ planet: string; sign: string; degree: number; retrograde: boolean; signUncertain: boolean }> };

interface ChandraPosition { planet: string; sign: string; house: number; degree: number; isRetrograde: boolean }

const round2 = (n: number) => Math.round(n * 100) / 100;

export function chartTabView(chart: CanonicalChart): ChartTabView {
  if (chart.birth.timeAccuracy !== 'approximate') return { mode: 'exact' };
  const moon = chart.planets.find((p) => p.name === 'Moon');
  if (moon && chart.uncertainty.moonSignStableAcrossBirthDate) {
    const houseFromMoon = (signIndex: number) => ((signIndex - moon.signIndex + 12) % 12) + 1;
    return {
      mode: 'chandra',
      moonSign: moon.sign,
      chartData: {
        planetaryPositions: chart.planets.map((p) => ({
          planet: p.name, sign: p.sign, house: houseFromMoon(p.signIndex), degree: round2(p.degreeInSign), isRetrograde: p.retrograde,
        })),
        houses: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: SIGN_NAMES[(moon.signIndex + i) % 12] })),
      },
    };
  }
  return {
    mode: 'table',
    rows: chart.planets.map((p) => ({
      planet: p.name, sign: p.sign, degree: round2(p.degreeInSign), retrograde: p.retrograde,
      signUncertain: p.name === 'Moon' && !chart.uncertainty.moonSignStableAcrossBirthDate,
    })),
  };
}
