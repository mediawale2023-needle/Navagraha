/**
 * Ashtakoot Kundli Matching (Guna Milan)
 *
 * The 8-factor compatibility system used in Vedic marriage matching.
 * Maximum score: 36 points.
 *
 * Factors:
 *  1. Varna     (1 pt)  — spiritual / caste compatibility
 *  2. Vashya    (2 pts) — dominance / control
 *  3. Tara      (3 pts) — birth star compatibility
 *  4. Yoni      (4 pts) — sexual / intimate compatibility
 *  5. Graha Maitri (5 pts) — mental / lord friendship
 *  6. Gana      (6 pts) — temperament
 *  7. Bhakoot   (7 pts) — health / prosperity
 *  8. Nadi      (8 pts) — health / genetics
 */

import {
  NAKSHATRAS,
  SIGNS,
  SIGN_LORDS,
  SIGN_VARNA,
  nakshatraIndex,
  signFromLon,
  type Sign,
} from './vedic.js';

// ─── Supporting Lookup Tables ─────────────────────────────────────────────────

// Vashya groups (sign → group)
const VASHYA_GROUP: Record<Sign, string> = {
  Aries: 'Chatushpad',  Taurus: 'Chatushpad', Gemini: 'Manav',
  Cancer: 'Jalchar',    Leo: 'Vanchar',        Virgo: 'Manav',
  Libra: 'Manav',       Scorpio: 'Keeta',      Sagittarius: 'Chatushpad',
  Capricorn: 'Jalchar', Aquarius: 'Manav',     Pisces: 'Jalchar',
};

// Vashya compatibility pairs (group → groups it controls)
const VASHYA_CONTROLS: Record<string, string[]> = {
  Manav:     ['Keeta', 'Vanchar'],
  Chatushpad: ['Manav'],
  Jalchar:   ['Manav'],
  Vanchar:   ['Chatushpad'],
  Keeta:     ['Jalchar'],
};

// Yoni (animal symbol) per nakshatra — index maps to NAKSHATRAS order
// Compatibility: same yoni = 4, friendly yoni = 2-3, neutral = 1, enemy = 0
const YONI_ENEMIES: Record<string, string> = {
  Horse: 'Buffalo', Buffalo: 'Horse',
  Elephant: 'Lion', Lion: 'Elephant',
  Sheep: 'Dog', Dog: 'Sheep',
  Serpent: 'Mongoose', Mongoose: 'Serpent',
  Cat: 'Rat', Rat: 'Cat',
  Cow: 'Tiger', Tiger: 'Cow',
  Rabbit: 'Monkey', Monkey: 'Rabbit',
};

// Graha Maitri — planetary friendship table (sign lord → lord → friendship)
// 2 = best friends, 1 = friends, 0 = neutral, -1 = enemies
const PLANET_FRIENDSHIP: Record<string, Record<string, number>> = {
  Sun:     { Sun: 2, Moon: 1, Mars: 1, Mercury: -1, Jupiter: 1, Venus: -1, Saturn: -1, Rahu: -1, Ketu: -1 },
  Moon:    { Sun: 1, Moon: 2, Mars: 0, Mercury: 1,  Jupiter: 1, Venus: 0,  Saturn: 0,  Rahu: -1, Ketu: -1 },
  Mars:    { Sun: 1, Moon: 1, Mars: 2, Mercury: -1, Jupiter: 1, Venus: 0,  Saturn: 0,  Rahu: -1, Ketu: 1  },
  Mercury: { Sun: 1, Moon: 0, Mars: 0, Mercury: 2,  Jupiter: 0, Venus: 1,  Saturn: 1,  Rahu: 1,  Ketu: -1 },
  Jupiter: { Sun: 1, Moon: 1, Mars: 1, Mercury: -1, Jupiter: 2, Venus: -1, Saturn: 0,  Rahu: -1, Ketu: 1  },
  Venus:   { Sun: 0, Moon: 0, Mars: 0, Mercury: 1,  Jupiter: 0, Venus: 2,  Saturn: 1,  Rahu: 1,  Ketu: -1 },
  Saturn:  { Sun: -1, Moon: -1, Mars: -1, Mercury: 1, Jupiter: -1, Venus: 1, Saturn: 2, Rahu: 1, Ketu: -1 },
  Rahu:    { Sun: -1, Moon: -1, Mars: -1, Mercury: 1, Jupiter: -1, Venus: 1, Saturn: 1, Rahu: 2, Ketu: -1 },
  Ketu:    { Sun: -1, Moon: -1, Mars: 1,  Mercury: -1, Jupiter: 1, Venus: -1, Saturn: -1, Rahu: -1, Ketu: 2 },
};

// Gana groups per nakshatra
const GANA_ORDER = ['Deva', 'Manushya', 'Rakshasa'];

// Bhakoot (moon sign number compatibility)
// Incompatible pairs (sum of sign numbers): 6/8, 9/5, 12/2 counted from girl to boy
const BHAKOOT_INCOMPATIBLE = new Set(['6/8', '8/6', '9/5', '5/9', '12/2', '2/12']);

// Nadi types per nakshatra (repeating pattern of 3, 9 nakshatras each)
const NADI: ('Aadi' | 'Madhya' | 'Antya')[] = [
  'Aadi','Madhya','Antya', 'Antya','Madhya','Aadi',
  'Aadi','Madhya','Antya', 'Antya','Madhya','Aadi',
  'Aadi','Madhya','Antya', 'Antya','Madhya','Aadi',
  'Aadi','Madhya','Antya', 'Antya','Madhya','Aadi',
  'Aadi','Madhya','Antya',
];

// ─── Individual Factor Calculations ──────────────────────────────────────────

function calcVarna(girlSign: Sign, boySign: Sign): number {
  const g = SIGN_VARNA[girlSign];
  const b = SIGN_VARNA[boySign];
  return b <= g ? 1 : 0; // boy's varna must be <= girl's
}

function calcVashya(girlSign: Sign, boySign: Sign): number {
  const gGroup = VASHYA_GROUP[girlSign];
  const bGroup = VASHYA_GROUP[boySign];

  if (gGroup === bGroup) return 2;
  if (VASHYA_CONTROLS[gGroup]?.includes(bGroup)) return 1;
  if (VASHYA_CONTROLS[bGroup]?.includes(gGroup)) return 0.5;
  return 0;
}

function calcTara(girlNakIdx: number, boyNakIdx: number): number {
  // Count from girl's nakshatra to boy's (mod 9)
  const girlToBoy = ((boyNakIdx - girlNakIdx + 27) % 27) % 9 + 1;
  const boyToGirl = ((girlNakIdx - boyNakIdx + 27) % 27) % 9 + 1;

  // Auspicious tara: 1(Janma), 3(Vipat), 5(Pratyak), 7(Naidhana) = bad
  const inauspicious = new Set([3, 5, 7]);
  const gScore = inauspicious.has(girlToBoy) ? 0 : 1.5;
  const bScore = inauspicious.has(boyToGirl) ? 0 : 1.5;
  return gScore + bScore;
}

function calcYoni(girlNakIdx: number, boyNakIdx: number): number {
  const gYoni = NAKSHATRAS[girlNakIdx].yoni;
  const bYoni = NAKSHATRAS[boyNakIdx].yoni;

  if (gYoni === bYoni) return 4;
  if (YONI_ENEMIES[gYoni] === bYoni) return 0;
  // Friendly yonis: same gender animals
  const gGender = NAKSHATRAS[girlNakIdx].gender;
  const bGender = NAKSHATRAS[boyNakIdx].gender;
  if (gGender === bGender) return 2;
  return 1;
}

function calcGrahaMaitri(girlSign: Sign, boySign: Sign): number {
  const gLord = SIGN_LORDS[girlSign];
  const bLord = SIGN_LORDS[boySign];

  const gToB = PLANET_FRIENDSHIP[gLord]?.[bLord] ?? 0;
  const bToG = PLANET_FRIENDSHIP[bLord]?.[gLord] ?? 0;

  if (gToB >= 1 && bToG >= 1) return 5;
  if (gToB >= 1 && bToG === 0) return 4;
  if (gToB === 0 && bToG >= 1) return 4;
  if (gToB === 0 && bToG === 0) return 3;
  if (gToB < 0 && bToG >= 1) return 1;
  if (gToB >= 1 && bToG < 0) return 1;
  return 0;
}

function calcGana(girlNakIdx: number, boyNakIdx: number): number {
  const gGana = NAKSHATRAS[girlNakIdx].gana;
  const bGana = NAKSHATRAS[boyNakIdx].gana;

  if (gGana === bGana) return 6;
  if (gGana === 'Deva'     && bGana === 'Manushya') return 5;
  if (gGana === 'Manushya' && bGana === 'Deva')     return 5;
  if (gGana === 'Deva'     && bGana === 'Rakshasa') return 1;
  if (gGana === 'Rakshasa' && bGana === 'Deva')     return 0;
  if (gGana === 'Manushya' && bGana === 'Rakshasa') return 0;
  return 3;
}

function calcBhakoot(girlSignIdx: number, boySignIdx: number): number {
  const g = girlSignIdx + 1; // 1-based
  const b = boySignIdx  + 1;

  // Count from girl to boy and boy to girl
  const gToB = ((b - g + 12) % 12) || 12;
  const bToG = ((g - b + 12) % 12) || 12;

  const key = `${gToB}/${bToG}`;
  return BHAKOOT_INCOMPATIBLE.has(key) ? 0 : 7;
}

function calcNadi(girlNakIdx: number, boyNakIdx: number): number {
  const gNadi = NADI[girlNakIdx];
  const bNadi = NADI[boyNakIdx];
  return gNadi !== bNadi ? 8 : 0;
}

// ─── Main Matching Function ───────────────────────────────────────────────────

export interface AshtakootResult {
  score:       number;
  maxScore:    number;
  percentage:  number;
  compatibility: string;
  recommendation: string;
  details: Array<{ koot: string; score: number; maxScore: number; description: string }>;
  dosha: { hasDosha: boolean; type: string; description: string };
}

/**
 * Calculate Ashtakoot compatibility between two people.
 *
 * @param girlMoonSiderealLon  Girl's Moon sidereal longitude (degrees)
 * @param boyMoonSiderealLon   Boy's Moon sidereal longitude (degrees)
 */
export function ashtakootMatch(
  girlMoonSiderealLon: number,
  boyMoonSiderealLon: number,
): AshtakootResult {
  const gNakIdx   = nakshatraIndex(girlMoonSiderealLon);
  const bNakIdx   = nakshatraIndex(boyMoonSiderealLon);
  const girlSign  = signFromLon(girlMoonSiderealLon);
  const boySign   = signFromLon(boyMoonSiderealLon);
  const girlSignIdx = SIGNS.indexOf(girlSign);
  const boySignIdx  = SIGNS.indexOf(boySign);

  const factors = [
    { koot: 'Varna',        max: 1,  score: calcVarna(girlSign, boySign),                description: 'Spiritual and caste compatibility' },
    { koot: 'Vashya',       max: 2,  score: calcVashya(girlSign, boySign),               description: 'Dominance and control between partners' },
    { koot: 'Tara',         max: 3,  score: calcTara(gNakIdx, bNakIdx),                  description: 'Birth star and fortune compatibility' },
    { koot: 'Yoni',         max: 4,  score: calcYoni(gNakIdx, bNakIdx),                  description: 'Sexual and physical compatibility' },
    { koot: 'Graha Maitri', max: 5,  score: calcGrahaMaitri(girlSign, boySign),          description: 'Mental compatibility through planetary lords' },
    { koot: 'Gana',         max: 6,  score: calcGana(gNakIdx, bNakIdx),                  description: 'Temperament and nature compatibility' },
    { koot: 'Bhakoot',      max: 7,  score: calcBhakoot(girlSignIdx, boySignIdx),        description: 'Health and prosperity compatibility' },
    { koot: 'Nadi',         max: 8,  score: calcNadi(gNakIdx, bNakIdx),                  description: 'Health, genes, and progeny compatibility' },
  ];

  const score    = factors.reduce((s, f) => s + f.score, 0);
  const maxScore = 36;
  const pct      = Math.round((score / maxScore) * 100);

  const compatibility =
    pct >= 75 ? 'Excellent' :
    pct >= 60 ? 'Good' :
    pct >= 40 ? 'Average' : 'Poor';

  const recommendation =
    score >= 27 ? 'This is an excellent match. The couple is highly compatible.' :
    score >= 21 ? 'This is a good match with strong compatibility.' :
    score >= 18 ? 'This is an average match. Some adjustments may be needed.' :
    'This match has some challenges. Consulting an astrologer is recommended.';

  // Check for dosha cancellations / presence
  const nadiDosha  = factors[7].score === 0;
  const bhakootDosha = factors[6].score === 0;

  const doshaType = nadiDosha ? 'Nadi Dosha' : bhakootDosha ? 'Bhakoot Dosha' : '';
  const doshaDesc = nadiDosha
    ? 'Nadi Dosha is present. Both partners share the same Nadi, which may affect health and progeny.'
    : bhakootDosha
    ? 'Bhakoot Dosha is present. Differences in moon signs may cause obstacles in married life.'
    : '';

  return {
    score,
    maxScore,
    percentage: pct,
    compatibility,
    recommendation,
    details: factors.map(f => ({
      koot:        f.koot,
      score:       f.score,
      maxScore:    f.max,
      description: f.description,
    })),
    dosha: {
      hasDosha:    nadiDosha || bhakootDosha,
      type:        doshaType,
      description: doshaDesc,
    },
  };
}
