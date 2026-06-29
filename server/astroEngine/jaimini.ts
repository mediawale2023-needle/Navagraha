/**
 * Jaimini layer: Chara Dasha, Char Karakas, Karakamsha, Ishta Devata.
 *
 * This is genuinely new ground for the codebase — Parashari dasha/yoga/dosha
 * already exists in dasha.ts/yogas.ts/doshas.ts, but nothing here used the
 * Jaimini system before. Where the classical sources genuinely agree (Char
 * Karaka ranking, Chara Dasha sign-duration rule) we implement the standard,
 * widely-published version and cite it in comments. Where lineages diverge
 * (antardasha sub-division of Chara Dasha; the Ishta Devata derivation) we
 * implement ONE documented, internally-consistent method and say so plainly —
 * an astrologer should cross-check these against their own reference software
 * before quoting Chara Dasha *antardasha* dates to a client. The Mahadasha
 * (rasi-level) dates follow the standard, uncontested rule.
 */
import { SIGNS, SIGN_LORDS, navamsaSign } from './vedic.js';

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// ─── Char Karakas (8-karaka scheme: 7 grahas + Rahu; Ketu excluded) ──────────
// This is the scheme taught by K.N. Rao / Sanjay Rath and most widely used in
// modern Jaimini practice. Ranking is by degree elapsed within the occupied
// sign (0–30°), HIGHEST degree = Atmakaraka. Rahu's degree is counted in
// REVERSE (30° − actual degree) because the nodes move retrograde — this is
// the standard correction, not a heuristic.
const KARAKA_NAMES = [
  'Atmakaraka',     // AK  — soul, self
  'Amatyakaraka',   // AmK — career, counsel, mind's minister
  'Bhratrukaraka',  // BK  — siblings, courage
  'Matrukaraka',    // MK  — mother, emotions, home
  'Pitrukaraka',    // PiK — father, authority, dharma
  'Putrakaraka',    // PuK — children, creativity, intelligence
  'Gnatikaraka',    // GK  — relatives, obstacles, struggle
  'Daarakaraka',    // DK  — spouse, partnerships
] as const;

export type KarakaName = typeof KARAKA_NAMES[number];

export interface CharKaraka {
  karaka: KarakaName;
  abbr: string;
  planet: string;
  rankDegree: number; // the degree value used for ranking (Rahu already reversed)
}

const KARAKA_ABBR: Record<KarakaName, string> = {
  Atmakaraka: 'AK', Amatyakaraka: 'AmK', Bhratrukaraka: 'BK', Matrukaraka: 'MK',
  Pitrukaraka: 'PiK', Putrakaraka: 'PuK', Gnatikaraka: 'GK', Daarakaraka: 'DK',
};

/**
 * Compute the 8 Char Karakas from sidereal longitudes.
 * @param sidereal  planet -> sidereal longitude (must include Rahu)
 */
export function computeCharKarakas(sidereal: Record<string, number>): CharKaraka[] {
  const CANDIDATES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu'];
  const ranked = CANDIDATES.map((planet) => {
    const lon = ((sidereal[planet] ?? 0) % 360 + 360) % 360;
    const degInSign = lon % 30;
    const rankDegree = planet === 'Rahu' ? 30 - degInSign : degInSign;
    return { planet, rankDegree };
  }).sort((a, b) => b.rankDegree - a.rankDegree);

  return ranked.map((r, i) => ({
    karaka: KARAKA_NAMES[i],
    abbr: KARAKA_ABBR[KARAKA_NAMES[i]],
    planet: r.planet,
    rankDegree: parseFloat(r.rankDegree.toFixed(4)),
  }));
}

// ─── Karakamsha & Ishta Devata ────────────────────────────────────────────────

const ISHTA_DEVATA_BY_PLANET: Record<string, { devata: string; note: string }> = {
  Sun: { devata: 'Shiva (or Surya Narayana)', note: 'Sun in/aspecting the 12th-from-Karakamsha favours Shiva/solar worship.' },
  Moon: { devata: 'Devi / Durga', note: 'Moon there favours Devi worship in her nurturing form.' },
  Mars: { devata: 'Subramanya (Kartikeya) / Narasimha', note: 'Mars favours the warrior-deity forms.' },
  Mercury: { devata: 'Vishnu', note: 'Mercury favours Vishnu / preserver-deity worship.' },
  Jupiter: { devata: 'Dakshinamurthy / Brihaspati / Vishnu', note: 'Jupiter favours the guru-as-deity forms.' },
  Venus: { devata: 'Lakshmi / Indrani', note: 'Venus favours goddess-of-abundance forms.' },
  Saturn: { devata: 'Hanuman / Kurma avatara / Yama-dharma', note: 'Saturn favours disciplined, service-oriented worship.' },
  Rahu: { devata: 'Durga (Chhinnamasta form) / Kali', note: 'Rahu favours fierce-goddess worship.' },
  Ketu: { devata: 'Ganesha', note: 'Ketu favours Ganesha (obstacle-removal) worship.' },
};

export interface KarakamshaResult {
  atmakarakaPlanet: string;
  karakamshaSignIndex: number;
  karakamshaSign: string;
  ishtaDevataPlanet: string;
  ishtaDevata: string;
  ishtaDevataNote: string;
  derivation: string;
}

/**
 * Karakamsha = the Navamsa (D9) sign occupied by the Atmakaraka.
 * Ishta Devata = derived from whichever planet occupies (or, absent that,
 * aspects) the 12th house counted from the Karakamsha — the method taught by
 * Sanjay Rath, adopted widely in the K.N. Rao lineage. This is the single most
 * commonly cited method but is NOT universal scripture — note this to the
 * client only if asked about methodology.
 */
export function computeKarakamsha(
  sidereal: Record<string, number>,
  charKarakas: CharKaraka[],
): KarakamshaResult {
  const ak = charKarakas.find((k) => k.karaka === 'Atmakaraka')!;
  const akNavSign = navamsaSign(sidereal[ak.planet] ?? 0);
  const twelfthFromKarakamsha = (akNavSign + 11) % 12; // 12th house = 11 signs ahead

  // Which planet(s) sit in that navamsa sign? (by navamsa sign, not rasi sign)
  const occupants = Object.entries(sidereal)
    .filter(([planet]) => planet !== 'Rahu' && planet !== 'Ketu') // classical Ishta Devata uses the 7 grahas
    .filter(([, lon]) => navamsaSign(lon) === twelfthFromKarakamsha)
    .map(([planet]) => planet);

  // Fallback: if the 12th-from-Karakamsha in Navamsa is empty, use its rasi lord.
  const chosenPlanet = occupants[0] ?? SIGN_LORDS[SIGNS[twelfthFromKarakamsha]];
  const { devata, note } = ISHTA_DEVATA_BY_PLANET[chosenPlanet] ?? ISHTA_DEVATA_BY_PLANET['Jupiter'];

  return {
    atmakarakaPlanet: ak.planet,
    karakamshaSignIndex: akNavSign,
    karakamshaSign: SIGNS[akNavSign],
    ishtaDevataPlanet: chosenPlanet,
    ishtaDevata: devata,
    ishtaDevataNote: note,
    derivation: occupants.length
      ? `12th house from Karakamsha (${SIGNS[twelfthFromKarakamsha]} navamsa) occupied by ${occupants.join(', ')}.`
      : `12th house from Karakamsha (${SIGNS[twelfthFromKarakamsha]} navamsa) is empty in D9 — fell back to its rasi lord (${chosenPlanet}).`,
  };
}

// ─── Chara Dasha (sign-based Jaimini Mahadasha) ──────────────────────────────

export interface CharaAntardasha {
  sign: string;
  years: number;
  status: 'past' | 'current' | 'upcoming';
  startDate: string;
  endDate: string;
}

export interface CharaDashaEntry {
  sign: string;
  signIndex: number;
  years: number;
  status: 'past' | 'current' | 'upcoming';
  startDate: string;
  endDate: string;
  antardashas: CharaAntardasha[];
}

/**
 * Years a given rasi runs for in Chara Dasha:
 * Count from the rasi to the sign occupied by ITS OWN LORD (in the natal
 * chart) — forward if the rasi is odd (Aries/Gemini/Leo/Libra/Sagittarius/
 * Aquarius), backward if even — counting inclusively (1–12). If the lord sits
 * in the rasi itself (count would be 1), the period is taken as the full 12
 * years (the standard exception for "lord in own sign").
 */
function charaYearsForSign(signIdx: number, sidereal: Record<string, number>): number {
  const lordPlanet = SIGN_LORDS[SIGNS[signIdx]];
  const lordSignIdx = Math.floor((((sidereal[lordPlanet] ?? 0) % 360) + 360) % 360 / 30);
  const isOdd = signIdx % 2 === 0; // index 0 (Aries) = 1st sign = odd

  let count: number;
  if (isOdd) {
    count = ((lordSignIdx - signIdx + 12) % 12) + 1;
  } else {
    count = ((signIdx - lordSignIdx + 12) % 12) + 1;
  }
  return count === 1 ? 12 : count;
}

function charaSequence(startSignIdx: number): number[] {
  const isOdd = startSignIdx % 2 === 0;
  return Array.from({ length: 12 }, (_, i) =>
    isOdd ? (startSignIdx + i) % 12 : (startSignIdx - i + 120) % 12,
  );
}

/**
 * Full Jaimini Chara Dasha sequence starting from the Lagna, with proportional
 * antardashas (a common simplification: each Mahadasha's own 12-sign sequence,
 * in the same direction, weighted by that sub-sign's own chara-years).
 */
export function calculateCharaDasha(
  ascSiderealLon: number,
  sidereal: Record<string, number>,
  birthDate: Date,
): CharaDashaEntry[] {
  const lagnaIdx = Math.floor((((ascSiderealLon % 360) + 360) % 360) / 30);
  const sequence = charaSequence(lagnaIdx);
  const now = Date.now();

  let cursor = new Date(birthDate.getTime());
  const out: CharaDashaEntry[] = [];

  for (const signIdx of sequence) {
    const years = charaYearsForSign(signIdx, sidereal);
    const start = new Date(cursor.getTime());
    const end = new Date(cursor.getTime() + years * MS_PER_YEAR);

    // Antardashas: same 12-sign direction starting at this Mahadasha sign,
    // each weighted by its own chara-years as a fraction of the 12-sign total.
    const subSeq = charaSequence(signIdx);
    const subYears = subSeq.map((s) => charaYearsForSign(s, sidereal));
    const totalSubYears = subYears.reduce((a, b) => a + b, 0);

    let subCursor = new Date(start.getTime());
    const antardashas: CharaAntardasha[] = subSeq.map((s, i) => {
      const frac = subYears[i] / totalSubYears;
      const subStart = new Date(subCursor.getTime());
      const subEnd = i === subSeq.length - 1
        ? new Date(end.getTime())
        : new Date(subCursor.getTime() + frac * years * MS_PER_YEAR);
      subCursor = subEnd;
      const sStr = subStart.toISOString().slice(0, 10);
      const eStr = subEnd.toISOString().slice(0, 10);
      const status: CharaAntardasha['status'] =
        now >= subStart.getTime() && now <= subEnd.getTime() ? 'current'
        : now > subEnd.getTime() ? 'past' : 'upcoming';
      return { sign: SIGNS[s], years: parseFloat((subYears[i]).toFixed(2)), status, startDate: sStr, endDate: eStr };
    });

    const sStr = start.toISOString().slice(0, 10);
    const eStr = end.toISOString().slice(0, 10);
    const status: CharaDashaEntry['status'] =
      now >= start.getTime() && now <= end.getTime() ? 'current'
      : now > end.getTime() ? 'past' : 'upcoming';

    out.push({ sign: SIGNS[signIdx], signIndex: signIdx, years, status, startDate: sStr, endDate: eStr, antardashas });
    cursor = end;
  }

  return out;
}
