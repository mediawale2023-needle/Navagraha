/**
 * Bhava analysis: house lords (Bhavesh) and where they sit, natural karakas,
 * full Vedic graha drishti (aspects), and the Bhava-Chalit (equal-from-ascendant)
 * house overlay that flags planets sitting near a sign edge.
 */
import { SIGNS } from './vedic.js';

const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const ALL_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// Special aspects (besides the universal 7th), as house offsets from the planet.
const SPECIAL_ASPECTS: Record<string, number[]> = {
  Mars: [4, 8], Jupiter: [5, 9], Saturn: [3, 10], Rahu: [5, 9], Ketu: [5, 9],
};

export const HOUSE_KARAKAS: Record<number, string> = {
  1: 'Sun (self, vitality)', 2: 'Jupiter (wealth, speech)', 3: 'Mars (courage, siblings)',
  4: 'Moon (mother, home)', 5: 'Jupiter (children, intellect)', 6: 'Mars & Saturn (enemies, disease)',
  7: 'Venus (spouse, partnership)', 8: 'Saturn (longevity, transformation)', 9: 'Jupiter & Sun (fortune, father)',
  10: 'Sun, Mercury, Jupiter, Saturn (career)', 11: 'Jupiter (gains)', 12: 'Saturn (loss, moksha)',
};

const norm = (lon: number) => ((lon % 360) + 360) % 360;
const signOf = (lon: number) => Math.floor(norm(lon) / 30) % 12;

export interface BhavaResult {
  houseLords: Array<{ house: number; sign: string; lord: string; lordSign: string; lordHouse: number }>;
  aspects: Array<{ planet: string; aspectsHouses: number[]; aspectsPlanets: string[] }>;
  chalit: Array<{ planet: string; rasiHouse: number; chalitHouse: number; shifted: boolean }>;
  karakas: Record<number, string>;
}

export function computeBhava(sidereal: Record<string, number>, ascSidereal: number): BhavaResult {
  const ascSign = signOf(ascSidereal);
  const whole = (s: number) => ((s - ascSign + 12) % 12) + 1;
  const planetSign: Record<string, number> = {};
  const planetHouse: Record<string, number> = {};
  for (const p of ALL_PLANETS) {
    planetSign[p] = signOf(sidereal[p] ?? 0);
    planetHouse[p] = whole(planetSign[p]);
  }

  // House lords
  const houseLords = Array.from({ length: 12 }, (_, i) => {
    const signIdx = (ascSign + i) % 12;
    const lord = SIGN_LORDS[signIdx];
    return {
      house: i + 1,
      sign: SIGNS[signIdx],
      lord,
      lordSign: SIGNS[planetSign[lord] ?? 0],
      lordHouse: planetHouse[lord] ?? 0,
    };
  });

  // Graha drishti
  const planetsByHouse: Record<number, string[]> = {};
  for (const p of ALL_PLANETS) (planetsByHouse[planetHouse[p]] ||= []).push(p);
  const aspects = ALL_PLANETS.map((p) => {
    const h = planetHouse[p];
    const offsets = [7, ...(SPECIAL_ASPECTS[p] || [])];
    const aspectsHouses = Array.from(new Set(offsets.map((o) => ((h - 1 + (o - 1)) % 12) + 1)));
    const aspectsPlanets = aspectsHouses.flatMap((hh) => planetsByHouse[hh] || []).filter((x) => x !== p);
    return { planet: p, aspectsHouses, aspectsPlanets };
  });

  // Bhava Chalit (equal houses from the exact ascendant degree)
  const cusps = Array.from({ length: 12 }, (_, i) => norm(ascSidereal + i * 30));
  const chalitHouseOf = (lon: number) => {
    const rel = norm(lon - ascSidereal);
    return Math.floor(rel / 30) % 12 + 1;
  };
  void cusps;
  const chalit = ALL_PLANETS.map((p) => {
    const rasiHouse = planetHouse[p];
    const chalitHouse = chalitHouseOf(sidereal[p] ?? 0);
    return { planet: p, rasiHouse, chalitHouse, shifted: rasiHouse !== chalitHouse };
  });

  return { houseLords, aspects, chalit, karakas: HOUSE_KARAKAS };
}
