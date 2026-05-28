/**
 * Ashtakavarga — Bhinnashtakavarga (per planet) + Sarvashtakavarga.
 *
 * For each of the 7 planets, each of 8 contributors (the 7 planets + the
 * Ascendant) donates a bindu to specific houses counted from the contributor's
 * sign. The classical benefic-place tables below sum to the canonical totals
 * (Sun 48, Moon 49, Mars 39, Mercury 54, Jupiter 56, Venus 52, Saturn 39 = 337).
 */

export const AV_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as const;
const AV_CONTRIBUTORS = [...AV_PLANETS, 'Ascendant'] as const;

export const AV_CANONICAL_TOTALS: Record<string, number> = {
  Sun: 48, Moon: 49, Mars: 39, Mercury: 54, Jupiter: 56, Venus: 52, Saturn: 39,
};

// Benefic houses (1–12, counted from the contributor) where the planet gains a bindu.
const AV_TABLES: Record<string, Record<string, number[]>> = {
  Sun: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11],
    Moon: [3, 6, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [3, 5, 6, 9, 10, 11, 12],
    Jupiter: [5, 6, 9, 11],
    Venus: [6, 7, 12],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Ascendant: [3, 4, 6, 10, 11, 12],
  },
  Moon: {
    Sun: [3, 6, 7, 8, 10, 11],
    Moon: [1, 3, 6, 7, 10, 11],
    Mars: [2, 3, 5, 6, 9, 10, 11],
    Mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    Jupiter: [1, 2, 4, 7, 8, 10, 11],
    Venus: [3, 4, 5, 7, 9, 10, 11],
    Saturn: [3, 5, 6, 11],
    Ascendant: [3, 6, 10, 11],
  },
  Mars: {
    Sun: [3, 5, 6, 10, 11],
    Moon: [3, 6, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [3, 5, 6, 11],
    Jupiter: [6, 10, 11, 12],
    Venus: [6, 8, 11, 12],
    Saturn: [1, 4, 7, 8, 9, 10, 11],
    Ascendant: [1, 3, 6, 10, 11],
  },
  Mercury: {
    Sun: [5, 6, 9, 11, 12],
    Moon: [2, 4, 6, 8, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    Jupiter: [6, 8, 11, 12],
    Venus: [1, 2, 3, 4, 5, 8, 9, 11],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Ascendant: [1, 2, 4, 6, 8, 10, 11],
  },
  Jupiter: {
    Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    Moon: [2, 5, 7, 9, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    Venus: [2, 5, 6, 9, 10, 11],
    Saturn: [3, 5, 6, 12],
    Ascendant: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  Venus: {
    Sun: [8, 11, 12],
    Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    Mars: [3, 5, 6, 9, 11, 12],
    Mercury: [3, 5, 6, 9, 11],
    Jupiter: [5, 8, 9, 10, 11],
    Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    Saturn: [3, 4, 5, 8, 9, 10, 11],
    Ascendant: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  Saturn: {
    Sun: [1, 2, 4, 7, 8, 10, 11],
    Moon: [3, 6, 11],
    Mars: [3, 5, 6, 10, 11, 12],
    Mercury: [6, 8, 9, 10, 11, 12],
    Jupiter: [5, 6, 11, 12],
    Venus: [6, 11, 12],
    Saturn: [3, 5, 6, 11],
    Ascendant: [1, 3, 4, 6, 10, 11],
  },
};

export interface AshtakavargaResult {
  bav: Record<string, number[]>; // planet -> bindus per sign (index 0 = Aries)
  sav: number[];                 // Sarvashtakavarga per sign (index 0 = Aries)
  totals: Record<string, number>;
  savTotal: number;
}

/**
 * @param signIndex map of contributor name -> sign index (0=Aries…11=Pisces),
 *                  including 'Ascendant'.
 */
export function computeAshtakavarga(signIndex: Record<string, number>): AshtakavargaResult {
  const bav: Record<string, number[]> = {};
  const totals: Record<string, number> = {};

  for (const planet of AV_PLANETS) {
    const arr = new Array(12).fill(0);
    for (const contributor of AV_CONTRIBUTORS) {
      const cSign = signIndex[contributor];
      if (cSign == null || Number.isNaN(cSign)) continue;
      for (const h of AV_TABLES[planet][contributor]) {
        arr[(cSign + (h - 1)) % 12] += 1;
      }
    }
    bav[planet] = arr;
    totals[planet] = arr.reduce((a, b) => a + b, 0);
  }

  const sav = new Array(12).fill(0);
  for (let s = 0; s < 12; s++) {
    for (const p of AV_PLANETS) sav[s] += bav[p][s];
  }

  return { bav, sav, totals, savTotal: sav.reduce((a, b) => a + b, 0) };
}
