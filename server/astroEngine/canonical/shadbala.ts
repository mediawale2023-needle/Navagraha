/**
 * Partial Shadbala — only the components whose classical formulas are exact
 * and verifiable from longitudes alone. Sthana (beyond Uchcha), Kala, Chesta
 * and Drik bala are NOT computed, so no total Rupa figure is produced: a sum
 * of three of six components is not Shadbala and must not be presented as one.
 *
 *  - Uchcha bala: (arc from the deep-debilitation point) / 3 → 0–60 virupas.
 *  - Dig bala: (arc from the directionless point) / 3, where the strength
 *    points are Lagna (Jupiter, Mercury), MC (Sun, Mars), Descendant (Saturn)
 *    and IC (Moon, Venus), and the directionless point is opposite.
 *  - Naisargika bala: fixed natural strengths 60×k/7.
 */
import { SEVEN_GRAHAS, type SevenGraha } from '@shared/v3/canonical';

// Deep exaltation points, sidereal degrees (Sun 10° Aries … Saturn 20° Libra).
export const DEEP_EXALTATION: Record<SevenGraha, number> = {
  Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200,
};
export const NAISARGIKA: Record<SevenGraha, number> = {
  Sun: 60, Moon: (60 * 6) / 7, Venus: (60 * 5) / 7, Jupiter: (60 * 4) / 7, Mercury: (60 * 3) / 7, Mars: (60 * 2) / 7, Saturn: 60 / 7,
};
type DigPoint = 'asc' | 'mc' | 'desc' | 'ic';
export const DIG_STRENGTH_POINT: Record<SevenGraha, DigPoint> = {
  Jupiter: 'asc', Mercury: 'asc', Sun: 'mc', Mars: 'mc', Saturn: 'desc', Moon: 'ic', Venus: 'ic',
};

const norm = (x: number) => ((x % 360) + 360) % 360;
export function arc(a: number, b: number): number {
  const d = Math.abs(norm(a) - norm(b));
  return d > 180 ? 360 - d : d;
}

export function uchchaBala(planet: SevenGraha, lon: number): number {
  return arc(lon, DEEP_EXALTATION[planet] + 180) / 3;
}

export function digBala(planet: SevenGraha, lon: number, ascLon: number, mcLon: number): number {
  const points: Record<DigPoint, number> = { asc: ascLon, mc: mcLon, desc: ascLon + 180, ic: mcLon + 180 };
  const strongest = points[DIG_STRENGTH_POINT[planet]];
  return arc(lon, strongest + 180) / 3;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function partialShadbala(sidereal: Record<string, number>, ascLon: number, mcLon: number) {
  return {
    status: 'partial' as const,
    unit: 'virupa' as const,
    componentsIncluded: ['uchcha', 'dig', 'naisargika'] as Array<'uchcha' | 'dig' | 'naisargika'>,
    componentsMissing: ['sthana (saptavargaja, ojayugma, kendradi, drekkana)', 'kala', 'chesta', 'drik'],
    note: 'Only Uchcha, Dig and Naisargika bala are computed. No total Shadbala in Rupas is given because the remaining components are not implemented.',
    planets: SEVEN_GRAHAS.map((p) => ({
      planet: p,
      uchcha: r2(uchchaBala(p, sidereal[p])),
      dig: r2(digBala(p, sidereal[p], ascLon, mcLon)),
      naisargika: r2(NAISARGIKA[p]),
    })),
  };
}
