/**
 * Ashtakoot Kundli Matching (Guna Milan)
 *
 * The 8-factor compatibility system used in Vedic marriage matching.
 * Maximum score: 36 points.
 *
 * Factors:
 *  1. Varna     (1 pt)  — spiritual temperament
 *  2. Vashya    (2 pts) — mutual attraction / influence
 *  3. Tara      (3 pts) — birth star compatibility
 *  4. Yoni      (4 pts) — instinctive / physical compatibility
 *  5. Graha Maitri (5 pts) — friendship of the Moon-sign lords
 *  6. Gana      (6 pts) — temperament
 *  7. Bhakoot   (7 pts) — relative placement of the Moon signs
 *  8. Nadi      (8 pts) — Nadi of the birth stars
 *
 * Varna, Vashya and Gana are asymmetric: the first argument is always the
 * bride's Moon, the second the groom's.
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
import { naturalRelation } from './dignity.js';

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

// Yoni compatibility, the standard 14 × 14 table: 4 for the same yoni, 0 for
// the sworn enemies (Horse–Buffalo, Elephant–Lion, Sheep–Monkey,
// Serpent–Mongoose, Dog–Deer, Cat–Rat, Cow–Tiger). `Rabbit` is this
// codebase's name for the Mriga (deer) yoni of Anuradha and Jyeshtha.
const YONI_ORDER = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Rabbit', 'Monkey', 'Mongoose', 'Lion'];
const YONI_TABLE: number[][] = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

// Bhakoot: Moon signs 2/12, 5/9 or 6/8 from each other score 0.
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
  // 1 when the groom's varna is the same as or higher than the bride's.
  return SIGN_VARNA[boySign] >= SIGN_VARNA[girlSign] ? 1 : 0;
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

  // Vipat (3), Pratyak (5) and Naidhana (7) are inauspicious.
  const inauspicious = new Set([3, 5, 7]);
  const gScore = inauspicious.has(girlToBoy) ? 0 : 1.5;
  const bScore = inauspicious.has(boyToGirl) ? 0 : 1.5;
  return gScore + bScore;
}

function calcYoni(girlNakIdx: number, boyNakIdx: number): number {
  const g = YONI_ORDER.indexOf(NAKSHATRAS[girlNakIdx].yoni);
  const b = YONI_ORDER.indexOf(NAKSHATRAS[boyNakIdx].yoni);
  if (g < 0 || b < 0) throw new Error(`Unknown yoni for nakshatra ${girlNakIdx}/${boyNakIdx}`);
  return YONI_TABLE[g][b];
}

/** Graha Maitri from the natural relationships of the two Moon-sign lords. */
function calcGrahaMaitri(girlSign: Sign, boySign: Sign): number {
  const gLord = SIGN_LORDS[girlSign];
  const bLord = SIGN_LORDS[boySign];
  if (gLord === bLord) return 5;
  const pair = [naturalRelation(gLord, bLord), naturalRelation(bLord, gLord)].sort().join('+');
  const POINTS: Record<string, number> = {
    'friend+friend': 5, 'friend+neutral': 4, 'neutral+neutral': 3,
    'enemy+friend': 1, 'enemy+neutral': 0.5, 'enemy+enemy': 0,
  };
  return POINTS[pair];
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

  // Inclusive counts (the sign itself is 1st), from girl to boy and back.
  const gToB = ((b - g + 12) % 12) + 1;
  const bToG = ((g - b + 12) % 12) + 1;

  const key = `${gToB}/${bToG}`;
  return BHAKOOT_INCOMPATIBLE.has(key) ? 0 : 7;
}

function calcNadi(girlNakIdx: number, boyNakIdx: number): number {
  const gNadi = NADI[girlNakIdx];
  const bNadi = NADI[boyNakIdx];
  return gNadi !== bNadi ? 8 : 0;
}

// ─── Dosha exceptions ────────────────────────────────────────────────────────

/** Bhakoot Dosha is cancelled when the two Moon-sign lords are the same planet or mutual natural friends. */
function bhakootCancellation(girlSign: Sign, boySign: Sign): string | null {
  const g = SIGN_LORDS[girlSign];
  const b = SIGN_LORDS[boySign];
  if (g === b) return `both Moon signs are ruled by ${g}`;
  if (naturalRelation(g, b) === 'friend' && naturalRelation(b, g) === 'friend') return `the Moon-sign lords ${g} and ${b} are mutual friends`;
  return null;
}

/** Nadi Dosha is cancelled when the Moons share a sign but not a nakshatra, or a nakshatra but not a sign. */
function nadiCancellation(girlNakIdx: number, boyNakIdx: number, girlSign: Sign, boySign: Sign): string | null {
  if (girlSign === boySign && girlNakIdx !== boyNakIdx) return `both Moons are in ${girlSign} but in different nakshatras`;
  if (girlNakIdx === boyNakIdx && girlSign !== boySign) return `both Moons are in ${NAKSHATRAS[girlNakIdx].name} but in different signs`;
  return null;
}

// ─── Main Matching Function ───────────────────────────────────────────────────

export interface MatchingDosha {
  type: 'Nadi Dosha' | 'Bhakoot Dosha';
  cancelled: boolean;
  /** Why the dosha is cancelled, when it is. */
  cancellation: string | null;
}

export interface AshtakootResult {
  score:       number;
  maxScore:    number;
  percentage:  number;
  compatibility: string;
  recommendation: string;
  details: Array<{ koot: string; score: number; maxScore: number; description: string }>;
  /** The doshas that stand after their exceptions. */
  dosha: { hasDosha: boolean; type: string; description: string };
  /** Every matching dosha found, cancelled or not. The koota keeps 0 points either way. */
  doshas: MatchingDosha[];
}

const DOSHA_TEXT: Record<MatchingDosha['type'], string> = {
  'Nadi Dosha': 'Both Moons fall in the same Nadi, which tradition treats as the most serious koota mismatch.',
  'Bhakoot Dosha': 'The two Moon signs are 2/12, 5/9 or 6/8 from each other, which tradition reads as friction in shared life.',
};

/**
 * Calculate Ashtakoot compatibility between two people.
 *
 * @param girlMoonSiderealLon  Bride's Moon sidereal longitude (degrees)
 * @param boyMoonSiderealLon   Groom's Moon sidereal longitude (degrees)
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
    { koot: 'Varna',        max: 1,  score: calcVarna(girlSign, boySign),                description: "Spiritual temperament (groom's varna the same as or higher than the bride's)" },
    { koot: 'Vashya',       max: 2,  score: calcVashya(girlSign, boySign),               description: 'Mutual attraction and influence' },
    { koot: 'Tara',         max: 3,  score: calcTara(gNakIdx, bNakIdx),                  description: 'Birth-star harmony, counted both ways' },
    { koot: 'Yoni',         max: 4,  score: calcYoni(gNakIdx, bNakIdx),                  description: 'Instinctive and physical compatibility' },
    { koot: 'Graha Maitri', max: 5,  score: calcGrahaMaitri(girlSign, boySign),          description: 'Friendship of the two Moon-sign lords' },
    { koot: 'Gana',         max: 6,  score: calcGana(gNakIdx, bNakIdx),                  description: 'Temperament (Deva, Manushya, Rakshasa)' },
    { koot: 'Bhakoot',      max: 7,  score: calcBhakoot(girlSignIdx, boySignIdx),        description: 'Relative placement of the two Moon signs' },
    { koot: 'Nadi',         max: 8,  score: calcNadi(gNakIdx, bNakIdx),                  description: 'Nadi of the two birth stars' },
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

  const doshas: MatchingDosha[] = [];
  if (factors[7].score === 0) {
    const c = nadiCancellation(gNakIdx, bNakIdx, girlSign, boySign);
    doshas.push({ type: 'Nadi Dosha', cancelled: c != null, cancellation: c });
  }
  if (factors[6].score === 0) {
    const c = bhakootCancellation(girlSign, boySign);
    doshas.push({ type: 'Bhakoot Dosha', cancelled: c != null, cancellation: c });
  }
  const standing = doshas.filter((d) => !d.cancelled);

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
      hasDosha:    standing.length > 0,
      type:        standing.map((d) => d.type).join(' and '),
      description: standing.map((d) => DOSHA_TEXT[d.type]).join(' '),
    },
    doshas,
  };
}
