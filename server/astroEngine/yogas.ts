/**
 * Classical yoga detection — Pancha Mahapurusha, Gajakesari, Budha-Aditya,
 * Chandra-Mangala, Raja, Dhana, Neecha-Bhanga Raja Yoga, and Kemadruma (with
 * its cancellation). Deterministic, from the natal chart.
 */
import type { PlanetDignity } from './dignity.js';

const KENDRA = [1, 4, 7, 10];
const TRIKONA = [1, 5, 9];
const WEALTH = [2, 5, 9, 11];
const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const MAHAPURUSHA: Record<string, string> = { Mars: 'Ruchaka', Mercury: 'Bhadra', Jupiter: 'Hamsa', Venus: 'Malavya', Saturn: 'Sasa' };

export interface Yoga {
  name: string;
  category: string; // Mahapurusha | Raja | Dhana | Dosha
  planets: string[];
  cancelled?: boolean;
  description: string;
}

const signOf = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;

export function detectYogas(
  sidereal: Record<string, number>,
  ascSignIndex: number,
  moonSignIndex: number,
  dignities: PlanetDignity[],
  houseLords: Array<{ house: number; lord: string; lordHouse: number }>,
): Yoga[] {
  const hL = (s: number) => ((s - ascSignIndex + 12) % 12) + 1;
  const hM = (s: number) => ((s - moonSignIndex + 12) % 12) + 1;
  const sign: Record<string, number> = {};
  const houseL: Record<string, number> = {};
  const houseM: Record<string, number> = {};
  for (const p of PLANETS) {
    sign[p] = signOf(sidereal[p] ?? 0);
    houseL[p] = hL(sign[p]);
    houseM[p] = hM(sign[p]);
  }
  const dig: Record<string, PlanetDignity> = Object.fromEntries(dignities.map((d) => [d.planet, d]));
  const yogas: Yoga[] = [];

  // Pancha Mahapurusha
  for (const p of ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
    const d = dig[p]?.dignity;
    if ((d === 'Exalted' || d === 'Own sign' || d === 'Moolatrikona') && KENDRA.includes(houseL[p])) {
      yogas.push({ name: `${MAHAPURUSHA[p]} Yoga`, category: 'Mahapurusha', planets: [p], description: `${p} is ${d} in a kendra (house ${houseL[p]}) — a Pancha Mahapurusha yoga conferring its noble qualities.` });
    }
  }

  if (KENDRA.includes(houseM['Jupiter'])) {
    yogas.push({ name: 'Gajakesari Yoga', category: 'Raja', planets: ['Jupiter', 'Moon'], description: `Jupiter is in a kendra (${houseM['Jupiter']}th) from the Moon — wisdom, repute and prosperity.` });
  }
  if (sign['Sun'] === sign['Mercury']) {
    yogas.push({ name: 'Budha-Aditya Yoga', category: 'Dhana', planets: ['Sun', 'Mercury'], description: 'Sun and Mercury together — sharp intellect and communication.' });
  }
  if (sign['Moon'] === sign['Mars']) {
    yogas.push({ name: 'Chandra-Mangala Yoga', category: 'Dhana', planets: ['Moon', 'Mars'], description: 'Moon with Mars — drive and enterprise for wealth.' });
  }
  for (const p of PLANETS) {
    if (dig[p]?.dignity === 'Debilitated' && dig[p]?.neechaBhanga) {
      yogas.push({ name: 'Neecha Bhanga Raja Yoga', category: 'Raja', planets: [p], cancelled: false, description: `${p}'s debilitation is cancelled (Neecha Bhanga) — marked rise after early struggle.` });
    }
  }

  const lordByHouse: Record<number, string> = {};
  const lordHouseByHouse: Record<number, number> = {};
  for (const hl of houseLords) { lordByHouse[hl.house] = hl.lord; lordHouseByHouse[hl.house] = hl.lordHouse; }

  // Raja Yoga — a kendra lord and a trikona lord uniting in one house.
  const seenRaja = new Set<string>();
  for (const k of KENDRA) {
    for (const t of TRIKONA) {
      if (k === t) continue;
      const lk = lordByHouse[k];
      const lt = lordByHouse[t];
      if (lk && lt && lk !== lt && lordHouseByHouse[k] === lordHouseByHouse[t]) {
        const key = [lk, lt].sort().join('-');
        if (seenRaja.has(key)) continue;
        seenRaja.add(key);
        yogas.push({ name: 'Raja Yoga', category: 'Raja', planets: [lk, lt], description: `Lords of the ${k}th (kendra) and ${t}th (trikona) unite in house ${lordHouseByHouse[k]} — status and success.` });
      }
    }
  }

  // Dhana Yoga — two wealth-house lords together.
  const seenDhana = new Set<string>();
  for (let i = 0; i < WEALTH.length; i++) {
    for (let j = i + 1; j < WEALTH.length; j++) {
      const a = WEALTH[i];
      const b = WEALTH[j];
      const la = lordByHouse[a];
      const lb = lordByHouse[b];
      if (la && lb && la !== lb && lordHouseByHouse[a] === lordHouseByHouse[b]) {
        const key = [la, lb].sort().join('-');
        if (seenDhana.has(key)) continue;
        seenDhana.add(key);
        yogas.push({ name: 'Dhana Yoga', category: 'Dhana', planets: [la, lb], description: `Wealth-house lords (${a}th & ${b}th) combine in house ${lordHouseByHouse[a]} — financial gain.` });
      }
    }
  }

  // Vipreeta Raja Yoga — a dusthana (6th/8th/12th) lord placed in ANOTHER
  // dusthana house. Three named variants: Harsha (6th lord), Sarala (8th lord),
  // Vimala (12th lord). Loss-house lord weakening another loss-house paradoxically
  // strengthens the native (loss negating loss).
  const DUSTHANA = [6, 8, 12];
  const VIPREETA_NAME: Record<number, string> = { 6: 'Harsha', 8: 'Sarala', 12: 'Vimala' };
  for (const dh of DUSTHANA) {
    const lord = lordByHouse[dh];
    const lordHouse = lordHouseByHouse[dh];
    if (lord && DUSTHANA.includes(lordHouse) && lordHouse !== dh) {
      yogas.push({
        name: `${VIPREETA_NAME[dh]} Vipreeta Raja Yoga`,
        category: 'Raja',
        planets: [lord],
        description: `${dh}th lord (${lord}) sits in the ${lordHouse}th (also a dusthana) — Vipreeta Raja Yoga: setbacks convert into unexpected gains, often after the difficulty has already run its course.`,
      });
    }
  }

  // Kemadruma — Moon isolated (no planet in 2nd/12th from Moon, none conjunct).
  const occ = (h: number) => PLANETS.some((p) => p !== 'Moon' && p !== 'Sun' && houseM[p] === h);
  const conjMoon = PLANETS.some((p) => p !== 'Moon' && sign[p] === sign['Moon']);
  if (!occ(2) && !occ(12) && !conjMoon) {
    const cancelled = KENDRA.includes(houseL['Moon']) || PLANETS.some((p) => p !== 'Moon' && (KENDRA.includes(houseM[p]) || KENDRA.includes(houseL[p])));
    yogas.push({
      name: 'Kemadruma Yoga',
      category: 'Dosha',
      planets: ['Moon'],
      cancelled,
      description: cancelled
        ? 'Moon is isolated (Kemadruma) but cancelled by supportive kendra placements.'
        : 'Moon is isolated (Kemadruma) — emotional ups and downs; remedies advised.',
    });
  }

  return yogas;
}
