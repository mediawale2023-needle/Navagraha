/**
 * Vedic astrology lookup data and utilities.
 *
 * Covers: zodiac signs (rashis), nakshatras, planetary lords,
 * house assignment, remedies, and sign/planet classifications.
 */

// ─── Zodiac Signs (Rashis) ────────────────────────────────────────────────────

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer',
  'Leo', 'Virgo', 'Libra', 'Scorpio',
  'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

export type Sign = typeof SIGNS[number];

/** Lord (ruling planet) of each sign */
export const SIGN_LORDS: Record<Sign, string> = {
  Aries: 'Mars',       Taurus: 'Venus',    Gemini: 'Mercury',  Cancer: 'Moon',
  Leo: 'Sun',          Virgo: 'Mercury',   Libra: 'Venus',     Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
};

/** Varna (caste) of each sign — used in Ashtakoot matching */
export const SIGN_VARNA: Record<Sign, number> = {
  // 1=Shudra (Air), 2=Vaishya (Earth), 3=Kshatriya (Fire), 4=Brahmin (Water)
  Aries: 3,       Taurus: 2,      Gemini: 1,      Cancer: 4,
  Leo: 3,         Virgo: 2,       Libra: 1,       Scorpio: 4,
  Sagittarius: 3, Capricorn: 2,   Aquarius: 1,    Pisces: 4,
};

/** Gana (temperament) of each sign */
export const SIGN_GANA: Record<Sign, string> = {
  Aries: 'Deva',      Taurus: 'Manushya', Gemini: 'Deva',     Cancer: 'Deva',
  Leo: 'Deva',        Virgo: 'Manushya',  Libra: 'Deva',      Scorpio: 'Rakshasa',
  Sagittarius: 'Deva', Capricorn: 'Rakshasa', Aquarius: 'Deva', Pisces: 'Deva',
};

/** Element of each sign */
export const SIGN_ELEMENT: Record<Sign, string> = {
  Aries: 'Fire',   Taurus: 'Earth', Gemini: 'Air',   Cancer: 'Water',
  Leo: 'Fire',     Virgo: 'Earth',  Libra: 'Air',    Scorpio: 'Water',
  Sagittarius: 'Fire', Capricorn: 'Earth', Aquarius: 'Air', Pisces: 'Water',
};

/** Get zodiac sign name from sidereal longitude */
export function signFromLon(lon: number): Sign {
  return SIGNS[Math.floor(((lon % 360) + 360) % 360 / 30)];
}

/** Get degree within the sign (0–29.99°) */
export function degreeInSign(lon: number): number {
  return ((lon % 30) + 30) % 30;
}

/**
 * Navamsa (D9) sign index (0=Aries…11=Pisces) for a sidereal longitude.
 * Parashari: a sign's 9 navamsas begin from a sign set by its element —
 * fire→Aries, earth→Capricorn, air→Libra, water→Cancer.
 */
export function navamsaSign(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(l / 30) % 12;
  const within = Math.min(8, Math.floor((l % 30) / (30 / 9))); // 0..8
  const start = [0, 9, 6, 3][signIdx % 4]; // fire, earth, air, water
  return (start + within) % 12;
}

/** Degree within the navamsa sub-division, scaled to 0–30°. */
export function navamsaDegree(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  return ((l % (30 / 9)) / (30 / 9)) * 30;
}

/**
 * Dasamsa (D10) sign index — career & profession. Each 3° amsa; odd signs count
 * from the sign itself, even signs from the 9th sign from it.
 */
export function dasamsaSign(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(l / 30) % 12;
  const k = Math.min(9, Math.floor((l % 30) / 3)); // 0..9
  const oddSign = signIdx % 2 === 0; // index 0 (Aries) = 1st sign = odd
  const start = oddSign ? signIdx : (signIdx + 8) % 12;
  return (start + k) % 12;
}

/**
 * Shashtiamsa (D60) sign index — past-life karma; the finest division and the
 * most birth-time sensitive (each amsa is 0.5° ≈ 2 minutes of birth time).
 */
export function shashtiamsaSign(lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(l / 30) % 12;
  const deg = l % 30;
  return (signIdx + Math.floor(deg * 2)) % 12;
}

// ─── Nakshatras ───────────────────────────────────────────────────────────────

export interface NakshatraData {
  name: string;
  lord: string;   // Vimshottari dasha ruler
  years: number;  // Dasha duration in years
  gana: string;   // Deva / Manushya / Rakshasa
  yoni: string;   // Animal symbol
  gender: string; // M / F
}

export const NAKSHATRAS: NakshatraData[] = [
  { name: 'Ashwini',              lord: 'Ketu',    years: 7,  gana: 'Deva',      yoni: 'Horse',    gender: 'M' },
  { name: 'Bharani',              lord: 'Venus',   years: 20, gana: 'Manushya',  yoni: 'Elephant', gender: 'M' },
  { name: 'Krittika',             lord: 'Sun',     years: 6,  gana: 'Rakshasa',  yoni: 'Sheep',    gender: 'F' },
  { name: 'Rohini',               lord: 'Moon',    years: 10, gana: 'Manushya',  yoni: 'Serpent',  gender: 'M' },
  { name: 'Mrigashira',           lord: 'Mars',    years: 7,  gana: 'Deva',      yoni: 'Serpent',  gender: 'F' },
  { name: 'Ardra',                lord: 'Rahu',    years: 18, gana: 'Manushya',  yoni: 'Dog',      gender: 'F' },
  { name: 'Punarvasu',            lord: 'Jupiter', years: 16, gana: 'Deva',      yoni: 'Cat',      gender: 'M' },
  { name: 'Pushya',               lord: 'Saturn',  years: 19, gana: 'Deva',      yoni: 'Sheep',    gender: 'M' },
  { name: 'Ashlesha',             lord: 'Mercury', years: 17, gana: 'Rakshasa',  yoni: 'Cat',      gender: 'F' },
  { name: 'Magha',                lord: 'Ketu',    years: 7,  gana: 'Rakshasa',  yoni: 'Rat',      gender: 'F' },
  { name: 'Purva Phalguni',       lord: 'Venus',   years: 20, gana: 'Manushya',  yoni: 'Rat',      gender: 'F' },
  { name: 'Uttara Phalguni',      lord: 'Sun',     years: 6,  gana: 'Manushya',  yoni: 'Cow',      gender: 'M' },
  { name: 'Hasta',                lord: 'Moon',    years: 10, gana: 'Deva',      yoni: 'Buffalo',  gender: 'M' },
  { name: 'Chitra',               lord: 'Mars',    years: 7,  gana: 'Rakshasa',  yoni: 'Tiger',    gender: 'F' },
  { name: 'Swati',                lord: 'Rahu',    years: 18, gana: 'Deva',      yoni: 'Buffalo',  gender: 'F' },
  { name: 'Vishakha',             lord: 'Jupiter', years: 16, gana: 'Rakshasa',  yoni: 'Tiger',    gender: 'F' },
  { name: 'Anuradha',             lord: 'Saturn',  years: 19, gana: 'Deva',      yoni: 'Rabbit',   gender: 'M' },
  { name: 'Jyeshtha',             lord: 'Mercury', years: 17, gana: 'Rakshasa',  yoni: 'Rabbit',   gender: 'F' },
  { name: 'Mula',                 lord: 'Ketu',    years: 7,  gana: 'Rakshasa',  yoni: 'Dog',      gender: 'M' },
  { name: 'Purva Ashadha',        lord: 'Venus',   years: 20, gana: 'Manushya',  yoni: 'Monkey',   gender: 'M' },
  { name: 'Uttara Ashadha',       lord: 'Sun',     years: 6,  gana: 'Manushya',  yoni: 'Mongoose', gender: 'F' },
  { name: 'Shravana',             lord: 'Moon',    years: 10, gana: 'Deva',      yoni: 'Monkey',   gender: 'M' },
  { name: 'Dhanishtha',           lord: 'Mars',    years: 7,  gana: 'Rakshasa',  yoni: 'Lion',     gender: 'F' },
  { name: 'Shatabhisha',          lord: 'Rahu',    years: 18, gana: 'Rakshasa',  yoni: 'Horse',    gender: 'M' },
  { name: 'Purva Bhadrapada',     lord: 'Jupiter', years: 16, gana: 'Manushya',  yoni: 'Lion',     gender: 'M' },
  { name: 'Uttara Bhadrapada',    lord: 'Saturn',  years: 19, gana: 'Manushya',  yoni: 'Cow',      gender: 'F' },
  { name: 'Revati',               lord: 'Mercury', years: 17, gana: 'Deva',      yoni: 'Elephant', gender: 'F' },
];

/** Each nakshatra spans 360°/27 ≈ 13.333° */
export const NAKSHATRA_SPAN = 360 / 27;

/** Get nakshatra index (0–26) from sidereal longitude */
export function nakshatraIndex(lon: number): number {
  const n = ((lon % 360) + 360) % 360;
  return Math.min(Math.floor(n / NAKSHATRA_SPAN), 26);
}

/** Get Nakshatra data from sidereal longitude */
export function nakshatraFromLon(lon: number): NakshatraData {
  return NAKSHATRAS[nakshatraIndex(lon)];
}

/** Get pada (quarter 1–4) within a nakshatra */
export function nakshatraPada(lon: number): number {
  const n = ((lon % 360) + 360) % 360;
  const posInNak = n % NAKSHATRA_SPAN;
  return Math.floor(posInNak / (NAKSHATRA_SPAN / 4)) + 1;
}

// ─── House System (Whole Sign / Sāmya Bhava) ─────────────────────────────────

/**
 * Assign a house number (1–12) to a planet given its sidereal longitude
 * and the sidereal ascendant longitude.
 *
 * Uses Whole Sign houses (most common in traditional Jyotish):
 * The sign of the ascendant is the 1st house; each subsequent sign is the next house.
 */
export function houseFromLon(planetSiderealLon: number, ascSiderealLon: number): number {
  const ascSign = Math.floor(((ascSiderealLon % 360) + 360) % 360 / 30);
  const planetSign = Math.floor(((planetSiderealLon % 360) + 360) % 360 / 30);
  return ((planetSign - ascSign + 12) % 12) + 1;
}

/** Get the sidereal sign occupying a given house number */
export function signOfHouse(house: number, ascSiderealLon: number): Sign {
  const ascSignIdx = Math.floor(((ascSiderealLon % 360) + 360) % 360 / 30);
  const signIdx = (ascSignIdx + house - 1) % 12;
  return SIGNS[signIdx];
}

// ─── Remedies ─────────────────────────────────────────────────────────────────

const NAKSHATRA_GEMSTONE: Record<string, string> = {
  Ketu:    'Cat\'s Eye',
  Venus:   'Diamond',
  Sun:     'Ruby',
  Moon:    'Pearl',
  Mars:    'Red Coral',
  Rahu:    'Hessonite (Gomed)',
  Jupiter: 'Yellow Sapphire',
  Saturn:  'Blue Sapphire',
  Mercury: 'Emerald',
};

const NAKSHATRA_MANTRA: Record<string, string> = {
  Ketu:    'Om Ketave Namah — chant 108 times daily',
  Venus:   'Om Shukraya Namah — chant 108 times on Fridays',
  Sun:     'Om Suryaya Namah — chant 108 times at sunrise',
  Moon:    'Om Chandraya Namah — chant 108 times on Mondays',
  Mars:    'Om Mangalaya Namah — chant 108 times on Tuesdays',
  Rahu:    'Om Rahave Namah — chant 108 times on Saturdays',
  Jupiter: 'Om Gurave Namah — chant 108 times on Thursdays',
  Saturn:  'Om Shanaye Namah — chant 108 times on Saturdays',
  Mercury: 'Om Budhaya Namah — chant 108 times on Wednesdays',
};

const NAKSHATRA_CHARITY: Record<string, string> = {
  Ketu:    'Donate sesame seeds, blankets, or iron items',
  Venus:   'Donate white sweets, rice, or silk to young women',
  Sun:     'Donate wheat, jaggery, or copper on Sundays',
  Moon:    'Donate white rice, milk, or silver on Mondays',
  Mars:    'Donate red lentils, copper, or coral on Tuesdays',
  Rahu:    'Donate black sesame, mustard oil, or blankets',
  Jupiter: 'Donate yellow gram, turmeric, or gold on Thursdays',
  Saturn:  'Donate black sesame, iron, or oil on Saturdays',
  Mercury: 'Donate green gram, emerald, or bronze on Wednesdays',
};

const NAKSHATRA_FASTING: Record<string, string> = {
  Ketu:    'Fast on Tuesdays and Saturdays',
  Venus:   'Fast on Fridays',
  Sun:     'Fast on Sundays',
  Moon:    'Fast on Mondays',
  Mars:    'Fast on Tuesdays',
  Rahu:    'Fast on Saturdays',
  Jupiter: 'Fast on Thursdays',
  Saturn:  'Fast on Saturdays',
  Mercury: 'Fast on Wednesdays',
};

/** Get remedies for a nakshatra lord */
export function getRemedies(nakshatraLord: string): Array<{ title: string; description: string; type: string }> {
  return [
    { title: 'Gemstone',  description: NAKSHATRA_GEMSTONE[nakshatraLord]  ?? 'Consult an astrologer for your lucky gemstone',   type: 'gemstone' },
    { title: 'Mantra',    description: NAKSHATRA_MANTRA[nakshatraLord]    ?? 'Chant your nakshatra deity mantra 108 times daily', type: 'mantra'   },
    { title: 'Charity',   description: NAKSHATRA_CHARITY[nakshatraLord]   ?? 'Donate on the day ruled by your lagna lord',        type: 'charity'  },
    { title: 'Fasting',   description: NAKSHATRA_FASTING[nakshatraLord]   ?? 'Observe fast on your ruling planet\'s day',         type: 'fasting'  },
  ];
}
