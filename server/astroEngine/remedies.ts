/**
 * Ascendant-specific remedies based on each planet's FUNCTIONAL nature for the
 * Lagna (trikona/kendra/dusthana lordship), not a generic symptom match.
 * Strengthen the Lagna lord, the Yogakaraka and weak functional benefics;
 * pacify functional malefics by donation rather than gemstones.
 */
import type { PlanetDignity } from './dignity.js';

const PLANETS7 = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const GEM: Record<string, string> = { Sun: 'Ruby', Moon: 'Pearl', Mars: 'Red Coral', Mercury: 'Emerald', Jupiter: 'Yellow Sapphire', Venus: 'Diamond', Saturn: 'Blue Sapphire' };
const MANTRA: Record<string, { m: string; n: number }> = {
  Sun: { m: 'Om Hraam Hreem Hroum Sah Suryaya Namah', n: 7000 },
  Moon: { m: 'Om Shraam Shreem Shroum Sah Chandraya Namah', n: 11000 },
  Mars: { m: 'Om Kraam Kreem Kroum Sah Bhaumaya Namah', n: 10000 },
  Mercury: { m: 'Om Braam Breem Broum Sah Budhaya Namah', n: 9000 },
  Jupiter: { m: 'Om Graam Greem Groum Sah Gurave Namah', n: 19000 },
  Venus: { m: 'Om Draam Dreem Droum Sah Shukraya Namah', n: 16000 },
  Saturn: { m: 'Om Praam Preem Proum Sah Shanaischaraya Namah', n: 23000 },
};
const DAY: Record<string, string> = { Sun: 'Sunday', Moon: 'Monday', Mars: 'Tuesday', Mercury: 'Wednesday', Jupiter: 'Thursday', Venus: 'Friday', Saturn: 'Saturday' };
const DAAN: Record<string, string> = {
  Sun: 'wheat, jaggery or copper', Moon: 'rice, milk or silver', Mars: 'red lentils or copper',
  Mercury: 'green gram or green cloth', Jupiter: 'turmeric, gram dal or yellow items',
  Venus: 'white sweets, ghee or white cloth', Saturn: 'black sesame, mustard oil or black cloth',
};
const DEITY: Record<string, string> = {
  Sun: 'Surya / Shiva', Moon: 'Parvati / Shiva', Mars: 'Hanuman', Mercury: 'Vishnu / Ganesha',
  Jupiter: 'Brihaspati / Vishnu', Venus: 'Lakshmi', Saturn: 'Shani / Hanuman',
};

export interface Remedy {
  focus: string;
  action: 'Strengthen' | 'Pacify';
  gemstone?: string;
  mantra: string;
  japaCount: number;
  donation?: string;
  day: string;
  deity: string;
  reason: string;
}

export function computeRemedies(
  dignities: PlanetDignity[],
  houseLords: Array<{ house: number; lord: string; lordHouse: number }>,
  sadeSatiActive = false,
): Remedy[] {
  const lordsOwned: Record<string, number[]> = {};
  const planetHouse: Record<string, number> = {};
  for (const hl of houseLords) {
    (lordsOwned[hl.lord] ||= []).push(hl.house);
    planetHouse[hl.lord] = hl.lordHouse;
  }
  const dig: Record<string, PlanetDignity> = Object.fromEntries(dignities.map((d) => [d.planet, d]));
  const lagnaLord = houseLords.find((h) => h.house === 1)?.lord;

  const ownsAny = (p: string, hs: number[]) => (lordsOwned[p] || []).some((h) => hs.includes(h));
  const isTrikona = (p: string) => ownsAny(p, [1, 5, 9]);
  const isKendra = (p: string) => ownsAny(p, [4, 7, 10]);
  const isDusthana = (p: string) => ownsAny(p, [6, 8, 12]);
  const yogakaraka = PLANETS7.find((p) => isTrikona(p) && isKendra(p));

  const remedies: Remedy[] = [];
  const seen = new Set<string>();
  const add = (p: string, action: Remedy['action'], reason: string) => {
    if (!MANTRA[p] || seen.has(p)) return;
    seen.add(p);
    remedies.push({
      focus: p,
      action,
      gemstone: action === 'Strengthen' ? GEM[p] : undefined,
      mantra: MANTRA[p].m,
      japaCount: MANTRA[p].n,
      donation: action === 'Pacify' ? DAAN[p] : undefined,
      day: DAY[p],
      deity: DEITY[p],
      reason,
    });
  };

  if (lagnaLord) add(lagnaLord, 'Strengthen', `${lagnaLord} is your Ascendant lord — strengthening it supports overall vitality and life direction.`);
  if (yogakaraka) add(yogakaraka, 'Strengthen', `${yogakaraka} is the Yogakaraka for your ascendant (owns a kendra and a trikona) — its gemstone is especially auspicious.`);

  for (const p of PLANETS7) {
    if (isTrikona(p) && !isDusthana(p)) {
      const d = dig[p];
      const weak = d && (d.dignity === 'Debilitated' || d.combust || [6, 8, 12].includes(planetHouse[p]));
      if (weak) add(p, 'Strengthen', `${p} is a functional benefic for you but currently weak (${d.dignity}${d.combust ? ', combust' : ''}) — strengthen it.`);
    }
  }

  if (sadeSatiActive) add('Saturn', 'Pacify', 'Saturn is in Sade Sati — pacification eases hardship and delay.');

  for (const p of PLANETS7) {
    if (isDusthana(p) && !isTrikona(p)) {
      add(p, 'Pacify', `${p} rules a dusthana (6/8/12) for your ascendant — pacify by donation; avoid wearing its gemstone.`);
    }
  }

  return remedies.slice(0, 6);
}
